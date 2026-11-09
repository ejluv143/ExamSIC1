import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, ClipboardList, ExternalLink, Shapes } from "lucide-react";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
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
import { ModeBadge, StatusBadge, sessionGroupOf } from "@/features/session/components/assessment-bits";
import { LiveRefresh } from "@/features/classes/components/live-refresh";
import { assetUrls } from "@/features/assets/data";
import { getAnnouncements, getClass, getResources, getStudents } from "@/features/classes/data";
import { listSessions } from "@/features/session/data";
import { readCurrentUser } from "@/lib/auth/dal";
import { fullName } from "@/lib/format";
import { formatDateTime } from "@examinus/copy/time";
import { RemoveStudentButton } from "@/features/classes/components/class-actions";
import { DeleteAnnouncementButton, EditAnnouncementButton } from "@/features/classes/components/announcements";
import { ClassBanner } from "@/features/classes/components/class-banner";
import { ClassTabs, classTabs, type ClassTab } from "@/features/classes/components/class-tabs";
import { Initials } from "@/features/classes/components/initials";
import { AnnouncementPost, SessionPost } from "@/features/classes/components/stream-post";
import { ResourcesCard } from "@/features/classes/components/resources-card";
import { UpcomingCard, requestTime, type UpcomingItem } from "@/features/classes/components/upcoming-card";

export async function generateMetadata(
  props: PageProps<"/teacher/classes/[classId]">,
): Promise<Metadata> {
  const { classId } = await props.params;
  const cls = await getClass(classId);
  return { title: cls ? `${cls.courseCode} ${cls.section}` : "Class" };
}

const panel = "rounded-2xl border border-border bg-surface shadow-sm";

export default async function ClassPage(props: PageProps<"/teacher/classes/[classId]">) {
  const { classId } = await props.params;
  const { tab: rawTab } = await props.searchParams;
  const tab: ClassTab = classTabs.some((t) => t.id === rawTab) ? (rawTab as ClassTab) : "stream";

  const cls = await getClass(classId);
  if (!cls) notFound();

  const [students, sessions, announcements, resources, user] = await Promise.all([
    getStudents(cls.studentIds),
    listSessions({ classId }),
    getAnnouncements(classId),
    getResources(classId),
    readCurrentUser(),
  ]);
  const headerUrl = cls.headerImage ? ((await assetUrls([cls.headerImage]))[cls.headerImage] ?? null) : null;
  const base = `/teacher/classes/${cls.id}`;
  // Assignments and activities are classwork; announcements only show in the stream.
  const work = announcements.filter((a) => a.kind !== "announcement");

  // What is due or opens next: sessions that haven't ended and work with a deadline still ahead, soonest first.
  const now = requestTime();
  const upcoming: UpcomingItem[] = [
    ...sessions
      .filter(({ session }) => session.status !== "ended")
      .map(({ session, quizTitle }) => ({
        id: session.id,
        title: quizTitle,
        detail: `${session.mode[0]!.toUpperCase()}${session.mode.slice(1)}`,
        at: session.opensAt,
        href: `/teacher/assessments/${session.quizId}/sessions/${session.id}`,
      })),
    ...work
      .filter((a) => a.dueAt && Date.parse(a.dueAt) >= now)
      .map((a) => ({
        id: a.id,
        title: a.title,
        detail: `${a.kind[0]!.toUpperCase()}${a.kind.slice(1)}${a.points != null ? ` · ${a.points} points` : ""}`,
        at: a.dueAt,
        href: `${base}/work/${a.id}`,
      })),
  ].sort((a, b) => (a.at ? Date.parse(a.at) : Infinity) - (b.at ? Date.parse(b.at) : Infinity));

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

      <ClassBanner
        cls={cls}
        base={base}
        enrolled={students.length}
        headerUrl={headerUrl}
        newCode={newJoinCodeAction.bind(null, cls.id)}
        customize={customizeClassAction.bind(null, cls.id)}
      />
      <ClassTabs active={tab} base={base} />

      {tab === "people" ? (
        <div className="mx-auto max-w-3xl space-y-6">
          <section className={`${panel} p-5`}>
            <h2 className="border-b-2 border-primary pb-3 font-display text-2xl font-semibold text-primary">Teachers</h2>
            <p className="py-4 text-sm text-muted">You teach this class.</p>
          </section>
          <section className={`${panel} p-5`}>
            <div className="flex items-end justify-between border-b-2 border-primary pb-3">
              <h2 className="font-display text-2xl font-semibold text-primary">Students</h2>
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
          <section className={`${panel} p-5`}>
            <h2 className="border-b-2 border-primary pb-3 font-display text-2xl font-semibold text-primary">Quizzes &amp; exams</h2>
            {sessions.length === 0 && work.length === 0 ? (
              <EmptyState title="No classwork yet">Create an assignment, activity or quiz for this class.</EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {work.map((a) => (
                  <li key={a.id} className="flex items-center gap-4 px-2 py-3.5">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      {a.kind === "assignment" ? (
                        <ClipboardCheck className="size-5" aria-hidden />
                      ) : (
                        <Shapes className="size-5" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link href={`${base}/work/${a.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                        {a.title}
                      </Link>
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
                  <li key={session.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      href={`/teacher/assessments/${session.quizId}/sessions/${session.id}`}
                      className="flex min-w-0 flex-1 items-center gap-4 rounded-lg px-2 py-3.5 hover:bg-surface-muted"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
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
                    {session.status === "ended" && (
                      <ButtonLink href={`/teacher/grading/${session.id}`} variant="secondary" className="shrink-0 text-xs">
                        <ClipboardCheck className="size-3.5" aria-hidden /> Review answers
                      </ButtonLink>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          {/* Left column: what is coming up, and the Classroom link */}
          <aside className="space-y-4 self-start">
            <UpcomingCard items={upcoming} allHref={`${base}?tab=classwork`} />
            <ResourcesCard classId={cls.id} resources={resources} />

            {cls.classroom && (
              <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <div>
                  <h2 className="font-display text-lg font-semibold">Google Classroom</h2>
                  <p className="mt-0.5 text-xs text-muted">Last synced {formatDateTime(cls.classroom.lastSyncedAt)}.</p>
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
              </section>
            )}
          </aside>

          {/* Stream */}
          <div className="min-w-0 space-y-4">
            <CreateMenu
              variant="composer"
              userName={user?.name ?? ""}
              cls={cls}
              post={postAnnouncementAction.bind(null, cls.id)}
            />

            {feed.length === 0 ? (
              <Card>
                <EmptyState title="This is where you'll see announcements, quizzes and exams">
                  Post an announcement, or create a quiz and start a session for this class.
                </EmptyState>
              </Card>
            ) : (
              feed.map((item) =>
                item.type === "announcement" ? (
                  <AnnouncementPost
                    key={item.announcement.id}
                    post={item.announcement}
                    classId={cls.id}
                    classTitle={cls.title}
                    update={updateAnnouncementAction.bind(null, cls.id, item.announcement.id)}
                    remove={deleteAnnouncementAction.bind(null, cls.id, item.announcement.id)}
                  />
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
