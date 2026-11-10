//! Lockdown while an attempt is in progress (issue #121, spec: SPEC-desktop-lockdown.md).
//!
//! The web app asks for it with the `lockdown-enter` signal and keeps asking every few seconds (a keep-alive);
//! `lockdown-exit` releases it. If the keep-alives stop (the page crashed or was closed under us) the shell releases
//! by itself after [`GRACE`], so a student can never be stuck in a window nothing is looking after, and remembers to
//! report `kiosk_exited` the next time the page asks to lock. All of the state and the decisions are here and need no
//! window, so they run in plain unit tests; `lib.rs` applies them to the real window.

use std::sync::Mutex;
use std::time::{Duration, Instant};

/// How long without a keep-alive before the shell lets go. The web app sends one every 5 seconds.
pub const GRACE: Duration = Duration::from_secs(10);

/// What the web app asked for through an `examinus-desktop://` URL, for the lockdown signals.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Signal {
    Enter,
    Exit,
}

/// The lockdown signal named by the URL's host, or None for any other signal.
pub fn parse(host: Option<&str>) -> Option<Signal> {
    match host {
        Some("lockdown-enter") => Some(Signal::Enter),
        Some("lockdown-exit") => Some(Signal::Exit),
        _ => None,
    }
}

/// What the window must look like. One place decides, so entering and releasing can't drift apart.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub struct WindowRules {
    pub fullscreen: bool,
    pub always_on_top: bool,
    pub resizable: bool,
    pub minimizable: bool,
    pub maximizable: bool,
    pub closable: bool,
}

pub fn window_rules(locked: bool) -> WindowRules {
    WindowRules {
        fullscreen: locked,
        always_on_top: locked,
        resizable: !locked,
        minimizable: !locked,
        maximizable: !locked,
        closable: !locked,
    }
}

#[derive(Default)]
struct State {
    locked: bool,
    last_seen: Option<Instant>,
    /// The shell released on its own (grace period) and the page has not been told yet.
    pending_exit: bool,
}

/// What an `Enter` signal changed.
#[derive(Debug, PartialEq, Eq)]
pub struct Entered {
    /// This call started the lockdown (as opposed to a keep-alive); the window rules must be applied.
    pub newly_locked: bool,
    /// The shell had released by itself since the last time: the page should log `kiosk_exited`.
    pub report_exit: bool,
}

#[derive(Default)]
pub struct Lockdown(Mutex<State>);

impl Lockdown {
    fn state(&self) -> std::sync::MutexGuard<'_, State> {
        // A poisoned lock only means another thread panicked mid-update; the flags are still usable.
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn is_locked(&self) -> bool {
        self.state().locked
    }

    /// `lockdown-enter`: starts the lockdown, or counts as a keep-alive when it is already on.
    pub fn enter(&self, now: Instant) -> Entered {
        let mut state = self.state();
        let newly_locked = !state.locked;
        state.locked = true;
        state.last_seen = Some(now);
        let report_exit = std::mem::take(&mut state.pending_exit);
        Entered {
            newly_locked,
            report_exit,
        }
    }

    /// `lockdown-exit`: releases. Returns whether it was locked (so the window rules need undoing).
    pub fn exit(&self) -> bool {
        let mut state = self.state();
        state.last_seen = None;
        std::mem::replace(&mut state.locked, false)
    }

    /// The watchdog: releases when no keep-alive has arrived within [`GRACE`]. Returns whether it released.
    pub fn expire(&self, now: Instant) -> bool {
        let mut state = self.state();
        let stale = state
            .last_seen
            .map_or(true, |seen| now.saturating_duration_since(seen) > GRACE);
        if state.locked && stale {
            state.locked = false;
            state.last_seen = None;
            state.pending_exit = true;
            return true;
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_only_the_lockdown_signals() {
        assert_eq!(parse(Some("lockdown-enter")), Some(Signal::Enter));
        assert_eq!(parse(Some("lockdown-exit")), Some(Signal::Exit));
        assert_eq!(parse(Some("lock")), None);
        assert_eq!(parse(Some("exit")), None);
        assert_eq!(parse(None), None);
    }

    #[test]
    fn locked_rules_close_every_way_out_and_released_rules_open_them() {
        let locked = window_rules(true);
        assert!(locked.fullscreen && locked.always_on_top);
        assert!(
            !locked.resizable && !locked.minimizable && !locked.maximizable && !locked.closable
        );
        let free = window_rules(false);
        assert!(!free.fullscreen && !free.always_on_top);
        assert!(free.resizable && free.minimizable && free.maximizable && free.closable);
    }

    #[test]
    fn enter_locks_once_and_later_enters_are_keep_alives() {
        let lock = Lockdown::default();
        let t = Instant::now();
        assert_eq!(
            lock.enter(t),
            Entered {
                newly_locked: true,
                report_exit: false
            }
        );
        assert!(lock.is_locked());
        assert_eq!(
            lock.enter(t),
            Entered {
                newly_locked: false,
                report_exit: false
            }
        );
    }

    #[test]
    fn exit_releases_and_is_idempotent() {
        let lock = Lockdown::default();
        assert!(!lock.exit(), "nothing to release when not locked");
        lock.enter(Instant::now());
        assert!(lock.exit());
        assert!(!lock.is_locked());
        assert!(!lock.exit());
    }

    #[test]
    fn keep_alives_hold_the_lock_past_the_grace_period() {
        let lock = Lockdown::default();
        let t = Instant::now();
        lock.enter(t);
        lock.enter(t + Duration::from_secs(8));
        assert!(
            !lock.expire(t + Duration::from_secs(15)),
            "8 s + 7 s since the last keep-alive is within the grace"
        );
        assert!(lock.is_locked());
    }

    #[test]
    fn silence_releases_after_the_grace_period_and_reports_once() {
        let lock = Lockdown::default();
        let t = Instant::now();
        lock.enter(t);
        assert!(
            !lock.expire(t + GRACE),
            "exactly the grace period is still locked"
        );
        assert!(lock.expire(t + GRACE + Duration::from_millis(1)));
        assert!(!lock.is_locked());
        assert!(
            !lock.expire(t + Duration::from_secs(60)),
            "already released"
        );
        // The page comes back and locks again: it is told once that the shell had let go.
        assert_eq!(
            lock.enter(t + Duration::from_secs(61)),
            Entered {
                newly_locked: true,
                report_exit: true
            }
        );
        assert_eq!(
            lock.enter(t + Duration::from_secs(66)),
            Entered {
                newly_locked: false,
                report_exit: false
            }
        );
    }

    #[test]
    fn a_deliberate_exit_leaves_nothing_to_report() {
        let lock = Lockdown::default();
        let t = Instant::now();
        lock.enter(t);
        lock.exit();
        assert_eq!(
            lock.enter(t + Duration::from_secs(1)),
            Entered {
                newly_locked: true,
                report_exit: false
            }
        );
    }
}
