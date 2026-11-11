"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { ClassFormState } from "../actions";
import { AnnouncementComposer } from "./announcements";

// Classroom's "New announcement" pill on the stream: opens the Post dialog (text, bold/italic/list, Drive, YouTube,
// file and link attachments).
export function NewAnnouncementButton({
  post,
  classTitle,
}: {
  post: (prev: ClassFormState, formData: FormData) => Promise<ClassFormState>;
  classTitle: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-3 rounded-full bg-primary-soft px-6 py-3 text-sm font-medium text-primary shadow-sm hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Pencil className="size-4" aria-hidden /> New announcement
      </button>
      <AnnouncementComposer post={post} kind={open ? "announcement" : null} onClose={() => setOpen(false)} classTitle={classTitle} />
    </>
  );
}
