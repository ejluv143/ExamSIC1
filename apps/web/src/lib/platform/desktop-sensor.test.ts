import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { IntegrityEmit } from "@examinus/taking/integrity";
import { desktopLockdownSensor, lockdownEventName, reportLockdownEvent } from "./desktop-sensor";

const emitter = () => {
  const recorded: string[] = [];
  const emit = { record: (type: string) => recorded.push(type) } as unknown as IntegrityEmit;
  return { emit, recorded };
};

const original = globalThis.window;
beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = new EventTarget();
});
afterEach(() => {
  (globalThis as unknown as { window: unknown }).window = original;
});

describe("desktopLockdownSensor", () => {
  test("logs kiosk_exited when the shell reports it", () => {
    const { emit, recorded } = emitter();
    const stop = desktopLockdownSensor.start(emit);
    window.__examinusLockdownEvent?.("kiosk_exited");
    expect(recorded).toEqual(["kiosk_exited"]);
    stop();
  });

  test("logs kiosk_exited from the Leave exam dialog's window event", () => {
    const { emit, recorded } = emitter();
    const stop = desktopLockdownSensor.start(emit);
    reportLockdownEvent("kiosk_exited");
    expect(recorded).toEqual(["kiosk_exited"]);
    stop();
  });

  test("ignores any other event type, so the shell can't make the page log arbitrary events", () => {
    const { emit, recorded } = emitter();
    const stop = desktopLockdownSensor.start(emit);
    window.__examinusLockdownEvent?.("vm_detected");
    window.__examinusLockdownEvent?.("");
    window.dispatchEvent(new CustomEvent(lockdownEventName, { detail: "alt_tab" }));
    expect(recorded).toEqual([]);
    stop();
  });

  test("stops listening when the sensor stops", () => {
    const { emit, recorded } = emitter();
    const stop = desktopLockdownSensor.start(emit);
    stop();
    expect(window.__examinusLockdownEvent).toBeUndefined();
    reportLockdownEvent("kiosk_exited");
    expect(recorded).toEqual([]);
  });
});
