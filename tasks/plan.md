# Plan: desktop lockdown, PR 1 (spec: SPEC-desktop-lockdown.md, issue #121)

Order: Rust state and signals -> window rules -> web wiring -> verify. Each task keeps `cargo check` / `npm run typecheck` green.

1. **lockdown.rs**: `Lockdown` state (locked flag, last keep-alive, pending `kiosk_exited`), pure `window_rules(locked)` and
   signal handling (`lockdown-enter` / `lockdown-exit`), unit-tested without a display.
2. **lib.rs**: apply the rules to the window (fullscreen, always on top, not resizable/minimizable/maximizable/closable),
   extend the close guard (lockdown refuses close and asks the page via `__examinusLeaveRequested`; the exit-password path
   stays), 10 s keep-alive watchdog, deliver pending `kiosk_exited`, re-clear clipboard on focus while locked.
3. **Web**: `DesktopLockdown` component (enter + 5 s keep-alive + exit, "Leave exam" confirm), `desktopSensor` mapping shell
   events to `emit.record`, wired in `web-platform.ts` and mounted in `student-exam.tsx`; unit tests.
4. **Docs**: mark D2 PR 1 in `docs/native-clients-plan.md`, what each platform enforces.
5. **Verify**: cargo check/clippy/fmt/test, npm run typecheck, npm test, a launch smoke test.

Risks: Wayland ignores always-on-top and some window hints (report, do not pretend); a dead page must not trap the student
(watchdog); only Linux can be tested here.
