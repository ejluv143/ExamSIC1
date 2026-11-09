// An organization's classes, and the students on their rosters. Students join a class with its code; a roster entry
// can also come from Google Classroom or the demo data without an account behind it.
import type { Attachment, RubricRow } from "@examinus/domain/classes";
import type { AttendanceStatus } from "@examinus/domain/attendance";
import type { ClassRecord } from "@examinus/contract/class-record";
import { sexNames, subjectAreaNames } from "@examinus/domain/roles";
import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, timestamps, timestamptz } from "./_helpers.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";

export const sex = pgEnum("sex", sexNames);
export const subjectArea = pgEnum("subject_area", subjectAreaNames);

export const classes = pgTable(
  "classes",
  {
    id: text("id").primaryKey(),
    // Null: a class in its teacher's personal space.
    organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseCode: text("course_code").notNull(),
    title: text("title").notNull(),
    // No subject: guessed from the course code and title.
    subjectArea: subjectArea("subject_area"),
    section: text("section").notNull().default(""),
    term: text("term").notNull().default(""),
    schedule: text("schedule").notNull().default(""),
    room: text("room").notNull().default(""),
    // The class's online room link (Meet, Zoom, Teams); "" when it has none.
    eroomUrl: text("eroom_url").notNull().default(""),
    units: integer("units").notNull().default(3),
    // One of the names in `classColors` (packages/domain); null: the theme's colour.
    color: text("color"),
    // The asset id of the picture behind the class banner (an uploaded image); null: just the colour.
    headerImage: text("header_image"),
    // What students enter to join. Unique across organizations: the code says which one the class is in.
    joinCode: text("join_code").notNull().unique(),
    // The Google Classroom course this class mirrors, if it was imported.
    classroom: jsonb("classroom").$type<{ courseId: string; link: string; lastSyncedAt: string }>(),
    // Archived classes are hidden from the teacher and their students; nothing is deleted.
    archivedAt: timestamptz("archived_at"),
    ...timestamps,
  },
  (t) => [index("classes_teacher_id_idx").on(t.teacherId), index("classes_organization_id_idx").on(t.organizationId)],
);

// A person on an organization's class rosters, or (organization null) on those of personal-space classes. A student
// account has at most one per organization and one personal one, made the first time it joins a class there.
// Student numbers are the organization's, so they're unique within it; personal-space ones aren't checked, as they
// come from any number of schools.
export const students = pgTable(
  "students",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    // Null for a roster entry imported from Google Classroom, until the student signs in and fills it in.
    studentNumber: text("student_number"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    // The grade sheet lists male and female students separately. Null until known (see studentNumber).
    sex: sex("sex"),
    ...timestamps,
  },
  (t) => [
    // NULLS NOT DISTINCT: one personal-space entry per user too.
    unique("students_organization_user_unique").on(t.organizationId, t.userId).nullsNotDistinct(),
    uniqueIndex("students_organization_number_unique")
      .on(t.organizationId, t.studentNumber)
      .where(sql`${t.organizationId} is not null and ${t.studentNumber} is not null`),
    index("students_organization_id_idx").on(t.organizationId),
  ],
);

export const classMembers = pgTable(
  "class_members",
  {
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.classId, t.studentId] }), index("class_members_student_id_idx").on(t.studentId)],
);

// A class meeting whose attendance was taken. Meetings themselves come from the class's schedule
// (meetingDates in @examinus/domain/attendance), so only roll calls are stored.
export const classMeetings = pgTable(
  "class_meetings",
  {
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    // Manila date, YYYY-MM-DD.
    date: date("date", { mode: "string" }).notNull(),
    // Students who weren't present, by roster id; everyone else on the roster was.
    records: jsonb("records").$type<Record<string, AttendanceStatus>>().notNull().default({}),
    takenAt: timestamptz("taken_at").notNull(),
    takenBy: text("taken_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.classId, t.date] })],
);

// A class's grade book, saved whole by the teacher. Categories and items are kept per term; scores and absences are
// by roster id. Scores linked to quiz sessions and attendance aren't stored: they're worked out when it's shown.
export const classRecords = pgTable("class_records", {
  classId: text("class_id")
    .primaryKey()
    .references(() => classes.id, { onDelete: "cascade" }),
  terms: jsonb("terms").$type<ClassRecord["terms"]>().notNull(),
  scores: jsonb("scores").$type<ClassRecord["scores"]>().notNull().default({}),
  absences: jsonb("absences").$type<ClassRecord["absences"]>().notNull(),
  dropped: jsonb("dropped").$type<readonly string[]>().notNull().default([]),
  unlinked: jsonb("unlinked").$type<readonly string[]>().notNull().default([]),
  signatories: jsonb("signatories").$type<ClassRecord["signatories"]>().notNull(),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export type ClassItem = typeof classes.$inferSelect;
export type StudentItem = typeof students.$inferSelect;

// What a teacher posts to a class's stream. Deleted with the class.
export const classAnnouncements = pgTable(
  "class_announcements",
  {
    id: text("id").primaryKey(),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // "announcement", "assignment" or "activity".
    kind: text("kind").notNull().default("announcement"),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    dueAt: timestamptz("due_at"),
    // Links, YouTube videos and Drive files the post points to (see `Attachment` in the domain package).
    attachments: jsonb("attachments").$type<Attachment[]>().notNull().default(sql`'[]'::jsonb`),
    // Assignments: points, a time limit in minutes and a rubric (rows of criterion and points).
    points: integer("points"),
    timeLimitMinutes: integer("time_limit_minutes"),
    rubric: jsonb("rubric").$type<RubricRow[]>().notNull().default(sql`'[]'::jsonb`),
    // Assignments and activities: whether students can still turn work in.
    acceptingSubmissions: boolean("accepting_submissions").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("class_announcements_class_id_idx").on(t.classId, t.createdAt)],
);
export type AnnouncementItem = typeof classAnnouncements.$inferSelect;

// The links on a class's Resources shelf, oldest first. Deleted with the class.
export const classResources = pgTable(
  "class_resources",
  {
    id: text("id").primaryKey(),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    // "link", "youtube" or "drive": picks the icon.
    kind: text("kind").notNull().default("link"),
    url: text("url").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("class_resources_class_id_idx").on(t.classId, t.createdAt)],
);
export type ResourceItem = typeof classResources.$inferSelect;

// A student's work on an assignment or activity. One row per post and student, made the first time they turn in.
export const postSubmissions = pgTable(
  "post_submissions",
  {
    id: text("id").primaryKey(),
    announcementId: text("announcement_id")
      .notNull()
      .references(() => classAnnouncements.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    // Files (`asset:<id>`), links, videos and Drive files, like a post's.
    attachments: jsonb("attachments").$type<Attachment[]>().notNull().default(sql`'[]'::jsonb`),
    // Null: not turned in (or taken back).
    turnedInAt: timestamptz("turned_in_at"),
    score: integer("score"),
    // Null: the student doesn't see the score yet.
    returnedAt: timestamptz("returned_at"),
    ...timestamps,
  },
  (t) => [unique("post_submissions_post_student_unique").on(t.announcementId, t.studentId)],
);
export type SubmissionItem = typeof postSubmissions.$inferSelect;

// The private conversation between one student and the teacher about an assignment or activity. Deleted with the post
// or the student.
export const postComments = pgTable(
  "post_comments",
  {
    id: text("id").primaryKey(),
    announcementId: text("announcement_id")
      .notNull()
      .references(() => classAnnouncements.id, { onDelete: "cascade" }),
    // Whose thread it is: the student on the roster.
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Written by the teacher rather than the student.
    fromTeacher: boolean("from_teacher").notNull().default(false),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("post_comments_thread_idx").on(t.announcementId, t.studentId, t.createdAt)],
);
export type CommentItem = typeof postComments.$inferSelect;
