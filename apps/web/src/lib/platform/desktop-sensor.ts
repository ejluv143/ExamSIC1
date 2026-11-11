import type { IntegritySensor } from "@examinus/taking/integrity";
import type { IntegrityEventType } from "@examinus/domain/quiz";

// The page and the shell tell each other about what only one of them can see. Focus, tabs and full screen are already
// watched by the web sensors inside the shell's window, so only these come from the shell (or the "Leave exam" dialog):
// `kiosk_exited`, the student left the locked window (they chose to, or the shell let go when the page went quiet).
const reportable: readonly string[] = ["kiosk_exited"];

// The "Leave exam" dialog reports through this window event, so the log's sensor is the only thing that records.
export const lockdownEventName = "examinus-lockdown-event";

export function reportLockdownEvent(type: IntegrityEventType) {
  window.dispatchEvent(new CustomEvent(lockdownEventName, { detail: type }));
}

export const desktopLockdownSensor: IntegritySensor = {
  start(emit) {
    const report = (type: unknown) => {
      if (typeof type === "string" && reportable.includes(type)) emit.record(type as IntegrityEventType);
    };
    const onEvent = (event: Event) => report((event as CustomEvent).detail);
    window.__examinusLockdownEvent = report;
    window.addEventListener(lockdownEventName, onEvent);
    return () => {
      delete window.__examinusLockdownEvent;
      window.removeEventListener(lockdownEventName, onEvent);
    };
  },
};
