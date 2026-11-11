"use client";

import { useActionState, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { Button, inputBase } from "@/components/ui";
import { Select } from "@/components/select";
import { Dialog } from "@/components/dialog";
import { joinClassAction, previewClassAction, type leaveClassAction } from "../actions";

// The code from the teacher; the first time, also their student number and sex for the teacher's grade sheet.
export function JoinClassForm({ firstJoin }: { firstJoin: boolean }) {
  const [state, action, pending] = useActionState(joinClassAction, undefined);
  const form = useRef<HTMLFormElement>(null);
  // Set once the student has said yes, so the form's next submit goes through to the API.
  const confirmed = useRef(false);
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState<Extract<Awaited<ReturnType<typeof previewClassAction>>, { ok: unknown }>["ok"] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Before joining, look the class up and ask "Do you want to join this class?".
  async function ask(e: React.FormEvent<HTMLFormElement>) {
    if (confirmed.current) {
      confirmed.current = false;
      return;
    }
    e.preventDefault();
    setPreviewError(null);
    setChecking(true);
    const code = String(new FormData(e.currentTarget).get("code") ?? "");
    const result = await previewClassAction(code);
    setChecking(false);
    if ("error" in result) setPreviewError(result.error ?? "That class couldn't be found.");
    else setPreview(result.ok);
  }

  return (
    <form ref={form} action={action} onSubmit={ask} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Class code</span>
          <input
            name="code"
            required
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="e.g. DBMS3AX"
            className={`${inputBase} w-44 font-mono tracking-widest uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case`}
          />
        </label>
        {firstJoin && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Student number</span>
            <input
              name="studentNumber"
              required
              maxLength={40}
              autoComplete="off"
              placeholder="e.g. 2023-10537"
              className={`${inputBase} w-44`}
            />
          </label>
        )}
        {firstJoin && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Sex</span>
            <Select
              name="sex"
              required
              defaultValue=""
              placeholder="Choose"
              className="w-36"
              options={[
                { value: "F", label: "Female" },
                { value: "M", label: "Male" },
              ]}
            />
          </label>
        )}
        <Button type="submit" disabled={pending || checking}>
          {pending ? "Joining…" : checking ? "Checking…" : "Join class"}
        </Button>
      </div>
      {firstJoin && (
        <p className="text-xs text-muted">
          Your student number (as on your school ID) and sex are asked once, for your teachers&apos; grade sheets.
        </p>
      )}
      {previewError && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {previewError}
        </p>
      )}
      <Dialog
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview?.joined ? "You're already in this class" : "Do you want to join this class?"}
        description={preview?.joined ? undefined : "Check that this is the right class. Joining adds you to its roster, and your teacher will see your name and student number."}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setPreview(null)}>
              Cancel
            </Button>
            {!preview?.joined && (
              <Button
                type="button"
                onClick={() => {
                  confirmed.current = true;
                  setPreview(null);
                  form.current?.requestSubmit();
                }}
              >
                Yes, join class
              </Button>
            )}
          </>
        }
      >
        {preview && (
          <div className="space-y-1 text-sm">
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">
              {preview.courseCode} · {preview.section}
            </p>
            <p className="text-lg font-semibold">{preview.title}</p>
            <p className="text-muted">Teacher: {preview.teacher}</p>
            <p className="text-muted">
              {[preview.schedule, preview.room, preview.term].filter(Boolean).join(" · ")} · {preview.units} units
            </p>
          </div>
        )}
      </Dialog>
      {state && "error" in state && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state && "joined" in state && (
        <p role="status" className="rounded-lg bg-success-soft p-3 text-sm text-success">
          You&apos;ve joined the class. You&apos;re now working in that class&apos;s space.
        </p>
      )}
    </form>
  );
}

export function LeaveClassButton({ title, leave }: { title: string; leave: () => ReturnType<typeof leaveClassAction> }) {
  const [state, action, pending] = useActionState(leave, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Leave ${title}? Your teacher can still see the work you submitted.`)) e.preventDefault();
      }}
    >
      <Button type="submit" variant="ghost" className="px-2 py-1 text-muted" disabled={pending}>
        <LogOut className="size-3.5" aria-hidden /> Leave
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
