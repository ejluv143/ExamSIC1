# Spec: Desktop lockdown during an attempt (D2, issue #121)

Status: APPROVED (open-question answers = the proposals below). Source: `docs/native-clients-plan.md` §D2, issue #121.

## Objective

While a student has an attempt in progress in **Examinus Desktop** (the Tauri shell in `apps/desktop`), the shell holds the
student inside the exam and reports every way they try to leave as an integrity event the teacher already sees.

Users: students taking a lockdown exam in the desktop app; teachers watching the live view and the integrity report.

The web app tells the shell when to start and stop (it knows when an attempt starts, is submitted, the session ends or the
teacher force-submits). The shell enforces what the operating system allows and reports the rest.

### Acceptance criteria

1. **Enter and release.** The web app asks the shell to enter lockdown when an attempt starts or resumes, and to release it
   when the attempt is submitted, the session ends, the teacher force-submits (student live stream), or the student leaves
   through the exit-password flow. Releasing always works, even if the page crashed (see "Failure and recovery").
2. **Window lockdown** (all three desktop platforms): fullscreen kiosk, always on top, minimise, maximise, resize and close
   refused, developer tools off, context menu off.
3. **Shortcuts.** Every shortcut the OS lets us swallow (Alt+Tab, Win, Cmd+Tab, Cmd+H, PrintScreen) is intercepted and
   reported as an existing event type: `alt_tab`, `switched_app`, `exit_fullscreen`, `screenshot`. Shortcuts the OS does
   not let us swallow are detected after the fact (focus lost, window left fullscreen) and reported the same way.
4. **Clipboard** is cleared when lockdown starts and kept empty while it lasts.
5. **Live view.** A student cannot leave the window without the matching event appearing in the teacher's live view.
6. **Release.** The shell releases lockdown on submit, session end and force-submit, restoring a normal window.
7. A platform that cannot enforce a part says so: the shell reports what it can enforce, and the teacher's report shows
   it (so a Linux/Wayland machine is not silently treated as fully locked).

## Assumptions (correct me)

1. The web app keeps talking to the shell only by `examinus-desktop://<signal>` navigations (no Tauri APIs for the remote
   origin), as `lock`/`unlock`/`exit` do today. New signals: `lockdown-enter` and `lockdown-exit`.
2. The shell reports events back by calling a page function, as `__examinusExitRequested` does today:
   `window.__examinusLockdownEvent?.(type, detail)`. The web app turns these into the existing integrity events through
   the existing `sensors` path; no new RPCs are needed for D2.
3. All event types needed already exist (`alt_tab`, `switched_app`, `exit_fullscreen`, `screenshot`, `kiosk_exited`).
4. The existing exit-password flow keeps working: with lockdown on, close is refused and the web app shows its password
   dialog; the right password sends `exit`.
5. Windows and macOS shortcut swallowing is real (Windows low-level keyboard hook; macOS application presentation
   options). Linux X11 can grab keys; **Linux Wayland cannot swallow them**, only detect and report.
6. No new dependency without asking, except the platform crates Tauri already needs for these APIs (to be listed in the
   plan before adding).

## Commands

```
Desktop dev:      npm run dev:desktop            (from repo root; needs the Tauri prerequisites)
Rust check:       cd apps/desktop/src-tauri && cargo check
Rust lint:        cd apps/desktop/src-tauri && cargo clippy -- -D warnings
Rust format:      cd apps/desktop/src-tauri && cargo fmt --check
Rust tests:       cd apps/desktop/src-tauri && cargo test
Web typecheck:    npm run typecheck
Web/API tests:    npm test                       (bun test packages apps/rpc/src apps/web/src)
Desktop build:    npm run build:desktop
```

## Project structure

```
apps/desktop/src-tauri/src/lib.rs        → builder, window events, bridge script, signals (existing)
apps/desktop/src-tauri/src/lockdown.rs   → NEW: Lockdown state, enter/exit, window rules, clipboard
apps/desktop/src-tauri/src/shortcuts/    → NEW: windows.rs, macos.rs, linux.rs (platform hooks), mod.rs (trait + fallback)
apps/web/src/lib/platform/               → DesktopPlatform lockdown.enter/exit + sensors fed by the shell's events
apps/web/src/features/attempt/components/desktop-exit-lock.tsx   → existing exit-password dialog (kept)
docs/native-clients-plan.md              → mark D2 done and record what each platform can enforce
```

## Code style

Match `lib.rs`: small functions with `///` doc comments saying why, `AtomicBool` state shared through `Arc`, no `unwrap` in
runtime paths (use `let _ =` for best-effort window calls and log failures), one module per concern.

```rust
/// Whether the attempt is locked down. Set by the `lockdown-enter` and `lockdown-exit` signals; every window rule and
/// shortcut hook checks it, so releasing is one store.
#[derive(Default)]
struct Lockdown(AtomicBool);
```

Web side: typed signal helper like `desktop-exit-lock.tsx`, one place that maps shell events to integrity events.

## Testing strategy

- **Rust unit tests** (`cargo test`): the state machine (enter/exit/idempotence, release on every release signal), the
  signal parser, and the event mapping from key combination to event type. Keep OS calls behind a trait so these run
  without a display.
- **Web unit tests** (`bun test`): `DesktopPlatform.lockdown.enter/exit` sends the right signals; shell events become
  the right integrity events; nothing happens outside the desktop shell.
- **Manual, per platform** (cannot be automated): launch with `npm run dev:desktop`, start an exam, try each way out
  (Alt+Tab, Win/Cmd, minimise, resize, close, PrintScreen, right-click, devtools, paste an old clipboard) and confirm the
  live view shows the event; submit and confirm the window is released. Record the result per OS in the PR.
- No claim of "works on Windows/macOS" without testing on that OS. This machine is Linux only.

## Boundaries

- **Always:** release lockdown on every end path; fail open on shell errors (never trap a student in a window that can't
  be closed); report what the platform can't enforce; keep the remote web origin free of Tauri API access.
- **Ask first:** new Rust crates; changing `capabilities` or `tauri.conf.json` security settings; adding new RPCs or
  integrity event types; anything that reads the student's other windows or processes (that is D3).
- **Never:** grant the web origin Tauri IPC; disable the OS's own emergency exits (Ctrl+Alt+Del, the power button); run
  lockdown when no attempt is in progress; ship untested OS hooks as "supported".

## Success criteria

- On Linux (this machine): a locked attempt shows fullscreen, always-on-top, resize/minimise/close refused, devtools and
  context menu off, and leaving focus produces `alt_tab` or `switched_app` in the live view; submitting releases it.
- `cargo check`, `cargo clippy -D warnings`, `cargo fmt --check` and `cargo test` pass; `npm run typecheck` and `npm test`
  pass.
- Windows and macOS code compiles in CI (cross-check) and is marked "untested on hardware" in the plan until someone runs
  the manual checklist there.

## Failure and recovery

- Page crash, reload or network loss while locked: the shell keeps the lockdown for a short grace period, then releases if
  the web app has not re-sent `lockdown-enter` (a student stuck with a dead page must be able to leave; the report records
  `kiosk_exited`).
- Shell crash: nothing persists; the next start is unlocked.

## Decisions (approved)

1. **No exit password:** the shell shows nothing itself; closing is refused and asks the web app for a "Leave exam" confirm.
   Confirming records `kiosk_exited` and releases the window (the attempt stays in progress). With an exit password the
   existing password dialog is used.
2. **PR split:** PR 1 = window lockdown, clipboard, grace period, web wiring (testable on Linux); PR 2 = Windows shortcut
   swallowing; PR 3 = macOS presentation options.
3. **Linux Wayland:** detect and report only; the system report shows the reduced enforcement.
4. **Grace period:** 10 seconds. The web app re-sends `lockdown-enter` every 5 s as a keep-alive; if none arrives for 10 s
   the shell releases and reports `kiosk_exited` when the page next enters.

## Design notes from reading the code

- Focus loss, tab/app switching and full-screen exit are already detected by the web sensors inside the webview, so the
  shell does **not** report them again (that would double-count). The shell reports only what the page cannot know:
  `kiosk_exited` (released by timeout or "Leave exam").
- Clipboard: the web app's existing `clearClipboardOnStart` setting clears it at start; the shell re-clears it from the
  page when the window regains focus while locked. No clipboard crate is added.
- Lockdown is active when the attempt is in progress, the client is the desktop shell and the session requires full screen.
