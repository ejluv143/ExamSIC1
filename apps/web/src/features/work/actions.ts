"use server";

import { revalidatePath } from "next/cache";
import { attachmentKinds, type Attachment } from "@examinus/domain/classes";
import type { PrivateComment } from "@examinus/domain/submissions";
import { addMyComment, addStudentComment, getStudentComments, gradeWork, returnWork, setAccepting, turnIn, unsubmit } from "./data";

export type WorkState = { error: string } | { ok: true } | undefined;

const refresh = (classId: string) => {
  revalidatePath(`/student/classes/${classId}`, "layout");
  revalidatePath(`/teacher/classes/${classId}`, "layout");
};

function readAttachments(raw: FormDataEntryValue | null): Attachment[] | null {
  try {
    const parsed: unknown = JSON.parse(String(raw || "[]"));
    if (!Array.isArray(parsed)) return null;
    return parsed.flatMap((a) =>
      a && typeof a === "object" && attachmentKinds.includes(a.kind) && typeof a.url === "string"
        ? [{ kind: a.kind, url: a.url, title: typeof a.title === "string" ? a.title : "" }]
        : [],
    );
  } catch {
    return null;
  }
}

export async function turnInAction(classId: string, announcementId: string, _prev: WorkState, formData: FormData): Promise<WorkState> {
  const attachments = readAttachments(formData.get("attachments"));
  if (!attachments) return { error: "Your attachments couldn't be read." };
  const error = await turnIn(classId, announcementId, attachments);
  if (error) return { error };
  refresh(classId);
  return { ok: true };
}

export async function unsubmitAction(classId: string, announcementId: string): Promise<WorkState> {
  const error = await unsubmit(classId, announcementId);
  if (error) return { error };
  refresh(classId);
  return { ok: true };
}

// A teacher's score for one student; an empty box clears it.
export async function gradeAction(classId: string, announcementId: string, studentId: string, raw: string): Promise<WorkState> {
  const text = raw.trim();
  const score = text === "" ? null : Number(text);
  if (score !== null && !Number.isInteger(score)) return { error: "Use a whole number." };
  const error = await gradeWork(classId, announcementId, studentId, score);
  if (error) return { error };
  refresh(classId);
  return { ok: true };
}

export async function returnWorkAction(classId: string, announcementId: string, studentIds: string[] | null): Promise<WorkState> {
  const error = await returnWork(classId, announcementId, studentIds);
  if (error) return { error };
  refresh(classId);
  return { ok: true };
}

export async function setAcceptingAction(classId: string, announcementId: string, accepting: boolean): Promise<WorkState> {
  const error = await setAccepting(classId, announcementId, accepting);
  if (error) return { error };
  refresh(classId);
  return { ok: true };
}

export type CommentResult = { error: string } | { ok: PrivateComment };

// The student's private comment to the teacher.
export async function addMyCommentAction(classId: string, announcementId: string, body: string): Promise<CommentResult> {
  const result = await addMyComment(classId, announcementId, body);
  if ("ok" in result) revalidatePath(`/student/classes/${classId}`, "layout");
  return result;
}

// The teacher's side: one student's thread, and a reply to it.
export async function loadStudentCommentsAction(
  classId: string,
  announcementId: string,
  studentId: string,
): Promise<{ error: string } | { ok: readonly PrivateComment[] }> {
  return getStudentComments(classId, announcementId, studentId);
}

export async function addStudentCommentAction(classId: string, announcementId: string, studentId: string, body: string): Promise<CommentResult> {
  return addStudentComment(classId, announcementId, studentId, body);
}
