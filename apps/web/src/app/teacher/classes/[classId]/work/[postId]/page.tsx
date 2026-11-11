import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { formatDateTime } from "@examinus/copy/time";
import { Card } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { getAnnouncements, getClass } from "@/features/classes/data";
import { AttachmentList, PostDetails } from "@/features/classes/components/announcements";
import { getPostWork } from "@/features/work/data";
import { StudentWorkBoard } from "@/features/work/components/student-work-board";

export const metadata: Metadata = { title: "Student work" };

const tabs = [
  { id: "work", label: "Student work" },
  { id: "instructions", label: "Instructions" },
] as const;

export default async function TeacherWorkPage(props: PageProps<"/teacher/classes/[classId]/work/[postId]">) {
  const { classId, postId } = await props.params;
  const { tab: rawTab } = await props.searchParams;
  const tab = tabs.find((t) => t.id === rawTab)?.id ?? "work";
  const [cls, posts, work] = await Promise.all([getClass(classId), getAnnouncements(classId), getPostWork(classId, postId)]);
  const post = posts.find((p) => p.id === postId);
  if (!cls || !post || !work) notFound();
  const base = `/teacher/classes/${classId}/work/${postId}`;

  return (
    <>
      <Link href={`/teacher/classes/${classId}?tab=classwork`} className="mb-3 inline-block text-sm text-muted hover:text-foreground">
        ← {cls.courseCode} · Classwork
      </Link>
      <nav aria-label="Assignment sections" className="mb-5 flex flex-wrap items-center gap-x-1 border-b border-border">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={t.id === "work" ? base : `${base}?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={clsx("-mb-px border-b-[3px] px-5 py-3 text-sm font-medium", tab === t.id ? "border-primary text-primary" : "border-transparent text-muted hover:bg-surface-muted hover:text-foreground")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "instructions" ? (
        <div className="mx-auto max-w-3xl space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{post.title}</h1>
            <p className="mt-1 text-sm text-muted">
              Posted {formatDateTime(post.createdAt)}
              {post.dueAt && ` · Due ${formatDateTime(post.dueAt)}`}
            </p>
          </div>
          <Card className="p-5">
            {post.body ? <Markdown className="text-sm">{post.body}</Markdown> : <p className="text-sm text-muted">No instructions.</p>}
            <PostDetails post={post} />
            <AttachmentList attachments={post.attachments} />
          </Card>
        </div>
      ) : (
        <StudentWorkBoard classId={classId} announcementId={postId} title={post.title} work={work} />
      )}
    </>
  );
}
