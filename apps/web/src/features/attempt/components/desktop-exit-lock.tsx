"use client";

import { useEffect, useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import { Button, inputClass } from "@/components/ui";
import { inDesktop, signalDesktop } from "@/lib/platform/desktop";
import { verifyExitPassword } from "../actions";

// While an attempt is in progress in Examinus Desktop and the session has an exit password, the app refuses to
// close; trying opens this dialog, and the right password lets it close. Renders nothing in a browser.
export function DesktopExitLock({ sessionId, locked }: { sessionId: string; locked: boolean }) {
  const [asked, setAsked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const active = locked && inDesktop();

  useEffect(() => {
    if (!active) return;
    window.__examinusExitRequested = () => setAsked(true);
    signalDesktop("lock");
    return () => {
      delete window.__examinusExitRequested;
      signalDesktop("unlock");
    };
  }, [active]);

  if (!active || !asked) return null;

  function submit() {
    start(async () => {
      const result = await verifyExitPassword(sessionId, password);
      if ("error" in result) return setError(result.error);
      if (!result.ok.ok) return setError("That isn't the exit password.");
      signalDesktop("exit");
    });
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="exit-lock-title" className="fixed inset-0 z-[60] grid place-items-center bg-background/80 p-4">
      <form
        className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-surface p-5 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 id="exit-lock-title" className="flex items-center gap-2 text-lg font-semibold">
          <KeyRound className="size-5 text-primary" aria-hidden /> Exit password
        </h2>
        <p className="text-sm text-muted">Your attempt is still in progress. Your teacher types the exit password to let you close Examinus.</p>
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          aria-label="Exit password"
          autoComplete="off"
          className={`${inputClass} font-mono`}
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAsked(false)} disabled={pending}>
            Keep working
          </Button>
          <Button type="submit" disabled={pending || !password}>
            Close Examinus
          </Button>
        </div>
      </form>
    </div>
  );
}
