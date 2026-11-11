import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, Shapes } from "lucide-react";
import { bucketOf } from "@examinus/domain/attempts";
import { formatDateTime } from "@examinus/copy/time";
import { submissionStatusLabel } from "@examinus/domain/submissions";
import { Badge, Card, EmptyState } from "@/components/ui";
import { assetUrls } from "@/features/assets/data";
import { getMySessions } from "@/features/attempt/data";
import { AssessmentRow } from "@/features/attempt/components/assessment-row";
import { getMyWorkStatuses } from "@/features/work/data";
import { getMyStanding } from "@/features/records/data/standing";
import { ClassGrades } from "@/features/records/components/standing";
import { me, getMyAnnouncements, getMyClasses, getMyPeople, getMyResources } from "@/features/classes/data";
import { NewAnnouncementButton } from "@/features/classes/components/new-announcement-button";
import { deleteMyAnnouncementAction, postMyAnnouncementAction } from "@/features/classes/actions";
import { ClassBanner } from "@/features/classes/components/class-banner";
import { ClassTabs, classTabs } from "@/features/classes/components/class-tabs";
import { Initials } from "@/features/classes/components/initials";
import { AnnouncementPost, SessionPost } from "@/features/classes/components/stream-post";
import { ResourcesCard } from "@/features/classes/components/resources-card";
import { UpcomingCard, requestTime, type UpcomingItem } from "@/features/classes/components/upcoming-card";
import { sessionGroupOf } from "@/features/session/components/assessment-bits";

export const metadata: Metadata = { title: "Class" };

const tabIds = [...classTabs.map((t) => t.id), "grades"] as const;
type Tab = (typeof tabIds)[number];

const panel = "rounded-2xl border border-border bg-surface shadow-sm";

export default async function StudentClassPage(props: PageProps<"/student/classes/[classId]">) {
  const { classId } = await props.params;
  const { tab: rawTab } = await props.searchParams;
  const tab: Tab = tabIds.includes(rawTab as Tab) ? (rawTab as Tab) : "stream";

  const [classes, items, announcements, people, standing, statuses, resources] = await Promise.all([
    getMyClasses(),
    getMySessions(),
    getMyAnnouncements(classId),
    getMyPeople(classId),
    tab === "grades" ? getMyStanding() : Promise.resolve([]),
    getMyWorkStatuses(classId),
    getMyResources(classId),
  ]);
  const cls = classes.find((c) => c.id === classId);
  if (!cls) notFound();
  const { user } = await me({ enrollment: ["read"] });
  const headerUrl = cls.headerImage ? ((await assetUrls([cls.headerImage]))[cls.headerImage] ?? null) : null;

  const base = `/student/classes/${cls.id}`;
  const mine = items.filter((i) => i.session.classId === cls.id);
  const work = announcements.filter((a) => a.kind !== "announcement");
  const sessionHref = (id: string, mode: string) => (mode === "game" ? `/student/game/${id}` : `/student/assessments/${id}`);

  // What is due or opens next: the student's own sessions that haven't ended, and work with a deadline still
  // ahead, soonest first. Same shape as the teacher's Upcoming card, so it looks and behaves the same way.
  const now = requestTime();
  const upcoming: UpcomingItem[] = [
    ...mine
      .filter((i) => bucketOf(i) !== "done")
      .map((i) => ({
        id: i.session.id,
        title: i.quizTitle,
        detail: `${i.session.mode[0]!.toUpperCase()}${i.session.mode.slice(1)}`,
        at: i.session.opensAt,
        href: sessionHref(i.session.id, i.session.mode),
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

  // The stream: the teacher's announcements and posted work, and the class's quiz/exam sessions, newest first,
  // with a live (or open-lobby) session pinned to the top, exactly like the teacher sees it.
  const feed = [
    ...announcements.map((announcement) => ({ type: "announcement" as const, at: Date.parse(announcement.createdAt), announcement })),
    ...mine.map((i) => ({ type: "session" as const, at: Date.parse(i.session.opensAt ?? "") || 0, item: i })),
  ].sort((a, b) => {
    const live = (x: (typeof feed)[number]) => (x.type === "session" && sessionGroupOf(x.item.session) === "live" ? 1 : 0);
    return live(b) - live(a) || b.at - a.at;
  });

  return (
    <>
      <Link href="/student/classes" className="mb-3 inline-block text-sm text-muted hover:text-foreground">
        ← Classes
      </Link>

      <ClassBanner cls={cls} base={base} enrolled={people.classmates.length + 1} headerUrl={headerUrl} />
      <ClassTabs active={tab} base={base} gradesHref={`${base}?tab=grades`} />

      {tab === "grades" ? (
        standing.find((x) => x.class.id === cls.id) ? (
          <ClassGrades subject={standing.find((x) => x.class.id === cls.id)!} />
        ) : (
          <Card>
            <EmptyState title="No grades yet" />
          </Card>
        )
      ) : tab === "people" ? (
        <div className="mx-auto max-w-3xl space-y-6">
          <section className={`${panel} p-5`}>
            <h2 className="border-b-2 border-primary pb-3 font-display text-2xl font-semibold text-primary">Teachers</h2>
            {people.teachers.length === 0 ? (
              <p className="py-4 text-sm text-muted">No teacher listed.</p>
            ) : (
              <ul className="divide-y divide-border">
                {people.teachers.map((name) => (
                  <Person key={name} name={name} />
                ))}
              </ul>
            )}
          </section>
          <section className={`${panel} p-5`}>
            <div className="flex items-end justify-between border-b-2 border-primary pb-3">
              <h2 className="font-display text-2xl font-semibold text-primary">Classmates</h2>
              <p className="text-sm text-primary">
                {people.classmates.length} {people.classmates.length === 1 ? "student" : "students"}
              </p>
            </div>
            {people.classmates.length === 0 ? (
              <EmptyState title="No classmates yet" />
            ) : (
              <ul className="divide-y divide-border">
                {people.classmates.map((name, i) => (
                  <Person key={`${name}-${i}`} name={name} />
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : tab === "classwork" ? (
        <div className="mx-auto max-w-3xl space-y-6">
          <section className={`${panel} p-5`}>
            <h2 className="border-b-2 border-primary pb-3 font-display text-2xl font-semibold text-primary">Quizzes &amp; exams</h2>
            {mine.length === 0 ? (
              <EmptyState title="No quizzes or exams yet" />
            ) : (
              <ul className="divide-y divide-border">
                {mine.map((i) => (
                  <AssessmentRow key={i.session.id} item={i} classes={classes} />
                ))}
              </ul>
            )}
          </section>
          <section className={`${panel} p-5`}>
            <h2 className="border-b-2 border-primary pb-3 font-display text-2xl font-semibold text-primary">Assignments &amp; activities</h2>
            {work.length === 0 ? (
              <EmptyState title="No classwork yet" />
            ) : (
              <ul className="divide-y divide-border">
                {work.map((a) => {
                  const status = statuses.get(a.id);
                  return (
                    <li key={a.id} className="flex items-center gap-4 px-2 py-3.5">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                        {a.kind === "assignment" ? <ClipboardCheck className="size-5" aria-hidden /> : <Shapes className="size-5" aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <Link href={`${base}/work/${a.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                          {a.title}
                        </Link>
                        <span className="block text-sm text-muted">
                          {a.dueAt ? `Due ${formatDateTime(a.dueAt)}` : `Posted ${formatDateTime(a.createdAt)}`}
                          {a.points != null && ` · ${a.points} pts`}
                        </span>
                      </span>
                      {status && (
                        <Badge tone={status.status === "missing" ? "danger" : status.status === "assigned" ? "neutral" : status.status === "returned" ? "info" : "success"}>
                          {submissionStatusLabel[status.status]}
                          {status.late && " late"}
                          {status.score !== null && a.points !== null && ` · ${status.score}/${a.points}`}
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          {/* Left column: what is coming up, and the class's resources, like the teacher's view */}
          <aside className="space-y-4 self-start">
            <UpcomingCard items={upcoming} allHref={`${base}?tab=classwork`} />
            <ResourcesCard classId={cls.id} resources={resources} canManage={false} />
          </aside>

          {/* Stream */}
          <div className="min-w-0 space-y-4">
            <NewAnnouncementButton post={postMyAnnouncementAction.bind(null, cls.id)} classTitle={cls.title} />

            {feed.length === 0 ? (
              <Card>
                <EmptyState title="This is where you'll see announcements, quizzes and exams">Your teacher&apos;s posts show up here.</EmptyState>
              </Card>
            ) : (
              feed.map((entry) =>
                entry.type === "announcement" ? (
                  <AnnouncementPost
                    key={entry.announcement.id}
                    post={entry.announcement}
                    classId={cls.id}
                    classTitle={cls.title}
                    remove={entry.announcement.authorId === user.id ? deleteMyAnnouncementAction.bind(null, cls.id, entry.announcement.id) : undefined}
                    workHref={`${base}/work/${entry.announcement.id}`}
                    workLabel={(() => {
                      const status = statuses.get(entry.announcement.id)?.status;
                      return status === "turned_in" || status === "returned" ? "View your work" : "Open and turn in";
                    })()}
                    footer={(() => {
                      const status = statuses.get(entry.announcement.id);
                      return (
                        status && (
                          <Badge tone={status.status === "missing" ? "danger" : status.status === "assigned" ? "neutral" : status.status === "returned" ? "info" : "success"}>
                            {submissionStatusLabel[status.status]}
                            {status.late && " late"}
                            {status.score !== null && entry.announcement.points !== null && ` · ${status.score}/${entry.announcement.points}`}
                          </Badge>
                        )
                      );
                    })()}
                  />
                ) : (
                  <SessionPost
                    key={entry.item.session.id}
                    item={{ session: entry.item.session, quizTitle: entry.item.quizTitle }}
                    href={sessionHref(entry.item.session.id, entry.item.session.mode)}
                    cta={entry.item.session.status === "lobby" ? "Join the lobby" : "Join the live session"}
                    ended={
                      entry.item.lastSubmittedAt ? (
                        <Link
                          href={entry.item.session.mode === "game" ? `/student/game/${entry.item.session.id}/results` : `/student/assessments/${entry.item.session.id}/result`}
                          className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                        >
                          {entry.item.result ? (
                            <span className="tabular-nums">
                              {entry.item.result.score} <span className="font-normal text-muted">/ {entry.item.result.max}</span>
                            </span>
                          ) : (
                            "Score not out yet"
                          )}
                          →
                        </Link>
                      ) : (
                        <p className="text-sm text-danger">You didn&apos;t submit.</p>
                      )
                    }
                  />
                ),
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Person({ name }: { name: string }) {
  return (
    <li className="flex items-center gap-4 py-3">
      <Initials name={name} />
      <span className="min-w-0 truncate font-medium">{name}</span>
    </li>
  );
}
