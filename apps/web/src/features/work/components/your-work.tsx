"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { CheckCircle2, FileText, Link2, Loader2, Plus, X } from "lucide-react";
import { assetRef } from "@examinus/domain/asset";
import { cleanAttachment, maxAttachments, type Attachment } from "@examinus/domain/classes";
import { submissionStatusLabel, type MyWork } from "@examinus/domain/submissions";
import { formatDateTime } from "@examinus/copy/time";
import { Badge, Button, inputClass } from "@/components/ui";
import { uploadFile } from "@/features/assets/upload-file";
import { AttachmentList } from "@/features/classes/components/announcements";
import { turnInAction, unsubmitAction } from "../actions";

const tone = { assigned: "neutral", missing: "danger", turned_in: "success", returned: "info" } as const;

// The student's own work on an assignment or activity: attach files and links, turn in, or take it back.
export function YourWork({ classId, announcementId, work }: { classId: string; announcementId: string; work: MyWork }) {
  const turnedIn = work.status === "turned_in" || work.status === "returned";
  const locked = work.status === "returned";
  const [attachments, setAttachments] = useState<Attachment[]>([...work.attachments]);
  const [link, setLink] = useState("");
  // The "Add or create" panel: a file or a link.
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(turnInAction.bind(null, classId, announcementId), undefined);
  const [taking, startTaking] = useTransition();

  async function choose(f: File) {
    setError(null);
    setUploading(true);
    try {
      const up = await uploadFile(f);
      setAttachments((all) => [...all, { kind: "file", url: assetRef(up.assetId), title: up.name }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The file couldn't be uploaded.");
    } finally {
      setUploading(false);
    }
  }
  function addLink() {
    const a = cleanAttachment("link", link, "");
    if (!a) return setError("Enter a web address that starts with http:// or https://.");
    setError(null);
    setAttachments((all) => [...all, a]);
    setLink("");
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Your Work</h2>
        <Badge tone={tone[work.status]}>
          {submissionStatusLabel[work.status]}
          {work.late && " late"}
        </Badge>
      </div>
      {work.turnedInAt && <p className="mt-1 text-xs text-muted">Turned in {formatDateTime(work.turnedInAt)}</p>}

      {work.status === "returned" && (
        <p className="mt-3 rounded-xl bg-info-soft p-3 text-sm">
          Your teacher returned this.{" "}
          {work.score !== null ? (
            <span className="font-semibold">
              Grade: {work.score}
              {work.points !== null && ` / ${work.points}`}
            </span>
          ) : (
            "No grade was given."
          )}
        </p>
      )}

      {turnedIn ? (
        <>
          <AttachmentList attachments={work.attachments} />
          {work.attachments.length === 0 && <p className="mt-3 text-sm text-muted">You marked this as done.</p>}
          {!locked && (
            <div className="mt-4">
              <Button type="button" variant="secondary" disabled={taking} onClick={() => startTaking(async () => void (await unsubmitAction(classId, announcementId)))}>
                {taking ? "Taking back…" : "Unsubmit"}
              </Button>
              <p className="mt-1 text-xs text-muted">Unsubmit to change your work. Turn it in again afterwards.</p>
            </div>
          )}
        </>
      ) : !work.accepting ? (
        <p className="mt-3 text-sm text-muted">Your teacher isn&apos;t taking submissions for this anymore.</p>
      ) : (
        <form action={action} className="mt-3 space-y-3">
          <input type="hidden" name="attachments" value={JSON.stringify(attachments)} />
          {attachments.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Attached files ({attachments.length})</p>
              <ul className="space-y-2">
                {attachments.map((a, i) => (
                  <li key={`${a.url}-${i}`} className="flex items-center gap-3 rounded-xl bg-primary-soft/60 p-2.5 text-sm">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      {a.kind === "file" ? <FileText className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{a.title || a.url}</span>
                      <span className="block truncate text-xs text-muted">{a.kind === "file" ? "File" : "Link"}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${a.title || a.url}`}
                      onClick={() => setAttachments((all) => all.filter((_, j) => j !== i))}
                      className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <input ref={file} type="file" hidden onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} />
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            disabled={attachments.length >= maxAttachments}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-soft/60 py-3 text-sm font-semibold text-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} Add or create
          </button>
          {adding && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <Button type="button" variant="secondary" className="w-full" disabled={uploading} onClick={() => file.current?.click()}>
                <FileText className="size-4" aria-hidden /> Upload a file
              </Button>
              <div className="flex gap-2">
                <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Or paste a link" className={`${inputClass} min-w-0 flex-1`} />
                <Button type="button" variant="ghost" onClick={addLink} disabled={!link.trim()}>
                  Add link
                </Button>
              </div>
            </div>
          )}

          {(error || (state && "error" in state)) && (
            <p role="alert" className="text-sm text-danger">
              {error ?? (state && "error" in state ? state.error : "")}
            </p>
          )}
          <Button type="submit" className="w-full py-3" disabled={pending || uploading}>
            <CheckCircle2 className="size-4" aria-hidden />
            {pending ? "Turning in…" : attachments.length === 0 ? "Mark as done" : "Turn in"}
          </Button>
          <p className="text-center text-xs text-muted">
            {attachments.length === 0
              ? "Nothing attached: it will be marked as done."
              : `${attachments.length} ${attachments.length === 1 ? "attachment" : "attachments"} will be submitted for grading.`}
          </p>
        </form>
      )}
    </section>
  );
}
