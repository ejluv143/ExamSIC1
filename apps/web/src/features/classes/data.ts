import "server-only";
import { Result } from "effect";
import type { ClassAppearance, ClassInfo, RosterStudent, ClassFields, PostFields, ResourceFields } from "@examinus/domain/classes";
import type { Class, Student } from "./types";
import { requirePermission, requireStudent } from "@/lib/auth/dal";
import { apiCall, apiValue, messageOf } from "@/lib/api/helpers";
import { cache } from "react";
import type { Permissions } from "@examinus/domain/permissions";
import type { Sex } from "@examinus/domain/roles";
import type { ClassroomCourse } from "@examinus/contract/classroom";
import type { ResponseCookie } from "@examinus/domain/user";

// The API's class in the shape the pages use.
export const toClass = (c: ClassInfo & { readonly joinCode?: string }): Class => ({
  id: c.id,
  courseCode: c.courseCode,
  title: c.title,
  section: c.section,
  term: c.term,
  schedule: c.schedule,
  room: c.room,
  eroomUrl: c.eroomUrl,
  units: c.units,
  classroom: c.classroom,
  studentIds: [...c.studentIds],
  // Unset: the pages guess it from the course code and title.
  ...(c.subjectArea && { subjectArea: c.subjectArea }),
  ...(c.color && { color: c.color }),
  ...(c.headerImage && { headerImage: c.headerImage }),
  ...(c.joinCode !== undefined && { joinCode: c.joinCode }),
});

export const toStudent = (s: RosterStudent): Student => ({ ...s });

// The signed-in teacher's classes (archived ones left out).
export async function getClasses(): Promise<Class[]> {
  await requirePermission({ class: ["read"] });
  return (await apiValue((api) => api["class.list"]())).map(toClass);
}

// One of the signed-in teacher's classes, or null.
export async function getClass(id: string): Promise<Class | null> {
  await requirePermission({ class: ["read"] });
  const cls = await apiValue((api) => api["class.get"]({ classId: id }));
  return cls && toClass(cls);
}

// Students on the teacher's class rosters or on their sessions' rosters; other ids are left out.
export async function getStudents(ids: string[]): Promise<Student[]> {
  await requirePermission({ roster: ["read"] });
  if (ids.length === 0) return [];
  const list = await apiValue((api) => api["class.students"]({ studentIds: ids }));
  return list.map(toStudent).sort((a, b) => a.lastName.localeCompare(b.lastName));
}

export async function getStudent(id: string) {
  return (await getStudents([id]))[0] ?? null;
}

// Creates a class with a new join code; returns its id.
export async function createClass(fields: ClassFields): Promise<string> {
  await requirePermission({ class: ["create"] });
  return (await apiValue((api) => api["class.create"](fields))).id;
}

// The rest return an error message, or null when done.
// The banner's colour and picture.
export async function customizeClass(classId: string, appearance: ClassAppearance) {
  await requirePermission({ class: ["update"] });
  return messageOf(await apiCall((api) => api["class.customize"]({ classId, appearance })));
}

export async function updateClass(classId: string, fields: ClassFields) {
  await requirePermission({ class: ["update"] });
  return messageOf(await apiCall((api) => api["class.update"]({ classId, fields })));
}

export async function archiveClass(classId: string) {
  await requirePermission({ class: ["delete"] });
  return messageOf(await apiCall((api) => api["class.archive"]({ classId })));
}

export async function newJoinCode(classId: string) {
  await requirePermission({ class: ["update"] });
  return messageOf(await apiCall((api) => api["class.newJoinCode"]({ classId })));
}

export async function removeStudent(classId: string, studentId: string) {
  await requirePermission({ roster: ["update"] });
  return messageOf(await apiCall((api) => api["class.removeStudent"]({ classId, studentId })));
}

// The class's announcements, newest first.
export async function getAnnouncements(classId: string) {
  await requirePermission({ class: ["read"] });
  const result = await apiCall((api) => api["class.announcements"]({ classId }));
  return Result.isSuccess(result) ? result.success : [];
}

export async function postAnnouncement(classId: string, post: PostFields) {
  await requirePermission({ class: ["update"] });
  return messageOf(await apiCall((api) => api["class.postAnnouncement"]({ classId, post })));
}

export async function updateAnnouncement(classId: string, announcementId: string, post: PostFields) {
  await requirePermission({ class: ["update"] });
  return messageOf(await apiCall((api) => api["class.updateAnnouncement"]({ classId, announcementId, post })));
}

export async function deleteAnnouncement(classId: string, announcementId: string) {
  await requirePermission({ class: ["update"] });
  return messageOf(await apiCall((api) => api["class.deleteAnnouncement"]({ classId, announcementId })));
}

// The class's Resources shelf, oldest first.
export async function getResources(classId: string) {
  await requirePermission({ class: ["read"] });
  const result = await apiCall((api) => api["class.resources"]({ classId }));
  return Result.isSuccess(result) ? result.success : [];
}

export async function addResource(classId: string, resource: ResourceFields) {
  await requirePermission({ class: ["update"] });
  return messageOf(await apiCall((api) => api["class.addResource"]({ classId, resource })));
}

export async function deleteResource(classId: string, resourceId: string) {
  await requirePermission({ class: ["update"] });
  return messageOf(await apiCall((api) => api["class.deleteResource"]({ classId, resourceId })));
}

// Asked once per request, however many functions on the page need it.
const myEnrollment = cache(() => apiValue((api) => api["enrollment.mine"]()));

// The signed-in student, once their role is confirmed to grant `permissions`.
export async function me(permissions: Permissions) {
  await requirePermission(permissions);
  const signedIn = await requireStudent();
  // Their roster entry, made the first time they join a class; the API names them by its id.
  const { student, classes } = await myEnrollment();
  const user = { ...signedIn, studentId: student?.id ?? "" };
  const myClasses = classes.map(toClass);
  return { user, student, myClasses };
}

export async function getMyClasses() {
  return (await me({ enrollment: ["read"] })).myClasses;
}

// Before their first class, joining also asks for their student number and sex (for the teacher's grade sheet).
// Also when their roster entry was imported from Google Classroom, which has neither yet.
// The posts of a class the student belongs to, newest first.
export async function getMyAnnouncements(classId: string) {
  await requirePermission({ enrollment: ["read"] });
  const result = await apiCall((api) => api["enrollment.announcements"]({ classId }));
  return Result.isSuccess(result) ? result.success : [];
}

export async function postMyAnnouncement(classId: string, post: PostFields) {
  await requirePermission({ enrollment: ["read"] });
  return messageOf(await apiCall((api) => api["enrollment.post"]({ classId, post })));
}

export async function deleteMyAnnouncement(classId: string, announcementId: string) {
  await requirePermission({ enrollment: ["read"] });
  return messageOf(await apiCall((api) => api["enrollment.deletePost"]({ classId, announcementId })));
}

// Names of the teacher and the students of a class the student belongs to.
export async function getMyPeople(classId: string) {
  await requirePermission({ enrollment: ["read"] });
  const result = await apiCall((api) => api["enrollment.people"]({ classId }));
  return Result.isSuccess(result) ? result.success : { teachers: [], classmates: [] };
}

// The class's Resources shelf, oldest first: read-only for a student.
export async function getMyResources(classId: string) {
  await requirePermission({ enrollment: ["read"] });
  const result = await apiCall((api) => api["enrollment.resources"]({ classId }));
  return Result.isSuccess(result) ? result.success : [];
}

export async function isFirstJoin() {
  const { student } = await me({ enrollment: ["read"] });
  return student === null || !student.studentNumber || !student.sex;
}

// Joins a class with its code. Returns an error message, or null when joined.
export async function joinClass(code: string, sex: Sex | null, studentNumber: string | null) {
  await requirePermission({ enrollment: ["create"] });
  return messageOf(await apiCall((api) => api["enrollment.join"]({ code, sex, studentNumber })));
}

// What a class code opens, so the student can confirm before joining.
export async function previewClass(code: string) {
  await requirePermission({ enrollment: ["create"] });
  const result = await apiCall((api) => api["enrollment.preview"]({ code }));
  return Result.isSuccess(result) ? ({ ok: result.success } as const) : ({ error: result.failure.message } as const);
}

export async function leaveClass(classId: string) {
  await requirePermission({ enrollment: ["delete"] });
  return messageOf(await apiCall((api) => api["enrollment.leave"]({ classId })));
}

export async function getClassroomStatus() {
  await requirePermission({ class: ["create"] });
  return apiValue((api) => api["classroom.status"]());
}

// The teacher's Classroom courses, or a message saying why they can't be listed (not connected, Google refused).
export async function getClassroomCourses(): Promise<{ courses: readonly ClassroomCourse[] } | { error: string }> {
  await requirePermission({ class: ["read"] });
  const result = await apiCall((api) => api["classroom.courses"]());
  return Result.isSuccess(result) ? { courses: result.success } : { error: result.failure.message };
}

// Google's consent URL and Better Auth's OAuth state cookie, or a message.
export async function connectClassroom(): Promise<{ url: string; cookies: readonly ResponseCookie[] } | { error: string }> {
  await requirePermission({ class: ["create"] });
  const result = await apiCall((api) =>
    api["classroom.connect"]({
      callbackURL: "/teacher/classes/import",
      errorCallbackURL: "/teacher/classes?classroom=failed",
    }),
  );
  return Result.isSuccess(result) ? result.success : { error: result.failure.message };
}

export async function importClassroomCourses(courseIds: string[]): Promise<{ classIds: readonly string[] } | { error: string }> {
  await requirePermission({ class: ["create"], roster: ["update"] });
  const result = await apiCall((api) => api["classroom.import"]({ courseIds }));
  return Result.isSuccess(result) ? result.success : { error: result.failure.message };
}

// Adds students who joined the Classroom course since the last sync. A message for people either way.
export async function syncClassroomRoster(classId: string): Promise<{ ok: string } | { error: string }> {
  await requirePermission({ roster: ["update"] });
  const result = await apiCall((api) => api["classroom.sync"]({ classId }));
  if (Result.isFailure(result)) return { error: result.failure.message };
  const { added, total } = result.success;
  return {
    ok: added === 0 ? `Up to date: ${total} students.` : `Added ${added} new ${added === 1 ? "student" : "students"}; ${total} in all.`,
  };
}
