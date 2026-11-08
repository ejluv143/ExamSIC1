import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, ClipboardList, ClipboardCheck, ExternalLink, Megaphone, Pencil, Printer, Shapes, Sheet } from "lucide-react";
import clsx from "clsx";
import type { SessionListItem } from "@examinus/contract/session";
import { classColors } from "@examinus/domain/classes";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { CustomizeAppearance } from "@/features/classes/components/customize-appearance";
import { CreateMenu } from "@/features/classes/components/create-menu";
import { ClassroomSyncButton } from "@/features/classes/components/classroom-sync-button";
import {
  deleteAnnouncementAction,
  newJoinCodeAction,
  postAnnouncementAction,
  updateAnnouncementAction,
  removeStudentAction,
  customizeClassAction,
  syncRosterAction,
} from "@/features/classes/actions";
import { ModeBadge, SessionStatusPill, StatusBadge, sessionGroupOf } from "@/features/session/components/assessment-bits";
import { LiveRefresh } from "@/features/classes/components/live-refresh";
import { assetUrls } from "@/features/assets/data";
import { getAnnouncements, getClass, getStudents } from "@/features/classes/data";
import { listSessions } from "@/features/session/data";
import { fullName } from "@/lib/format";
import { formatDateTime } from "@examinus/copy/time";
import { JoinCode, RemoveStudentButton } from "@/features/classes/components/class-actions";
import { AttachmentList, DeleteAnnouncementButton, EditAnnouncementButton, PostDetails } from "@/features/classes/components/announcements";

const tabs = [
  { id: "stream", label: "Stream" },
  { id: "classwork", label: "Classwork" },
  { id: "people", label: "People" },
] as const;
type Tab = (typeof tabs)[number]["id"];

export async function generateMetadata(
  props: PageProps<"/teacher/classes/[classId]">,
): Promise<Metadata> {
  const { classId } = await props.params;
  const cls = await getClass(classId);
  return { title: cls ? `${cls.courseCode} ${cls.section}` : "Class" };
}

function Initials({ name }: { name: string }) {
  const letters = name
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
    >
      {letters}
    </span>
  );
}

export default async function ClassPage(props: PageProps<"/teacher/classes/[classId]">) {
  const { classId } = await props.params;
  const { tab: rawTab } = await props.searchParams;
  const tab: Tab = tabs.some((t) => t.id === rawTab) ? (rawTab as Tab) : "stream";

  const cls = await getClass(classId);
  if (!cls) notFound();

  const [students, sessions, announcements] = await Promise.all([
    getStudents(cls.studentIds),
    listSessions({ classId }),
    getAnnouncements(classId),
  ]);
  const headerUrl = cls.headerImage ? ((await assetUrls([cls.headerImage]))[cls.headerImage] ?? null) : null;
  const upcoming = sessions.filter(({ session }) => session.status !== "ended");
  const base = `/teacher/classes/${cls.id}`;
  // Assignments and activities are classwork; announcements only show in the stream.
  const work = announcements.filter((a) => a.kind !== "announcement");
  // The stream: announcements and sessions, newest first.
  const feed = [
    ...announcements.map((announcement) => ({
      type: "announcement" as const,
      at: Date.parse(announcement.createdAt),
      announcement,
    })),
    ...sessions.map(({ session, quizTitle }) => ({
      type: "session" as const,
      at: Date.parse(session.opensAt ?? "") || 0,
      session,
      quizTitle,
    })),
  ].sort((a, b) => {
    // A session that is live (or whose lobby is open) comes first, like a pinned announcement.
    const live = (x: (typeof feed)[number]) => (x.type === "session" && sessionGroupOf(x.session) === "live" ? 1 : 0);
    return live(b) - live(a) || b.at - a.at;
  });
  const anyLive = sessions.some(({ session }) => sessionGroupOf(session) === "live");

  return (
    <>
      {anyLive && <LiveRefresh />}
      <Link href="/teacher/classes" className="mb-3 inline-block text-sm text-muted hover:text-foreground">
        ← Classes
      </Link>

      {/* Tabs, like Classroom's top bar */}
      <nav aria-label="Class sections" className="mb-5 flex flex-wrap items-center gap-x-1 border-b border-border">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={t.id === "stream" ? base : `${base}?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={clsx(
              "-mb-px border-b-[3px] px-5 py-3 text-sm font-medium",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:bg-surface-muted hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
        <Link
          href={`${base}/record`}
          className="-mb-px border-b-[3px] border-transparent px-5 py-3 text-sm font-medium text-muted hover:bg-surface-muted hover:text-foreground"
        >
          Grades
        </Link>
      </nav>

      {/* Banner */}
      <section
        className={clsx(
          "relative mb-6 overflow-hidden rounded-2xl p-6 sm:p-8",
          "bg-cover bg-center",
          cls.color || headerUrl ? "text-white" : "bg-gradient-to-br from-primary to-primary-hover text-primary-foreground",
        )}
        style={
          headerUrl
            ? { backgroundImage: `linear-gradient(rgba(0,0,0,.4), rgba(0,0,0,.4)), url("${headerUrl}")` }
            : cls.color
              ? { backgroundImage: `linear-gradient(135deg, ${classColors[cls.color].from}, ${classColors[cls.color].to})` }
              : undefined
        }
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-64 rounded-full bg-white/10 sm:size-80"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-24 -bottom-24 size-56 rounded-full bg-white/10"
        />
        <div className="absolute top-4 right-4 z-10">
          <CustomizeAppearance
            title={`${cls.courseCode} · ${cls.title}`}
            section={cls.section}
            color={cls.color ?? null}
            headerImage={cls.headerImage ?? null}
            headerUrl={headerUrl}
            save={customizeClassAction.bind(null, cls.id)}
          />
        </div>
        <div className="relative flex min-h-36 flex-col justify-between gap-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {cls.courseCode} · {cls.title}
            </h1>
            <p className="mt-2 text-lg opacity-90">{cls.section}</p>
            <p className="mt-1 text-sm opacity-80">
              {cls.schedule} · {cls.room}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-foreground">
            <ButtonLink href={`${base}/attendance`} variant="secondary">
              <CalendarCheck className="size-4" aria-hidden /> Attendance
            </ButtonLink>
            <ButtonLink href={`${base}/record`} variant="secondary">
              <Sheet className="size-4" aria-hidden /> Class record
            </ButtonLink>
            <ButtonLink href={`${base}/grade-sheet`} variant="secondary">
              <Printer className="size-4" aria-hidden /> Grade sheet
            </ButtonLink>
            <ButtonLink href={`${base}/edit`} variant="secondary">
              <Pencil className="size-4" aria-hidden /> Edit
            </ButtonLink>
          </div>
        </div>
      </section>

      {tab === "people" ? (
        <div className="mx-auto max-w-3xl space-y-8">
          <section>
            <h2 className="border-b-2 border-primary pb-3 text-2xl font-medium text-primary">Teachers</h2>
            <p className="py-4 text-sm text-muted">You teach this class.</p>
          </section>
          <section>
            <div className="flex items-end justify-between border-b-2 border-primary pb-3">
              <h2 className="text-2xl font-medium text-primary">Students</h2>
              <p className="text-sm text-primary">{students.length} students</p>
            </div>
            {students.length === 0 ? (
              <EmptyState title="No students yet">
                Share the class code; students show up here as they join.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {students.map((s) => (
                  <li key={s.id} className="flex items-center gap-4 py-3">
                    <Initials name={fullName(s)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{fullName(s)}</p>
                      <p className="truncate text-sm text-muted">
                        <span className="font-mono text-xs">{s.studentNumber}</span> · {s.email}
                      </p>
                    </div>
                    <RemoveStudentButton name={fullName(s)} remove={removeStudentAction.bind(null, cls.id, s.id)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : tab === "classwork" ? (
        <div className="mx-auto max-w-3xl">
          <div className="mb-4">
            <CreateMenu cls={cls} post={postAnnouncementAction.bind(null, cls.id)} />
          </div>
          <h2 className="border-b-2 border-primary pb-3 text-2xl font-medium text-primary">Quizzes &amp; exams</h2>
          {sessions.length === 0 && work.length === 0 ? (
            <EmptyState title="No classwork yet">Create an assignment, activity or quiz for this class.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {work.map((a) => (
                <li key={a.id} className="flex items-center gap-4 px-2 py-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                    {a.kind === "assignment" ? (
                      <ClipboardCheck className="size-5" aria-hidden />
                    ) : (
                      <Shapes className="size-5" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.title}</span>
                    <span className="block text-sm text-muted">
                      {a.dueAt ? `Due ${formatDateTime(a.dueAt)}` : `Posted ${formatDateTime(a.createdAt)}`}
                      {a.points != null && ` · ${a.points} pts`}
                      {a.timeLimitMinutes ? ` · ${a.timeLimitMinutes} min` : ""}
                    </span>
                  </span>
                  <span className="text-xs text-muted capitalize">{a.kind}</span>
                  <EditAnnouncementButton announcement={a} post={updateAnnouncementAction.bind(null, cls.id, a.id)} classTitle={cls.title} />
                  <DeleteAnnouncementButton remove={deleteAnnouncementAction.bind(null, cls.id, a.id)} />
                </li>
              ))}
              {sessions.map(({ session, quizTitle }) => (
                <li key={session.id}>
                  <Link
                    href={`/teacher/assessments/${session.quizId}/sessions/${session.id}`}
                    className="flex items-center gap-4 rounded-lg px-2 py-3.5 hover:bg-surface-muted"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <ClipboardList className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{quizTitle}</span>
                      <span className="block text-sm text-muted">
                        {session.opensAt ? `Opens ${formatDateTime(session.opensAt)}` : "Not scheduled"}
                      </span>
                    </span>
                    <ModeBadge mode={session.mode} />
                    <StatusBadge status={session.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
          {/* Left column: class code, upcoming, Classroom link */}
          <aside className="space-y-4 self-start">
            <Card className="p-4">
              <p className="mb-2 font-medium">Class code</p>
              {cls.joinCode ? (
                <JoinCode compact code={cls.joinCode} newCode={newJoinCodeAction.bind(null, cls.id)} />
              ) : (
                <p className="text-sm text-muted">No code yet.</p>
              )}
              <p className="mt-3 text-xs text-muted">Students open Classes at Examinus and enter this code.</p>
            </Card>

            <Card className="p-4">
              <p className="mb-2 font-medium">Upcoming</p>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted">No work due soon</p>
              ) : (
                <ul className="space-y-3">
                  {upcoming.slice(0, 4).map(({ session, quizTitle }) => (
                    <li key={session.id}>
                      <Link
                        href={`/teacher/assessments/${session.quizId}/sessions/${session.id}`}
                        className="block text-sm hover:underline"
                      >
                        <span className="block truncate font-medium">{quizTitle}</span>
                        <span className="text-xs text-muted">
                          {session.opensAt ? formatDateTime(session.opensAt) : "Not scheduled"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href={`${base}?tab=classwork`}
                className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
              >
                View all
              </Link>
            </Card>

            {cls.classroom && (
              <Card className="space-y-3 p-4">
                <div>
                  <p className="font-medium">Google Classroom</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Last synced {formatDateTime(cls.classroom.lastSyncedAt)}.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ClassroomSyncButton sync={syncRosterAction.bind(null, cls.id)} />
                  <a
                    href={cls.classroom.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-muted"
                  >
                    Open <ExternalLink className="size-4" aria-hidden />
                  </a>
                </div>
              </Card>
            )}
          </aside>

          {/* Stream */}
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <CreateMenu cls={cls} post={postAnnouncementAction.bind(null, cls.id)} />
              </div>
              <span className="pt-3 text-sm text-muted">{students.length} students enrolled</span>
            </div>

            {feed.length === 0 ? (
              <Card>
                <EmptyState title="This is where you'll see announcements, quizzes and exams">
                  Post an announcement, or create a quiz and start a session for this class.
                </EmptyState>
              </Card>
            ) : (
              feed.map((item) =>
                item.type === "announcement" ? (
                  <Card key={item.announcement.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                        {item.announcement.kind === "assignment" ? (
                          <ClipboardCheck className="size-5" aria-hidden />
                        ) : item.announcement.kind === "activity" ? (
                          <Shapes className="size-5" aria-hidden />
                        ) : (
                          <Megaphone className="size-5" aria-hidden />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {item.announcement.kind === "announcement"
                            ? "You"
                            : `You posted a new ${item.announcement.kind}: ${item.announcement.title}`}
                        </p>
                        <p className="text-sm text-muted">
                          {formatDateTime(item.announcement.createdAt)}
                          {item.announcement.dueAt && ` · Due ${formatDateTime(item.announcement.dueAt)}`}
                        </p>
                      </div>
                      <EditAnnouncementButton
                        announcement={item.announcement}
                        post={updateAnnouncementAction.bind(null, cls.id, item.announcement.id)}
                        classTitle={cls.title}
                      />
                      <DeleteAnnouncementButton remove={deleteAnnouncementAction.bind(null, cls.id, item.announcement.id)} />
                    </div>
                    {item.announcement.body && (
                      <Markdown className="mt-3 text-sm">{item.announcement.body}</Markdown>
                    )}
                    <PostDetails post={item.announcement} />
                    <AttachmentList attachments={item.announcement.attachments} />
                  </Card>
                ) : (
                  <SessionPost key={item.session.id} item={item} />
                ),
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}

// A quiz or exam in the stream, like an announcement: when it is live (or its lobby is open) it says so, stands out
// and opens the live view; before that it says when it starts.
function SessionPost({ item }: { item: { session: SessionListItem["session"]; quizTitle: string } }) {
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
        : `${quizTitle}`;
  const when =
    group === "upcoming"
      ? session.opensAt
        ? `Starts ${formatDateTime(session.opensAt)}`
        : "Starts when you press Start"
      : session.opensAt
        ? `Opened ${formatDateTime(session.opensAt)}`
        : "Not scheduled";
  return (
    <Card
      className={clsx(
        "p-0",
        group === "live" && "relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-success",
      )}
    >
      <Link href={href} className="block rounded-xl p-4 hover:bg-surface-muted">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ClipboardList className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{heading}</p>
            <p className="text-sm text-muted">{when}</p>
          </div>
          <ModeBadge mode={session.mode} />
          {group === "live" ? <SessionStatusPill session={session} /> : <StatusBadge status={session.status} />}
        </div>
        {group === "live" && (
          <p className="mt-3 ml-[3.25rem] text-sm font-medium text-primary">
            {session.status === "lobby" ? "Open the lobby" : "Open the live view"} →
          </p>
        )}
      </Link>
    </Card>
  );
}
