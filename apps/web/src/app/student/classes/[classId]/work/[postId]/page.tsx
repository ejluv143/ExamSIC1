import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime } from "@examinus/copy/time";
import { Card } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { getMyAnnouncements, getMyClasses } from "@/features/classes/data";
import { AttachmentList, PostDetails } from "@/features/classes/components/announcements";
import { readCurrentUser } from "@/lib/auth/dal";
import { addMyCommentAction } from "@/features/work/actions";
import { getMyComments, getMyWork } from "@/features/work/data";
import { PrivateComments } from "@/features/work/components/private-comments";
import { YourWork } from "@/features/work/components/your-work";

export const metadata: Metadata = { title: "Assignment" };

export default async function StudentWorkPage(props: PageProps<"/student/classes/[classId]/work/[postId]">) {
  const { classId, postId } = await props.params;
  const [classes, posts, work, comments, user] = await Promise.all([
    getMyClasses(),
    getMyAnnouncements(classId),
    getMyWork(classId, postId),
    getMyComments(classId, postId),
    readCurrentUser(),
  ]);
  const cls = classes.find((c) => c.id === classId);
  const post = posts.find((p) => p.id === postId);
  if (!cls || !post || !work) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href={`/student/classes/${classId}?tab=classwork`} className="inline-block text-sm text-muted hover:text-foreground">
        ← {cls.courseCode} · Classwork
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{post.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {post.kind === "activity" ? "Activity" : "Assignment"} · Posted {formatDateTime(post.createdAt)}
          {post.dueAt && ` · Due ${formatDateTime(post.dueAt)}`}
        </p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <Card className="p-5">
          {post.body ? <Markdown className="text-sm">{post.body}</Markdown> : <p className="text-sm text-muted">No instructions.</p>}
          <PostDetails post={post} />
          <AttachmentList attachments={post.attachments} />
        </Card>
        <div className="space-y-5">
          <YourWork classId={classId} announcementId={postId} work={work} />
          <PrivateComments
            initial={comments}
            send={addMyCommentAction.bind(null, classId, postId)}
            me={{ name: user?.name ?? "You", fromTeacher: false }}
            who="Only you and your teacher"
            placeholder="Add a private comment for your teacher…"
          />
        </div>
      </div>
    </div>
  );
}
