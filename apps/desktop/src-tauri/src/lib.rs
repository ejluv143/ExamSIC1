//! Examinus Desktop: one window that shows the hosted web app and nothing else. The shell adds what a browser tab
//! can't: it identifies itself (user agent and a frozen `window.__EXAMINUS_DESKTOP__`), keeps navigation inside the
//! web app (anything else opens in the system browser), checks GitHub for a newer release, shows its own page
//! only while the web app can't be reached, and holds the window open during an attempt until the web app says the
//! exit password was accepted. The web app gets no Tauri APIs: it is a remote origin with no capability. It talks to
//! the shell only by navigating to `examinus-desktop://<signal>` URLs, which the shell swallows (see `signal`).

mod config;
mod lockdown;
mod updates;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{
    AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_opener::OpenerExt;

use lockdown::{Lockdown, Signal, WindowRules};

/// The scheme the web app navigates to in order to talk to the shell; the navigation never happens.
const SIGNAL_SCHEME: &str = "examinus-desktop";

/// Whether closing the window needs the web app's say-so (an attempt is in progress and the session has an exit
/// password). Set by the `lock` and `unlock` signals, cleared by `exit`.
#[derive(Default)]
struct ExitLock(AtomicBool);

/// What the web app asked for through an `examinus-desktop://` URL.
/// - `lock`: closing now needs the exit password; `unlock`: it doesn't any more;
/// - `exit`: the password was accepted, close the window now.
/// - `lockdown-enter` (also the keep-alive, every few seconds) and `lockdown-exit`: see `lockdown.rs`.
fn signal(app: &AppHandle, lock: &ExitLock, lockdown: &Lockdown, url: &Url) {
    if let Some(requested) = lockdown::parse(url.host_str()) {
        return apply_signal(app, lockdown, requested);
    }
    match url.host_str() {
        Some("lock") => lock.0.store(true, Ordering::SeqCst),
        Some("unlock") => lock.0.store(false, Ordering::SeqCst),
        Some("exit") => {
            lock.0.store(false, Ordering::SeqCst);
            // The password was accepted: let go of the window rules too, or closing would be refused.
            if lockdown.exit() {
                if let Some(window) = app.get_webview_window(WINDOW) {
                    apply_rules(&window, lockdown::window_rules(false));
                }
            }
            if let Some(window) = app.get_webview_window(WINDOW) {
                let _ = window.close();
            }
        }
        _ => {}
    }
}

const WINDOW: &str = "main";

/// Applies a lockdown signal to the real window. Best effort: a platform that refuses a rule (Wayland ignores
/// always-on-top, say) must not stop the others, so each call's failure is ignored.
fn apply_signal(app: &AppHandle, lockdown: &Lockdown, requested: Signal) {
    let Some(window) = app.get_webview_window(WINDOW) else {
        return;
    };
    match requested {
        Signal::Enter => {
            let entered = lockdown.enter(Instant::now());
            if entered.newly_locked {
                apply_rules(&window, lockdown::window_rules(true));
            }
            if entered.report_exit {
                // The shell let go on its own while the page was gone: the page logs it for the teacher.
                let _ = window.eval(
                    "window.__examinusLockdownEvent && window.__examinusLockdownEvent('kiosk_exited')",
                );
            }
        }
        Signal::Exit => {
            if lockdown.exit() {
                apply_rules(&window, lockdown::window_rules(false));
            }
        }
    }
}

/// Puts the window into the given state. Locking turns the ways out off before going full screen, and releasing
/// gives them back after leaving it.
fn apply_rules(window: &WebviewWindow, rules: WindowRules) {
    if rules.fullscreen {
        let _ = window.set_resizable(rules.resizable);
        let _ = window.set_minimizable(rules.minimizable);
        let _ = window.set_maximizable(rules.maximizable);
        let _ = window.set_closable(rules.closable);
        let _ = window.set_always_on_top(rules.always_on_top);
        let _ = window.set_fullscreen(rules.fullscreen);
    } else {
        let _ = window.set_fullscreen(rules.fullscreen);
        let _ = window.set_always_on_top(rules.always_on_top);
        let _ = window.set_closable(rules.closable);
        let _ = window.set_maximizable(rules.maximizable);
        let _ = window.set_minimizable(rules.minimizable);
        let _ = window.set_resizable(rules.resizable);
    }
}

/// Set before any page script runs, on every page the shell loads. Frozen so page code can't change it. Links that
/// would open a new window navigate this one instead, so `on_navigation` decides where they go.
fn bridge_script(version: &semver::Version) -> String {
    format!(
        r#"(() => {{
  Object.defineProperty(window, "__EXAMINUS_DESKTOP__", {{
    value: Object.freeze({{ version: "{version}", platform: "{platform}" }}),
    writable: false, configurable: false, enumerable: true,
  }});
  window.open = (url) => {{ if (url) location.assign(String(url)); return null; }};
  document.addEventListener("click", (event) => {{
    const link = event.target instanceof Element ? event.target.closest("a[target]") : null;
    if (link && link.target !== "_self" && link.href) {{ event.preventDefault(); location.assign(link.href); }}
  }}, true);
}})();"#,
        platform = config::platform_name(),
    )
}

/// Navigation stays inside the web app's origin and the shell's own pages. A signal URL is handled and swallowed.
/// Anything else (a link in a question, the release page) opens in the system browser and this window stays where it is.
fn allow_navigation(
    app: &AppHandle,
    lock: &ExitLock,
    lockdown: &Lockdown,
    web_origin: &Url,
    url: &Url,
) -> bool {
    if url.scheme() == SIGNAL_SCHEME {
        signal(app, lock, lockdown, url);
        return false;
    }
    let same_app = url.origin() == web_origin.origin();
    // The connecting page: tauri://localhost on Linux and macOS, http://tauri.localhost on Windows.
    let own_page = (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"));
    if same_app || own_page {
        return true;
    }
    if matches!(url.scheme(), "http" | "https") {
        if let Err(e) = app.opener().open_url(url.as_str(), None::<&str>) {
            eprintln!("couldn't open {url} in the browser: {e}");
        }
    }
    false
}

/// Whether the web app answers. Any HTTP response counts: the point is that the window won't show a blank page.
async fn reachable(web_url: &Url) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    client.head(web_url.clone()).send().await.is_ok()
}

/// Loads the web app once it answers; otherwise tells the connecting page, which offers to try again.
fn connect(window: WebviewWindow, web_url: Url) {
    tauri::async_runtime::spawn(async move {
        if reachable(&web_url).await {
            if let Err(e) = window.navigate(web_url) {
                eprintln!("couldn't open the web app: {e}");
            }
        } else {
            let message = serde_json::to_string(&format!(
                "Can't reach {} right now.",
                web_url.host_str().unwrap_or("Examinus")
            ))
            .unwrap_or_else(|_| "\"Can't reach Examinus right now.\"".into());
            let _ = window.eval(format!(
                "window.examinusUnreachable && window.examinusUnreachable({message})"
            ));
        }
    });
}

/// From the connecting page's "Try again" button.
#[tauri::command]
fn retry(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window(WINDOW).ok_or("no window")?;
    connect(window, config::start_url(&config::web_url()?));
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![retry])
        .setup(|app| {
            let web_url = config::web_url()?;
            let version = app.package_info().version.clone();
            let handle = app.handle().clone();
            let web_origin = web_url.clone();
            let lock = Arc::new(ExitLock::default());
            let nav_lock = lock.clone();
            let lockdown = Arc::new(Lockdown::default());
            let nav_lockdown = lockdown.clone();
            let window =
                WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::App("index.html".into()))
                    .title("Examinus")
                    .inner_size(1280.0, 800.0)
                    .min_inner_size(960.0, 640.0)
                    .center()
                    .user_agent(&config::user_agent(&version))
                    .initialization_script(bridge_script(&version))
                    .on_navigation(move |url| {
                        allow_navigation(&handle, &nav_lock, &nav_lockdown, &web_origin, url)
                    })
                    .build()?;
            // While locked, closing (the title bar, Alt+F4, Cmd+Q) is refused and the web app is asked to show its
            // exit-password dialog instead; it answers with the `exit` signal once the password is accepted.
            let guarded = window.clone();
            let guard_lockdown = lockdown.clone();
            window.on_window_event(move |event| match event {
                WindowEvent::CloseRequested { api, .. } => {
                    if lock.0.load(Ordering::SeqCst) {
                        api.prevent_close();
                        let _ = guarded.eval(
                            "window.__examinusExitRequested && window.__examinusExitRequested()",
                        );
                    } else if guard_lockdown.is_locked() {
                        // No exit password: the page asks "Leave exam?" and releases the window if confirmed.
                        api.prevent_close();
                        let _ = guarded.eval(
                            "window.__examinusLeaveRequested && window.__examinusLeaveRequested()",
                        );
                    }
                }
                // Coming back to the window while locked: whatever was copied meanwhile is not kept.
                WindowEvent::Focused(true) if guard_lockdown.is_locked() => {
                    let _ = guarded.eval(
                        "navigator.clipboard && navigator.clipboard.writeText('').catch(() => {})",
                    );
                }
                _ => {}
            });
            // The watchdog: a page that stopped sending keep-alives (crashed, closed, lost) can't leave the student
            // locked in, so the shell lets go by itself after the grace period.
            let watch_app = app.handle().clone();
            let watch_lockdown = lockdown.clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(2));
                if watch_lockdown.expire(Instant::now()) {
                    if let Some(window) = watch_app.get_webview_window(WINDOW) {
                        apply_rules(&window, lockdown::window_rules(false));
                    }
                }
            });
            connect(window, config::start_url(&web_url));
            updates::offer_update(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Examinus Desktop couldn't start");
}
