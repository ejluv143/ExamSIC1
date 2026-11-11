// Talking to Examinus Desktop. The shell gives the web app no Tauri APIs; the page navigates to
// `examinus-desktop://<signal>` and the shell swallows the navigation and acts on it (apps/desktop, lib.rs).

export type DesktopSignal = "lock" | "unlock" | "exit" | "lockdown-enter" | "lockdown-exit";

// The shell sets this before any page script runs, on every page it loads; a browser tab never has it.
export const inDesktop = () => typeof window !== "undefined" && "__EXAMINUS_DESKTOP__" in window;

export const signalDesktop = (name: DesktopSignal) => location.assign(`examinus-desktop://${name}`);

declare global {
  interface Window {
    // Called by the shell when the student tried to close the app while locked and the session has an exit password.
    __examinusExitRequested?: () => void;
    // Called by the shell when the student tried to close the app while locked and there is no exit password.
    __examinusLeaveRequested?: () => void;
    // Called by the shell with an integrity event type only it can know (it let go of the window on its own).
    __examinusLockdownEvent?: (type: string) => void;
  }
}
