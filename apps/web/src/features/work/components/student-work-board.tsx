"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { Mail, MessageSquare, Users } from "lucide-react";
import { submissionStatusLabel, type PostWork, type PrivateComment, type StudentWork } from "@examinus/domain/submissions";
import { Badge, Button, Switch } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { AttachmentList } from "@/features/classes/components/announcements";
import { addStudentCommentAction, gradeAction, loadStudentCommentsAction, returnWorkAction, setAcceptingAction } from "../actions";
import { PrivateComments } from "./private-comments";

const tone = { assigned: "neutral", missing: "danger", turned_in: "success", returned: "info" } as const;
const order = { turned_in: 0, returned: 1, missing: 2, assigned: 3 } as const;

type Sort = "status" | "name";
type Filter = "all" | "turned_in" | "returned" | "assigned" | "missing";

function Initials({ name }: { name: string }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
      {letters}
    </span>
  );
}

// One student's private thread on this post, in a dialog. It is loaded when the dialog opens.
function StudentComments({ classId, announcementId, row }: { classId: string; announcementId: string; row: StudentWork }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<readonly PrivateComment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  function show() {
    setOpen(true);
    setError(null);
    void loadStudentCommentsAction(classId, announcementId, row.studentId).then((r) => ("error" in r ? setError(r.error) : setComments(r.ok)));
  }
  return (
    <>
      <button
        type="button"
        onClick={show}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary"
      >
        <MessageSquare className="size-3.5" aria-hidden /> Private comments
      </button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setComments(null);
        }}
        title={`Private comments · ${row.name}`}
      >
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : comments === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <PrivateComments
            bare
            initial={comments}
            send={addStudentCommentAction.bind(null, classId, announcementId, row.studentId)}
            me={{ name: "You", fromTeacher: true }}
            who={`Only you and ${row.name}`}
            placeholder={`Reply to ${row.name}…`}
          />
        )}
      </Dialog>
    </>
  );
}

// One score box: `__ / points`; saved when it loses focus.
function ScoreBox({ classId, announcementId, row, points }: { classId: string; announcementId: string; row: StudentWork; points: number }) {
  const [value, setValue] = useState(row.score === null ? "" : String(row.score));
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  return (
    <div className="shrink-0 text-right">
      <label className="inline-flex items-baseline gap-1 text-sm tabular-nums">
        <span className="sr-only">Score for {row.name}</span>
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={() =>
            start(async () => {
              if (value === (row.score === null ? "" : String(row.score))) return;
              const r = await gradeAction(classId, announcementId, row.studentId, value);
              setError(r && "error" in r ? r.error : null);
            })
          }
          placeholder="__"
          className="w-12 rounded border-b border-border bg-transparent px-1 text-right text-success focus:border-primary focus:outline-none"
        />
        <span className="text-success">/{points}</span>
      </label>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

// Classroom's "Student work": the roster with scores on the left; the counts, the accepting switch and each student's
// work on the right. Scores reach students only when the work is returned.
export function StudentWorkBoard({ classId, announcementId, title, work }: { classId: string; announcementId: string; title: string; work: PostWork }) {
  const [sort, setSort] = useState<Sort>("status");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const rows = [...work.rows].sort((a, b) => (sort === "status" ? order[a.status] - order[b.status] || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)));
  const shown = rows.filter((r) => filter === "all" || r.status === filter);
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const canReturn = work.points !== null && rows.some((r) => r.score !== null && r.status !== "returned" && (selected.size === 0 || selected.has(r.studentId)));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-xl border border-border bg-surface shadow-sm lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      {/* Roster */}
      <section className="border-b border-border lg:border-r lg:border-b-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <label className="flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.studentId)))} className="size-4" />
            <Users className="size-4 text-muted" aria-hidden /> All students
          </label>
          <label className="ml-auto text-sm">
            <span className="sr-only">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg border border-border bg-surface-muted/50 px-2 py-1.5 text-sm">
              <option value="status">Sort by status</option>
              <option value="name">Sort by name</option>
            </select>
          </label>
        </div>
        <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto">
          {rows.map((r) => (
            <li key={r.studentId} className="flex items-center gap-3 px-4 py-3">
              <input type="checkbox" checked={selected.has(r.studentId)} onChange={() => toggle(r.studentId)} aria-label={`Select ${r.name}`} className="size-4 shrink-0" />
              <Initials name={r.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className={clsx("text-xs", r.status === "missing" ? "text-danger" : r.status === "turned_in" || r.status === "returned" ? "text-success" : "text-muted")}>
                  {submissionStatusLabel[r.status]}
                  {r.late && " late"}
                </p>
              </div>
              {work.points !== null && <ScoreBox classId={classId} announcementId={announcementId} row={r} points={work.points} />}
            </li>
          ))}
        </ul>
      </section>

      {/* This post */}
      <section className="min-w-0 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              disabled={!canReturn || pending}
              onClick={() =>
                start(async () => {
                  const r = await returnWorkAction(classId, announcementId, selected.size > 0 ? [...selected] : null);
                  setMessage(r && "error" in r ? r.error : "Returned. Students can see their grades now.");
                })
              }
            >
              <Mail className="size-4" aria-hidden /> Return
            </Button>
          </div>
        </div>
        {work.points === null && <p className="mt-1 text-xs text-muted">This has no points, so there is nothing to grade.</p>}
        {message && <p role="status" className="mt-2 text-sm text-muted">{message}</p>}

        <dl className="mt-4 flex gap-6">
          <div>
            <dd className="text-3xl font-light tabular-nums">{work.turnedIn}</dd>
            <dt className="text-sm text-muted">Turned in</dt>
          </div>
          <div className="border-l border-border pl-6">
            <dd className="text-3xl font-light tabular-nums">{work.assigned}</dd>
            <dt className="text-sm text-muted">Assigned</dt>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Switch
            checked={work.accepting}
            onChange={(v) => start(async () => void (await setAcceptingAction(classId, announcementId, v)))}
            label="Accepting submissions"
            disabled={pending}
          />
          <label className="text-sm">
            <span className="sr-only">Filter</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="rounded-lg border border-border bg-surface-muted/50 px-3 py-2 text-sm">
              <option value="all">All</option>
              <option value="turned_in">Turned in</option>
              <option value="returned">Returned</option>
              <option value="assigned">Assigned</option>
              <option value="missing">Missing</option>
            </select>
          </label>
        </div>

        {shown.length === 0 ? (
          <p className="mt-6 text-sm text-muted">No one here yet.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((r) => (
              <li key={r.studentId} className="min-w-0 rounded-xl border border-border bg-surface-muted/40 p-4">
                <div className="flex items-center gap-2">
                  <Initials name={r.name} />
                  <p className="min-w-0 truncate text-sm font-medium">{r.name}</p>
                </div>
                <AttachmentList attachments={r.attachments} single />
                {r.attachments.length === 0 && r.status !== "assigned" && r.status !== "missing" && <p className="mt-3 text-xs text-muted">Marked as done.</p>}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <Badge tone={tone[r.status]}>
                    {submissionStatusLabel[r.status]}
                    {r.late && " late"}
                  </Badge>
                  <StudentComments classId={classId} announcementId={announcementId} row={r} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
