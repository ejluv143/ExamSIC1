import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import Link from "next/link";
import { ButtonDownload, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/dal";
import { quizQuestions } from "@/features/session/attempt-view";
import { getSession, getSubmittedAttemptsPage } from "@/features/session/data";
import { getStudents } from "@/features/classes/data";
import { assetUrls } from "@/features/assets/data";
import { assetIdsIn } from "@examinus/domain/asset";
import { resultsVisible } from "@examinus/domain/release";
import { Grader } from "@/features/session/components/grader";

export const metadata: Metadata = { title: "Review answers" };

export default async function GradeSessionPage(props: PageProps<"/teacher/grading/[sessionId]">) {
  await requirePermission({ submission: ["grade"] });
  const { sessionId } = await props.params;
  const { attempt, cursor } = await props.searchParams;
  const after = typeof cursor === "string" ? cursor : undefined;
  // An unknown session is a 404 from either call. The submitted attempts come a page at a time (the link below the
  // grader goes to the next page).
  const [detail, page] = await Promise.all([getSession(sessionId), getSubmittedAttemptsPage(sessionId, after)]);
  if (!detail) notFound();

  const attempts = [...page.items];
  // Pictures in the questions, and the students' drawings and photos.
  const questions = quizQuestions(detail.quiz);
  const [students, urls] = await Promise.all([
    getStudents(attempts.map((d) => d.studentId)),
    assetUrls(assetIdsIn(JSON.stringify([questions, attempts.map((d) => d.answers)]))),
  ]);
  const exam = detail.session.mode === "exam";

  return (
    <>
      <PageHeader
        back={{
          href: `/teacher/assessments/${detail.session.quizId}/sessions/${sessionId}`,
          label: detail.quiz.quiz.title,
        }}
        title="Review answers"
        actions={
          <ButtonDownload href={`/teacher/assessments/${detail.session.quizId}/sessions/${sessionId}/export`}>
            <Download className="size-4" aria-hidden /> Export results (Excel)
          </ButtonDownload>
        }
      />
      <Grader
        questions={questions}
        attempts={attempts}
        students={students}
        assetUrls={urls}
        initialAttemptId={typeof attempt === "string" ? attempt : undefined}
        examMode={exam}
        reportBase={exam ? `/teacher/assessments/${detail.session.quizId}/sessions/${sessionId}/report` : null}
        reasonRequired={exam && resultsVisible(detail.session)}
      />
      {(after !== undefined || page.nextCursor !== null) && (
        <nav aria-label="Pages of students" className="mt-4 flex items-center justify-between text-sm">
          {after !== undefined ? (
            <Link href={`/teacher/grading/${sessionId}`} className="underline">
              ← Back to the first students
            </Link>
          ) : (
            <span />
          )}
          {page.nextCursor !== null && (
            <Link href={`/teacher/grading/${sessionId}?cursor=${encodeURIComponent(page.nextCursor)}`} className="underline">
              Next students →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
