"use client";

import { useActionState, useRef, useState } from "react";
import { FileText, Link2, Loader2, Pencil, Plus, Trash2, Upload, Users, X } from "lucide-react";
import { assetRef, fileAccept } from "@examinus/domain/asset";
import { cleanAttachment, maxAttachments, maxRubricRows, type Announcement, type Attachment, type RubricRow } from "@examinus/domain/classes";
import { fetchAssetUrls } from "@/features/assets/actions";
import { uploadFile } from "@/features/assets/upload-file";
import type { PostKind } from "@examinus/domain/classes";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { RichTextEditor } from "@/components/rich-text-editor";
import type { ClassFormState } from "../actions";

type Post = (prev: ClassFormState, formData: FormData) => Promise<ClassFormState>;

const copy = {
  announcement: { heading: "Announcement", placeholder: "Announce something to your class", submit: "Post" },
  assignment: { heading: "Assignment", placeholder: "Instructions (optional)", submit: "Assign" },
  activity: { heading: "Activity", placeholder: "Instructions (optional)", submit: "Post" },
} satisfies Record<PostKind, { heading: string; placeholder: string; submit: string }>;

const round =
  "grid size-10 place-items-center rounded-full border border-border text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40";

// Lucide has no Google Drive mark; this is the three-sided outline of one.
function DriveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className={className} aria-hidden>
      <path d="M8 3h8l6 10.5-4 7H6l-4-7z" />
      <path d="M8 3l6 10.5M16 3l-6 10.5M2 13.5h20" />
    </svg>
  );
}

// Lucide dropped brand marks, so the YouTube one is drawn here: a filled rounded box with a play triangle cut out.
function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="currentColor" fillRule="evenodd" d="M7 4.5h10A4.5 4.5 0 0 1 21.5 9v6a4.5 4.5 0 0 1-4.5 4.5H7A4.5 4.5 0 0 1 2.5 15V9A4.5 4.5 0 0 1 7 4.5zm3 4v7l6-3.5z" />
    </svg>
  );
}

function AttachmentIcon({ kind }: { kind: Attachment["kind"] }) {
  const Icon = kind === "youtube" ? YoutubeIcon : kind === "drive" ? DriveIcon : kind === "file" ? FileText : Link2;
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
      <Icon className="size-4" />
    </span>
  );
}

const card =
  "flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary";

// An uploaded file: its download address is signed for ten minutes, so it is fetched when it is clicked.
function FileCard({ attachment }: { attachment: Attachment }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = attachment.url.replace(/^asset:/, "");
  async function open() {
    setBusy(true);
    setFailed(false);
    try {
      const url = (await fetchAssetUrls([id]))[id];
      if (url) window.location.assign(url);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" onClick={() => void open()} disabled={busy} className={card}>
        <AttachmentIcon kind="file" />
        <span className="min-w-0">
          <span className="block truncate font-medium">{attachment.title}</span>
          <span className="block truncate text-xs text-muted">{busy ? "Preparing…" : "Download"}</span>
        </span>
      </button>
      {failed && (
        <p role="alert" className="mt-1 text-xs text-danger">
          The file couldn&apos;t be opened. Try again.
        </p>
      )}
    </>
  );
}

// An assignment's points and time limit as short chips, and its rubric as a list (nothing for other posts).
export function PostDetails({ post, rubric = true }: { post: Announcement; rubric?: boolean }) {
  const chips = [post.points != null ? `${post.points} ${post.points === 1 ? "point" : "points"}` : null, post.timeLimitMinutes ? `${post.timeLimitMinutes}-minute time limit` : null].filter(
    (c): c is string => c !== null,
  );
  if (chips.length === 0 && (!rubric || post.rubric.length === 0)) return null;
  return (
    <div className="mt-3 space-y-2">
      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <li key={c} className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
              {c}
            </li>
          ))}
        </ul>
      )}
      {rubric && post.rubric.length > 0 && (
        <div className="rounded-lg border border-border">
          <p className="border-b border-border px-3 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Rubric</p>
          <ul className="divide-y divide-border text-sm">
            {post.rubric.map((row, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="min-w-0">{row.criterion}</span>
                <span className="shrink-0 text-muted tabular-nums">{row.points} pts</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// The attachments of a post in the stream: one card per attachment; links open in a new tab, files download.
export function AttachmentList({ attachments = [] }: { attachments?: readonly Attachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
      {attachments.map((a) => (
        <li key={a.url}>
          {a.kind === "file" ? (
            <FileCard attachment={a} />
          ) : (
            <a href={a.url} target="_blank" rel="noopener noreferrer" className={card}>
              <AttachmentIcon kind={a.kind} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{a.title}</span>
                <span className="block truncate text-xs text-muted">{new URL(a.url).hostname.replace(/^www\./, "")}</span>
              </span>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

// The dialog the "Create" menu opens to write an announcement, assignment or activity, like Classroom's: which
// class it is for, who sees it, and a text box with bold, italic, lists and links (stored as markdown). `kind`
// null keeps it closed.
export function AnnouncementComposer({
  post,
  kind,
  onClose,
  classTitle,
  editing,
}: {
  post: Post;
  kind: PostKind | null;
  onClose: () => void;
  classTitle: string;
  // The post being changed: its words, title, deadline and attachments fill the dialog.
  editing?: Announcement;
}) {
  const [body, setBody] = useState(editing?.body ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>([...(editing?.attachments ?? [])]);
  // The kind being added (its address box is open), the address typed so far and what was wrong with it.
  const [adding, setAdding] = useState<Attachment["kind"] | null>(null);
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // An assignment's extras, and the deadline's date and time (kept apart; the browser's own time zone makes the
  // moment sent to the server).
  const [points, setPoints] = useState(editing?.points != null && editing.rubric.length === 0 ? String(editing.points) : "");
  const [timeLimit, setTimeLimit] = useState(editing?.timeLimitMinutes ? String(editing.timeLimitMinutes) : "");
  const [rubric, setRubric] = useState<RubricRow[]>([...(editing?.rubric ?? [])]);
  const [dueDate, setDueDate] = useState(editing?.dueAt ? localInput(editing.dueAt).slice(0, 10) : "");
  const [dueTime, setDueTime] = useState(editing?.dueAt ? localInput(editing.dueAt).slice(11) : "");
  const rubricTotal = rubric.reduce((sum, row) => sum + (Number.isFinite(row.points) ? row.points : 0), 0);
  const dueAt = dueDate ? new Date(`${dueDate}T${dueTime || "23:59"}`).toISOString() : "";

  async function chooseFile(file: File) {
    setAddressError(null);
    setUploading(true);
    try {
      const uploaded = await uploadFile(file);
      setAttachments((all) => [...all, { kind: "file", url: assetRef(uploaded.assetId), title: uploaded.name }]);
    } catch (e) {
      setAddressError(e instanceof Error ? e.message : "The file couldn't be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  const closeAdd = () => {
    setAdding(null);
    setAddress("");
    setAddressError(null);
  };
  const addAttachment = () => {
    if (!adding) return;
    const made = cleanAttachment(adding, address);
    if (!made)
      return setAddressError(
        adding === "youtube" ? "Paste a YouTube link." : adding === "drive" ? "Paste a Google Drive link." : "Paste a web address starting with https://.",
      );
    if (attachments.some((a) => a.url === made.url)) return closeAdd();
    setAttachments((all) => [...all, made]);
    closeAdd();
  };
  const [state, action, pending] = useActionState<ClassFormState, FormData>(async (prev, formData) => {
    const result = await post(prev, formData);
    if (!result) {
      setBody("");
      setAttachments([]);
      setPoints("");
      setTimeLimit("");
      setRubric([]);
      setDueDate("");
      setDueTime("");
      closeAdd();
      onClose();
    }
    return result;
  }, undefined);

  // Kept while it closes so the dialog doesn't change its words as it goes away.
  const [shown, setShown] = useState<PostKind>("announcement");
  if (kind && kind !== shown) setShown(kind);
  const text = copy[shown];
  const announcement = shown === "announcement";
  const field =
    "w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm focus:outline-2 focus:outline-primary";

  return (
    <Dialog
      open={kind !== null}
      onClose={() => {
        closeAdd();
        onClose();
      }}
      title={editing ? `Edit ${text.heading.toLowerCase()}` : text.heading}
      footer={
        <>
          <div className="mr-auto flex gap-2">
            {(
              [
                ["drive", "Add Google Drive file", DriveIcon],
                ["youtube", "Add YouTube video", YoutubeIcon],
                ["link", "Add link", Link2],
              ] as const
            ).map(([kind, label, Icon]) => (
              <button
                key={kind}
                type="button"
                title={label}
                aria-label={label}
                disabled={attachments.length >= maxAttachments}
                onClick={() => {
                  setAdding(kind);
                  setAddress("");
                  setAddressError(null);
                }}
                className={`${round} ${adding === kind ? "border-primary text-primary" : ""}`}
              >
                <Icon className="size-5" aria-hidden />
              </button>
            ))}
            <button
              type="button"
              title="Upload a PDF, Word, Excel or PowerPoint file (up to 10 MB)"
              aria-label="Upload a file"
              disabled={uploading || attachments.length >= maxAttachments}
              onClick={() => fileInput.current?.click()}
              className={round}
            >
              {uploading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Upload className="size-5" aria-hidden />}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept={fileAccept}
              className="hidden"
              tabIndex={-1}
              aria-label="Choose a file to attach"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void chooseFile(file);
              }}
            />
          </div>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="post-form" disabled={pending || uploading || (announcement && !body.trim())}>
            {pending ? (editing ? "Saving…" : "Posting…") : editing ? "Save" : text.submit}
          </Button>
        </>
      }
    >
      <form id="post-form" key={shown} action={action} className="space-y-4">
        <input type="hidden" name="kind" value={shown} />
        <input type="hidden" name="body" value={body} />
        <input type="hidden" name="attachments" value={JSON.stringify(attachments)} />
        <input type="hidden" name="dueAt" value={dueAt} />
        <input type="hidden" name="rubric" value={JSON.stringify(rubric)} />
        <div>
          <p className="mb-2 text-sm text-muted">For</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="max-w-60 truncate rounded-lg bg-surface-muted px-3 py-3 text-sm uppercase">{classTitle}</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-primary">
              <Users className="size-4" aria-hidden /> All students
            </span>
          </div>
        </div>
        {!announcement && (
          <div>
            <label htmlFor="post-title" className="mb-1 block text-sm text-muted">
              Title
            </label>
            <input id="post-title" name="title" required maxLength={150} autoFocus defaultValue={editing?.title} className={field} />
          </div>
        )}
        <RichTextEditor simple value={body} onChange={setBody} label={text.heading} rows={5} placeholder={text.placeholder} />
        {adding && (
          <div className="space-y-1">
            <div className="flex gap-2">
              <input
                autoFocus
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setAddressError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAttachment();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    closeAdd();
                  }
                }}
                type="url"
                aria-label={adding === "youtube" ? "YouTube link" : adding === "drive" ? "Google Drive link" : "Link"}
                placeholder={adding === "youtube" ? "https://www.youtube.com/watch?v=…" : adding === "drive" ? "https://drive.google.com/…" : "https://"}
                className={field}
              />
              <Button type="button" onClick={addAttachment}>
                Add
              </Button>
              <Button type="button" variant="ghost" onClick={closeAdd}>
                Cancel
              </Button>
            </div>
            {addressError && (
              <p role="alert" className="text-sm text-danger">
                {addressError}
              </p>
            )}
          </div>
        )}
        {!adding && addressError && (
          <p role="alert" className="text-sm text-danger">
            {addressError}
          </p>
        )}
        {attachments.length > 0 && (
          <ul className="space-y-2">
            {attachments.map((a) => (
              <li key={a.url} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <AttachmentIcon kind={a.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.title}</span>
                  <span className="block truncate text-xs text-muted">{a.kind === "file" ? "File" : a.url}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${a.title}`}
                  onClick={() => setAttachments((all) => all.filter((x) => x.url !== a.url))}
                  className="rounded-md p-1 text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {!announcement && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="post-due-date" className="mb-1 block text-sm text-muted">
                Due date (optional)
              </label>
              <input id="post-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={field} />
            </div>
            <div>
              <label htmlFor="post-due-time" className="mb-1 block text-sm text-muted">
                Due time
              </label>
              <input
                id="post-due-time"
                type="time"
                value={dueTime}
                disabled={!dueDate}
                onChange={(e) => setDueTime(e.target.value)}
                className={`${field} disabled:opacity-50`}
              />
              {dueDate && !dueTime && <p className="mt-1 text-xs text-muted">No time set: due at the end of the day (11:59 PM).</p>}
            </div>
          </div>
        )}
        {shown === "assignment" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="post-points" className="mb-1 block text-sm text-muted">
                  Points
                </label>
                <input
                  id="post-points"
                  name="points"
                  type="number"
                  min={0}
                  max={1000}
                  step={1}
                  inputMode="numeric"
                  value={rubric.length > 0 ? String(rubricTotal) : points}
                  readOnly={rubric.length > 0}
                  onChange={(e) => setPoints(e.target.value)}
                  placeholder="Ungraded"
                  className={`${field} read-only:opacity-70`}
                />
                {rubric.length > 0 && <p className="mt-1 text-xs text-muted">Added up from the rubric.</p>}
              </div>
              <div>
                <label htmlFor="post-time-limit" className="mb-1 block text-sm text-muted">
                  Time limit (minutes)
                </label>
                <input
                  id="post-time-limit"
                  name="timeLimit"
                  type="number"
                  min={1}
                  max={600}
                  step={1}
                  inputMode="numeric"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                  placeholder="No limit"
                  className={field}
                />
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm text-muted">Rubric (optional)</legend>
              {rubric.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    aria-label={`Criterion ${i + 1}`}
                    value={row.criterion}
                    maxLength={200}
                    placeholder="Criterion, e.g. Clear explanation"
                    onChange={(e) => setRubric((all) => all.map((r, j) => (j === i ? { ...r, criterion: e.target.value } : r)))}
                    className={field}
                  />
                  <input
                    aria-label={`Points for criterion ${i + 1}`}
                    type="number"
                    min={0}
                    max={1000}
                    step={1}
                    inputMode="numeric"
                    value={Number.isFinite(row.points) ? row.points : ""}
                    placeholder="pts"
                    onChange={(e) => setRubric((all) => all.map((r, j) => (j === i ? { ...r, points: e.target.value === "" ? NaN : Math.trunc(Number(e.target.value)) } : r)))}
                    className={`${field} w-24 shrink-0`}
                  />
                  <button
                    type="button"
                    aria-label={`Remove criterion ${i + 1}`}
                    onClick={() => setRubric((all) => all.filter((_, j) => j !== i))}
                    className="rounded-md p-1 text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={rubric.length >= maxRubricRows}
                  onClick={() => setRubric((all) => [...all, { criterion: "", points: 0 }])}
                >
                  <Plus className="size-4" aria-hidden /> Add criterion
                </Button>
                {rubric.length > 0 && <span className="text-sm text-muted tabular-nums">Total: {rubricTotal} pts</span>}
              </div>
            </fieldset>
          </>
        )}
        {state?.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

// A date-time input's value ("2026-11-20T23:59") for an ISO time, in the browser's own time zone.
const localInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// The pencil on a post: opens the same dialog filled with what the post says. It is only mounted while open, so
// every opening starts from what is saved.
export function EditAnnouncementButton({ announcement, post, classTitle }: { announcement: Announcement; post: Post; classTitle: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" className="px-2 py-1" onClick={() => setOpen(true)} aria-label={`Edit ${announcement.kind}`}>
        <Pencil className="size-4" aria-hidden />
      </Button>
      {open && <AnnouncementComposer post={post} kind={announcement.kind} editing={announcement} onClose={() => setOpen(false)} classTitle={classTitle} />}
    </>
  );
}

export function DeleteAnnouncementButton({ remove }: { remove: () => Promise<ClassFormState> }) {
  const [state, action, pending] = useActionState(remove, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete this announcement?")) e.preventDefault();
      }}
    >
      <Button type="submit" variant="ghost" className="px-2 py-1" disabled={pending} aria-label="Delete announcement">
        <Trash2 className="size-4" aria-hidden />
      </Button>
      {state?.error && (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}
