import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { ClipboardCheck, ExternalLink, Megaphone, Shapes, Video } from "lucide-react";
import { classColors } from "@examinus/domain/classes";
import { bucketOf } from "@examinus/domain/attempts";
import { formatDateTime } from "@examinus/copy/time";
import { Card, EmptyState } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { assetUrls } from "@/features/assets/data";
import { getMySessions } from "@/features/attempt/data";
import { AssessmentRow } from "@/features/attempt/components/assessment-row";
import { getMyWorkStatuses } from "@/features/work/data";
import { submissionStatusLabel } from "@examinus/domain/submissions";
import { Badge } from "@/components/ui";
import { getMyStanding } from "@/features/records/data/standing";
import { ClassGrades } from "@/features/records/components/standing";
import { me, getMyAnnouncements, getMyClasses, getMyPeople } from "@/features/classes/data";
import { AttachmentList, DeleteAnnouncementButton, PostDetails } from "@/features/classes/components/announcements";
import { NewAnnouncementButton } from "@/features/classes/components/new-announcement-button";
import { deleteMyAnnouncementAction, postMyAnnouncementAction } from "@/features/classes/actions";

export const metadata: Metadata = { title: "Class" };

const tabs = [
  { id: "stream", label: "Stream" },
  { id: "classwork", label: "Classwork" },
  { id: "people", label: "People" },
  { id: "grades", label: "Grades" },
] as const;

export default async function StudentClassPage(props: PageProps<"/student/classes/[classId]">) {
  const { classId } = await props.params;
  const { tab: rawTab } = await props.searchParams;
  const tab = tabs.find((t) => t.id === rawTab)?.id ?? "stream";

  const [classes, items, announcements, people, standing, statuses] = await Promise.all([
    getMyClasses(),
    getMySessions(),
    getMyAnnouncements(classId),
    getMyPeople(classId),
    tab === "grades" ? getMyStanding() : Promise.resolve([]),
    getMyWorkStatuses(classId),
  ]);
  const cls = classes.find((c) => c.id === classId);
  if (!cls) notFound();
  const { user } = await me({ enrollment: ["read"] });
  const headerUrl = cls.headerImage ? ((await assetUrls([cls.headerImage]))[cls.headerImage] ?? null) : null;

  const base = `/student/classes/${cls.id}`;
  const mine = items.filter((i) => i.session.classId === cls.id);
  const upcoming = mine.filter((i) => bucketOf(i) !== "done").slice(0, 4);
  const work = announcements.filter((a) => a.kind !== "announcement");

  return (
    <>
      <Link href="/student/classes" className="mb-3 inline-block text-sm text-muted hover:text-foreground">
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
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted hover:bg-surface-muted hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {/* Banner */}
      <section
        className={clsx(
          "relative mb-6 overflow-hidden rounded-2xl bg-cover bg-center p-6 sm:p-8",
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
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-64 rounded-full bg-white/10 sm:size-80" />
        <div aria-hidden className="pointer-events-none absolute right-24 -bottom-24 size-56 rounded-full bg-white/10" />
        <div className="relative flex min-h-36 flex-col justify-between gap-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {cls.courseCode} · {cls.title}
            </h1>
            <p className="mt-2 text-lg opacity-90">{cls.section}</p>
            <p className="mt-1 text-sm opacity-80">
              {cls.schedule} · {cls.room} · {cls.term}
            </p>
          </div>
          {cls.eroomUrl && (
            <a
              href={cls.eroomUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <Video className="size-4" aria-hidden /> Join e-room
            </a>
          )}
          {cls.classroom && (
            <a href={cls.classroom.link} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1.5 text-sm hover:underline">
              Open in Classroom <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
      </section>

      {tab === "grades" ? (
        standing.find((x) => x.class.id === cls.id) ? (
          <ClassGrades subject={standing.find((x) => x.class.id === cls.id)!} />
        ) : (
          <Card>
            <EmptyState title="No grades yet" />
          </Card>
        )
      ) : tab === "people" ? (
        <div className="mx-auto max-w-3xl space-y-8">
          <section>
            <h2 className="border-b-2 border-primary pb-3 text-2xl font-medium text-primary">Teachers</h2>
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
          <section>
            <div className="flex items-end justify-between border-b-2 border-primary pb-3">
              <h2 className="text-2xl font-medium text-primary">Classmates</h2>
              <p className="text-sm text-muted">
                {people.classmates.length} {people.classmates.length === 1 ? "student" : "students"}
              </p>
            </div>
            <ul className="divide-y divide-border">
              {people.classmates.map((name, i) => (
                <Person key={`${name}-${i}`} name={name} />
              ))}
            </ul>
          </section>
        </div>
      ) : tab === "classwork" ? (
        <div className="mx-auto max-w-3xl space-y-6">
          <section>
            <h2 className="mb-2 border-b-2 border-primary pb-2 text-xl font-medium text-primary">Quizzes and exams</h2>
            <Card>
              {mine.length === 0 ? (
                <EmptyState title="No quizzes or exams yet" />
              ) : (
                <ul className="divide-y divide-border">
                  {mine.map((i) => (
                    <AssessmentRow key={i.session.id} item={i} classes={classes} />
                  ))}
                </ul>
              )}
            </Card>
          </section>
          <section>
            <h2 className="mb-2 border-b-2 border-primary pb-2 text-xl font-medium text-primary">Assignments and activities</h2>
            {work.length === 0 ? (
              <p className="py-2 text-sm text-muted">Nothing posted yet.</p>
            ) : (
              <div className="space-y-3">
                {work.map((a) => (
                  <Post key={a.id} post={a} classId={cls.id} status={statuses.get(a.id)} />
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="space-y-4">
            <Card className="p-4">
              <p className="mb-2 font-medium">Upcoming</p>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted">No work due soon</p>
              ) : (
                <ul className="space-y-3">
                  {upcoming.map(({ session, quizTitle }) => (
                    <li key={session.id}>
                      <Link href={`/student/assessments/${session.id}`} className="block text-sm hover:underline">
                        <span className="block truncate font-medium">{quizTitle}</span>
                        <span className="text-xs text-muted">{session.opensAt ? formatDateTime(session.opensAt) : "Not scheduled"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`${base}?tab=classwork`} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </Card>
          </aside>
          <div className="space-y-4">
            <NewAnnouncementButton post={postMyAnnouncementAction.bind(null, cls.id)} classTitle={cls.title} />
            {announcements.length === 0 ? (
              <Card>
                <EmptyState title="This is where you'll see announcements">Your teacher's posts show up here.</EmptyState>
              </Card>
            ) : (
              announcements.map((a) => (
                <Post key={a.id} post={a} classId={cls.id} status={statuses.get(a.id)} remove={a.authorId === user.id ? deleteMyAnnouncementAction.bind(null, cls.id, a.id) : undefined} />
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Post({
  post,
  remove,
  classId,
  status,
}: {
  post: Awaited<ReturnType<typeof getMyAnnouncements>>[number];
  classId: string;
  status?: Awaited<ReturnType<typeof getMyWorkStatuses>> extends Map<string, infer V> ? V : never;
  remove?: () => Promise<{ error: string } | undefined>;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          {post.kind === "assignment" ? (
            <ClipboardCheck className="size-5" aria-hidden />
          ) : post.kind === "activity" ? (
            <Shapes className="size-5" aria-hidden />
          ) : (
            <Megaphone className="size-5" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{post.kind === "announcement" ? post.authorName || "Your teacher" : `New ${post.kind}: ${post.title}`}</p>
          <p className="text-sm text-muted">
            {formatDateTime(post.createdAt)}
            {post.dueAt && ` · Due ${formatDateTime(post.dueAt)}`}
          </p>
        </div>
        {remove && <DeleteAnnouncementButton remove={remove} />}
      </div>
      {post.body && <Markdown className="mt-3 text-sm">{post.body}</Markdown>}
      <PostDetails post={post} />
      <AttachmentList attachments={post.attachments} />
      {post.kind !== "announcement" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Link href={`/student/classes/${classId}/work/${post.id}`} className="text-sm font-medium text-primary hover:underline">
            {status?.status === "turned_in" || status?.status === "returned" ? "View your work" : "Open and turn in"}
          </Link>
          {status && (
            <Badge tone={status.status === "missing" ? "danger" : status.status === "assigned" ? "neutral" : status.status === "returned" ? "info" : "success"}>
              {submissionStatusLabel[status.status]}
              {status.late && " late"}
              {status.score !== null && post.points !== null && ` · ${status.score}/${post.points}`}
            </Badge>
          )}
        </div>
      )}
    </Card>
  );
}

function Person({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <li className="flex items-center gap-4 py-3">
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
        {initials}
      </span>
      <span className="min-w-0 truncate">{name}</span>
    </li>
  );
}
