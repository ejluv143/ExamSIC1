"use client";

import { useEffect, useState } from "react";
import { DoorOpen } from "lucide-react";
import { Button } from "@/components/ui";
import { inDesktop, signalDesktop } from "@/lib/platform/desktop";
import { reportLockdownEvent } from "@/lib/platform/desktop-sensor";

// How often the page tells the shell it is still here. The shell lets go by itself after 10 seconds of silence, so a
// crashed or closed page can never leave the student locked in (apps/desktop, lockdown.rs).
const keepAliveMs = 5000;

// While an attempt is in progress in Examinus Desktop and the session needs full screen, the shell locks the window
// (full screen, on top, no minimise, resize or close). Closing it then opens this dialog instead (the exit-password
// dialog takes over when the session has a password). Leaving is allowed but recorded for the teacher. Renders nothing
// in a browser.
export function DesktopLockdown({ locked }: { locked: boolean }) {
  const [asked, setAsked] = useState(false);
  // The student chose to leave: stop locking again until the attempt changes.
  const [left, setLeft] = useState(false);
  const active = locked && !left && inDesktop();

  useEffect(() => {
    if (!active) return;
    window.__examinusLeaveRequested = () => setAsked(true);
    signalDesktop("lockdown-enter");
    const beat = setInterval(() => signalDesktop("lockdown-enter"), keepAliveMs);
    return () => {
      clearInterval(beat);
      delete window.__examinusLeaveRequested;
      signalDesktop("lockdown-exit");
    };
  }, [active]);

  if (!active || !asked) return null;

  function leave() {
    reportLockdownEvent("kiosk_exited");
    setAsked(false);
    setLeft(true);
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="leave-exam-title" className="fixed inset-0 z-[60] grid place-items-center bg-background/80 p-4">
      <div className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-surface p-5 shadow-lg">
        <h2 id="leave-exam-title" className="flex items-center gap-2 text-lg font-semibold">
          <DoorOpen className="size-5 text-primary" aria-hidden /> Leave the exam?
        </h2>
        <p className="text-sm text-muted">Your attempt stays open and your teacher is told that you left the locked window. You can still go back to finish.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAsked(false)}>
            Keep working
          </Button>
          <Button onClick={leave}>Leave exam</Button>
        </div>
      </div>
    </div>
  );
}
