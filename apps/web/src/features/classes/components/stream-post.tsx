import Link from "next/link";
import clsx from "clsx";
import { ClipboardCheck, ClipboardList, Shapes } from "lucide-react";
import type { SessionListItem } from "@examinus/contract/session";
import type { Announcement } from "@examinus/domain/classes";
import { formatDateTime, formatRelative } from "@examinus/copy/time";
import { Badge, ButtonLink } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { ModeBadge, SessionStatusPill, StatusBadge, sessionGroupOf } from "@/features/session/components/assessment-bits";
import { AttachmentList, DeleteAnnouncementButton, EditAnnouncementButton, PostDetails } from "./announcements";
import { whenLabel } from "./upcoming-card";
import type { ClassFormState } from "../actions";
import { Initials } from "./initials";

type Post = (prev: ClassFormState, formData: FormData) => Promise<ClassFormState>;

const cardClass = "rounded-2xl border border-border bg-surface p-5 shadow-sm";

const kindLabel = { assignment: "New assignment", activity: "New activity", announcement: "Announcement" } as const;

// A post on the stream: an announcement (who wrote it and when), or an assignment or activity (what it is, when it
// is due and what it is worth, with a link to the students' work).
export function AnnouncementPost({
  post,
  classId,
  classTitle,
  update,
  remove,
}: {
  post: Announcement;
  classId: string;
  classTitle: string;
  update: Post;
  remove: () => Promise<ClassFormState>;
}) {
  const isWork = post.kind !== "announcement";
  const due = post.dueAt ? whenLabel(post.dueAt) : null;
  const author = post.authorName || "You";
  return (
    <article className={cardClass}>
      <div className="flex items-start gap-3">
        {isWork ? (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            {post.kind === "assignment" ? <ClipboardCheck className="size-6" aria-hidden /> : <Shapes className="size-6" aria-hidden />}
          </span>
        ) : (
          <Initials name={author} className="size-11" />
        )}
        <div className="min-w-0 flex-1">
          {isWork ? (
            <>
              <p className="text-xs font-semibold text-primary">
                {kindLabel[post.kind]} <span className="font-normal text-muted">· Posted {formatRelative(post.createdAt)}</span>
              </p>
              <h3 className="mt-0.5 text-lg leading-snug font-bold">{post.title}</h3>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {due && (
                  <span className={clsx("font-semibold", due.tone === "danger" ? "text-danger" : due.tone === "warning" ? "text-warning" : "text-muted")}>
                    Due {due.text}
                  </span>
                )}
                {post.points != null && <Badge tone="primary">{post.points} points</Badge>}
                {post.timeLimitMinutes ? <span className="text-muted">{post.timeLimitMinutes} min</span> : null}
              </p>
            </>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{author}</span>
                <Badge tone="success">Teacher</Badge>
              </p>
              <p className="text-sm text-muted">{formatDateTime(post.createdAt)}</p>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center">
          <EditAnnouncementButton announcement={post} post={update} classTitle={classTitle} />
          <DeleteAnnouncementButton remove={remove} />
        </div>
      </div>

      {post.body && <Markdown className="mt-4 text-[0.95rem]">{post.body}</Markdown>}
      <PostDetails post={post} />
      <AttachmentList attachments={post.attachments} />
      {isWork && (
        <div className="mt-4">
          <ButtonLink href={`/teacher/classes/${classId}/work/${post.id}`} variant="secondary">
            View student work
          </ButtonLink>
        </div>
      )}
    </article>
  );
}

// A quiz or exam in the stream: when it is live (or its lobby is open) it says so, stands out and opens the live
// view; before that it says when it starts.
export function SessionPost({ item }: { item: { session: SessionListItem["session"]; quizTitle: string } }) {
  const { session, quizTitle } = item;
  const group = sessionGroupOf(session);
  const href = `/teacher/assessments/${session.quizId}/sessions/${session.id}`;
  const heading =
    group === "live"
      ? session.status === "lobby"
        ? `${quizTitle} is open: students are joining`
        : `${quizTitle} is live now`
      : group === "upcoming"
        ? `Upcoming ${session.mode}: ${quizTitle}`
        : quizTitle;
  const when =
    group === "upcoming"
      ? session.opensAt
        ? `Starts ${formatDateTime(session.opensAt)}`
        : "Starts when you press Start"
      : session.opensAt
        ? `Opened ${formatDateTime(session.opensAt)}`
        : "Not scheduled";
  return (
    <article
      className={clsx(
        "rounded-2xl border border-border bg-surface shadow-sm",
        group === "live" && "relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-success",
      )}
    >
      <Link href={href} className="block rounded-2xl p-5 hover:bg-surface-muted/60 focus-visible:outline-2 focus-visible:outline-primary">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ClipboardList className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg leading-snug font-bold">{heading}</h3>
            <p className="text-sm text-muted">{when}</p>
          </div>
          <ModeBadge mode={session.mode} />
          {group === "live" ? <SessionStatusPill session={session} /> : <StatusBadge status={session.status} />}
        </div>
        {group === "live" && (
          <p className="mt-3 ml-14 text-sm font-semibold text-primary">
            {session.status === "lobby" ? "Open the lobby" : "Open the live view"} →
          </p>
        )}
      </Link>
      {session.status === "ended" && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
          <p className="text-sm text-muted">Finished. Go through each student&apos;s answers and score them.</p>
          <ButtonLink href={`/teacher/grading/${session.id}`} variant="secondary">
            <ClipboardCheck className="size-4" aria-hidden /> Review answers
          </ButtonLink>
        </div>
      )}
    </article>
  );
}
