"use client";

import { useRef, useState, useTransition } from "react";
import { Lock, Send } from "lucide-react";
import clsx from "clsx";
import { maxCommentLength, type PrivateComment } from "@examinus/domain/submissions";
import { formatDateTime } from "@examinus/copy/time";
import { Initials } from "@/features/classes/components/initials";
import type { CommentResult } from "../actions";

// The private conversation between one student and the teacher about an assignment: the messages, oldest first, and a
// box to write the next. `send` answers with the saved comment (or what went wrong); `me` is how a sent comment is
// signed until the page is loaded again.
export function PrivateComments({
  initial,
  send,
  me,
  who,
  placeholder,
  bare = false,
}: {
  initial: readonly PrivateComment[];
  send: (body: string) => Promise<CommentResult>;
  // The signed-in person's name and side, for the comments they send in this session.
  me: { name: string; fromTeacher: boolean };
  // "Only you and your teacher".
  who: string;
  placeholder: string;
  // Without its own heading and card, for a dialog.
  bare?: boolean;
}) {
  const [comments, setComments] = useState<readonly PrivateComment[]>(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  function submit() {
    const body = text.trim();
    if (!body || pending) return;
    setError(null);
    start(async () => {
      const result = await send(body);
      if ("error" in result) return setError(result.error);
      setComments((all) => [...all, { ...result.ok, authorName: result.ok.authorName || me.name }]);
      setText("");
      requestAnimationFrame(() => end.current?.scrollIntoView({ block: "nearest" }));
    });
  }

  return (
    <section className={clsx(!bare && "rounded-2xl border border-border bg-surface p-5 shadow-sm")}>
      {!bare && (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Lock className="size-5 text-primary" aria-hidden /> Private Comments
          </h2>
          <span className="text-xs text-muted">{who}</span>
        </div>
      )}
      {bare && <p className="mb-3 flex items-center gap-1.5 text-xs text-muted"><Lock className="size-3.5" aria-hidden /> {who}</p>}

      {comments.length === 0 ? (
        <p className="rounded-xl bg-surface-muted/60 p-3 text-sm text-muted">No comments yet. Anything you write here is seen only by the two of you.</p>
      ) : (
        <ul className="max-h-96 space-y-3 overflow-y-auto pr-1" aria-label="Private comments">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Initials name={c.authorName} className="size-9 text-xs" />
              <div className={clsx("min-w-0 flex-1 rounded-xl p-3", c.fromTeacher ? "bg-primary-soft/70" : "bg-surface-muted/70")}>
                <p className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-sm font-semibold">{c.authorName || (c.fromTeacher ? "Teacher" : "Student")}</span>
                  <span className="text-xs text-muted">{formatDateTime(c.createdAt)}</span>
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
              </div>
            </li>
          ))}
          <div ref={end} />
        </ul>
      )}

      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border border-border bg-surface-muted/50 p-2 focus-within:border-primary">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            maxLength={maxCommentLength}
            rows={2}
            placeholder={placeholder}
            aria-label="Private comment"
            className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={pending || !text.trim()}
            aria-label="Send comment"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
          >
            <Send className="size-4" aria-hidden />
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
