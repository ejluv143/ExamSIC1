// Students turning in work for an assignment or activity, and how a teacher sees it. A submission's status is worked
// out from its dates, never stored: assigned, missing (past due and not turned in), turned in, or returned.
import { Schema } from "effect";
import { Attachment } from "./classes.ts";

export const submissionStatuses = ["assigned", "missing", "turned_in", "returned"] as const;
export type SubmissionStatus = (typeof submissionStatuses)[number];

export const submissionStatusLabel: Record<SubmissionStatus, string> = {
  assigned: "Assigned",
  missing: "Missing",
  turned_in: "Turned in",
  returned: "Returned",
};

// `late`: it was turned in after the deadline.
export function submissionStatus(input: {
  dueAt: string | null;
  turnedInAt: string | null;
  returnedAt: string | null;
  now?: string;
}): { status: SubmissionStatus; late: boolean } {
  const { dueAt, turnedInAt, returnedAt } = input;
  const now = input.now ?? new Date().toISOString();
  const late = dueAt !== null && turnedInAt !== null && turnedInAt > dueAt;
  if (returnedAt) return { status: "returned", late };
  if (turnedInAt) return { status: "turned_in", late };
  return { status: dueAt !== null && dueAt < now ? "missing" : "assigned", late: false };
}

// What a student sees of their own work on one post. The score is left out until the teacher returns it.
export const MyWork = Schema.Struct({
  announcementId: Schema.String,
  // The teacher has stopped taking submissions.
  accepting: Schema.Boolean,
  status: Schema.Literals(submissionStatuses),
  late: Schema.Boolean,
  attachments: Schema.Array(Attachment),
  turnedInAt: Schema.NullOr(Schema.String),
  points: Schema.NullOr(Schema.Int),
  score: Schema.NullOr(Schema.Int),
  returnedAt: Schema.NullOr(Schema.String),
});
export type MyWork = typeof MyWork.Type;

// One chip per post for the Classwork tab.
export const MyWorkStatus = Schema.Struct({
  announcementId: Schema.String,
  status: Schema.Literals(submissionStatuses),
  late: Schema.Boolean,
  score: Schema.NullOr(Schema.Int),
});
export type MyWorkStatus = typeof MyWorkStatus.Type;

// A teacher's row for one student on one post.
export const StudentWork = Schema.Struct({
  studentId: Schema.String,
  name: Schema.String,
  status: Schema.Literals(submissionStatuses),
  late: Schema.Boolean,
  attachments: Schema.Array(Attachment),
  turnedInAt: Schema.NullOr(Schema.String),
  score: Schema.NullOr(Schema.Int),
});
export type StudentWork = typeof StudentWork.Type;

export const PostWork = Schema.Struct({
  accepting: Schema.Boolean,
  points: Schema.NullOr(Schema.Int),
  // Students who turned in (or got it back), and students who haven't turned in yet.
  turnedIn: Schema.Int,
  assigned: Schema.Int,
  rows: Schema.Array(StudentWork),
});
export type PostWork = typeof PostWork.Type;

// Assignments worth points go into the class record like quizzes do. The teacher gets every student's graded score
// (whether or not it is returned yet); a student gets only their own, and only once it is returned.
export const RecordAssignment = Schema.Struct({
  announcementId: Schema.String,
  title: Schema.String,
  points: Schema.Int,
  dueAt: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  // Roster id and graded score (null: not graded yet).
  scores: Schema.Array(Schema.Struct({ studentId: Schema.String, score: Schema.NullOr(Schema.Int) })),
});
export type RecordAssignment = typeof RecordAssignment.Type;

export const MyRecordAssignment = Schema.Struct({
  announcementId: Schema.String,
  title: Schema.String,
  points: Schema.Int,
  dueAt: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  turnedIn: Schema.Boolean,
  // The returned score; null while it is still with the teacher.
  score: Schema.NullOr(Schema.Int),
});
export type MyRecordAssignment = typeof MyRecordAssignment.Type;

// The private conversation between one student and the teacher about an assignment or activity.
export const maxCommentLength = 2000;
export const PrivateComment = Schema.Struct({
  id: Schema.String,
  authorName: Schema.String,
  fromTeacher: Schema.Boolean,
  body: Schema.String,
  createdAt: Schema.String,
});
export type PrivateComment = typeof PrivateComment.Type;
export const CommentBody = Schema.String.check(Schema.isMaxLength(maxCommentLength));
