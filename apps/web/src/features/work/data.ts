import "server-only";
import { Result } from "effect";
import type { Attachment } from "@examinus/domain/classes";
import type { PrivateComment } from "@examinus/domain/submissions";
import { apiCall, messageOf } from "@/lib/api/helpers";
import { requirePermission } from "@/lib/auth/dal";

// --- The student's side ---

export async function getMyWork(classId: string, announcementId: string) {
  await requirePermission({ enrollment: ["read"] });
  const result = await apiCall((api) => api["work.mine"]({ classId, announcementId }));
  return Result.isSuccess(result) ? result.success : null;
}

// Where the student stands on each assignment and activity of the class, by post id.
export async function getMyWorkStatuses(classId: string) {
  await requirePermission({ enrollment: ["read"] });
  const result = await apiCall((api) => api["work.classMine"]({ classId }));
  return new Map((Result.isSuccess(result) ? result.success : []).map((s) => [s.announcementId, s]));
}

export async function turnIn(classId: string, announcementId: string, attachments: Attachment[]) {
  await requirePermission({ enrollment: ["read"] });
  return messageOf(await apiCall((api) => api["work.turnIn"]({ classId, announcementId, attachments })));
}

export async function unsubmit(classId: string, announcementId: string) {
  await requirePermission({ enrollment: ["read"] });
  return messageOf(await apiCall((api) => api["work.unsubmit"]({ classId, announcementId })));
}

// The private thread between the student and the teacher on a post, oldest first.
export async function getMyComments(classId: string, announcementId: string): Promise<readonly PrivateComment[]> {
  await requirePermission({ enrollment: ["read"] });
  const result = await apiCall((api) => api["work.myComments"]({ classId, announcementId }));
  return Result.isSuccess(result) ? result.success : [];
}

// The new comment, or what went wrong.
export async function addMyComment(classId: string, announcementId: string, body: string) {
  await requirePermission({ enrollment: ["read"] });
  const result = await apiCall((api) => api["work.addMyComment"]({ classId, announcementId, body }));
  return Result.isSuccess(result) ? { ok: result.success } : { error: messageOf(result) ?? "The comment couldn't be sent." };
}

// --- The teacher's side ---

export async function getPostWork(classId: string, announcementId: string) {
  await requirePermission({ class: ["read"] });
  const result = await apiCall((api) => api["work.list"]({ classId, announcementId }));
  return Result.isSuccess(result) ? result.success : null;
}

export async function gradeWork(classId: string, announcementId: string, studentId: string, score: number | null) {
  await requirePermission({ class: ["update"] });
  return messageOf(await apiCall((api) => api["work.grade"]({ classId, announcementId, studentId, score })));
}

export async function returnWork(classId: string, announcementId: string, studentIds: string[] | null) {
  await requirePermission({ class: ["update"] });
  return messageOf(await apiCall((api) => api["work.returnWork"]({ classId, announcementId, studentIds })));
}

export async function setAccepting(classId: string, announcementId: string, accepting: boolean) {
  await requirePermission({ class: ["update"] });
  return messageOf(await apiCall((api) => api["work.setAccepting"]({ classId, announcementId, accepting })));
}

// One student's private thread on a post, from the teacher's side.
export async function getStudentComments(classId: string, announcementId: string, studentId: string) {
  await requirePermission({ class: ["read"] });
  const result = await apiCall((api) => api["work.studentComments"]({ classId, announcementId, studentId }));
  return Result.isSuccess(result) ? { ok: result.success } : { error: messageOf(result) ?? "The comments couldn't be loaded." };
}

export async function addStudentComment(classId: string, announcementId: string, studentId: string, body: string) {
  await requirePermission({ class: ["update"] });
  const result = await apiCall((api) => api["work.addStudentComment"]({ classId, announcementId, studentId, body }));
  return Result.isSuccess(result) ? { ok: result.success } : { error: messageOf(result) ?? "The comment couldn't be sent." };
}
