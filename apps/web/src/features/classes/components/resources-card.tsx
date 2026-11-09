"use client";

import { useActionState, useRef, useState } from "react";
import { BookMarked, FileText, FolderOpen, Link2, Loader2, PlayCircle, Plus, Trash2, Upload } from "lucide-react";
import { assetRef, fileAccept } from "@examinus/domain/asset";
import type { ClassResource } from "@examinus/domain/classes";
import { fetchAssetUrls } from "@/features/assets/actions";
import { uploadFile } from "@/features/assets/upload-file";
import { Button, Field, inputClass } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { addResourceAction, deleteResourceAction, type ClassFormState } from "../actions";

const icons = { link: Link2, youtube: PlayCircle, drive: FolderOpen, file: FileText } as const;
const kindLabels = {
  file: "Upload a file (PDF, Word, Excel, PowerPoint)",
  link: "Website link",
  youtube: "YouTube video",
  drive: "Google Drive",
} as const;

function DeleteResource({ classId, resource }: { classId: string; resource: ClassResource }) {
  const [state, action, pending] = useActionState(deleteResourceAction.bind(null, classId, resource.id), undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Remove "${resource.title}" from the resources?`)) e.preventDefault();
      }}
    >
      <button
        type="submit"
        disabled={pending}
        aria-label={`Remove ${resource.title}`}
        title="Remove"
        className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
      {state?.error && (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}

function AddResource({ classId, open, onClose }: { classId: string; open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<ClassResource["kind"]>("file");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  // The uploaded file's name, and any trouble with the upload.
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  function reset() {
    setKind("file");
    setUrl("");
    setTitle("");
    setDetail("");
    setFileName("");
    setUploadError(null);
  }
  function close() {
    reset();
    onClose();
  }
  async function chooseFile(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const uploaded = await uploadFile(file);
      setUrl(assetRef(uploaded.assetId));
      setFileName(uploaded.name);
      // Fills what is still empty: the title from the file's name, the short line with the name itself.
      setTitle((t) => t || uploaded.name.replace(/\.[^.]+$/, ""));
      setDetail((d) => d || uploaded.name);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "The file couldn't be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  const [state, action, pending] = useActionState(async (prev: ClassFormState, formData: FormData) => {
    const result = await addResourceAction(classId, prev, formData);
    if (!result) close();
    return result;
  }, undefined);

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add a resource"
      description="Something your students can open: the syllabus, lab rules, the textbook, a form or a video."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="add-resource-form" disabled={pending || uploading}>
            {pending ? "Adding…" : "Add resource"}
          </Button>
        </>
      }
    >
      <form id="add-resource-form" action={action} className="grid gap-4">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="url" value={url} />
        <Field label="Type">
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as ClassResource["kind"]);
              setUrl("");
              setFileName("");
              setUploadError(null);
            }}
            className={inputClass}
          >
            {Object.entries(kindLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        {kind === "file" ? (
          <div>
            <span className="mb-1.5 block text-sm font-medium">File</span>
            <input
              ref={picker}
              type="file"
              accept={fileAccept}
              className="hidden"
              tabIndex={-1}
              aria-label="Choose a file to upload"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void chooseFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => picker.current?.click()}
              disabled={uploading}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border px-4 py-4 text-left text-sm hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
            >
              {uploading ? <Loader2 className="size-5 animate-spin text-primary" aria-hidden /> : <Upload className="size-5 text-primary" aria-hidden />}
              <span className="min-w-0">
                <span className="block truncate font-medium">{uploading ? "Uploading…" : fileName || "Choose a file"}</span>
                <span className="block text-xs text-muted">PDF, Word, Excel or PowerPoint, up to 10 MB</span>
              </span>
            </button>
            {uploadError && (
              <p role="alert" className="mt-1 text-xs text-danger">
                {uploadError}
              </p>
            )}
          </div>
        ) : (
          <Field label="Address">
            <input type="url" required placeholder="https://" maxLength={500} value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} />
          </Field>
        )}

        <Field label="Title">
          <input
            name="title"
            required
            maxLength={150}
            placeholder={kind === "file" ? "Course syllabus" : "OpenStax Biology 2e"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Short description" hint="Optional: shown under the title.">
          <input
            name="detail"
            maxLength={150}
            placeholder={kind === "file" ? "Grading and exam dates" : "Primary digital textbook"}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            className={inputClass}
          />
        </Field>
        {state?.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

// An uploaded file's row: its download address is signed for ten minutes, so it is fetched when it is clicked.
function FileRow({ resource }: { resource: ClassResource }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function open() {
    const id = resource.url.replace(/^asset:/, "");
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
    <button
      type="button"
      onClick={() => void open()}
      disabled={busy}
      className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left focus-visible:outline-2 focus-visible:outline-primary"
    >
      <ResourceBody resource={resource} note={busy ? "Preparing…" : failed ? "Couldn't open. Try again." : undefined} />
    </button>
  );
}

function ResourceBody({ resource, note }: { resource: ClassResource; note?: string }) {
  const Icon = icons[resource.kind];
  return (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{resource.title}</span>
        {(note || resource.detail) && <span className="block truncate text-xs text-muted">{note ?? resource.detail}</span>}
      </span>
    </>
  );
}

// "Class Resources" on the stream's left: the links the teacher keeps for the class, with add and remove.
export function ResourcesCard({ classId, resources }: { classId: string; resources: readonly ClassResource[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <BookMarked className="size-5 text-primary" aria-hidden /> Class Resources
        </h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="Add a resource"
          title="Add a resource"
          className="inline-flex size-8 items-center justify-center rounded-lg text-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Plus className="size-5" aria-hidden />
        </button>
      </div>

      {resources.length === 0 ? (
        <p className="text-sm text-muted">Add the textbook, syllabus or any link students need.</p>
      ) : (
        <ul className="space-y-1">
          {resources.map((r) => (
            <li key={r.id} className="group flex items-center gap-1 rounded-xl hover:bg-surface-muted">
              {r.kind === "file" ? (
                <FileRow resource={r} />
              ) : (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <ResourceBody resource={r} />
                </a>
              )}
              <DeleteResource classId={classId} resource={r} />
            </li>
          ))}
        </ul>
      )}

      <AddResource classId={classId} open={adding} onClose={() => setAdding(false)} />
    </section>
  );
}
