import type { Attachment } from "@examinus/domain/classes";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database } from "../../platform/Database.ts";
import {
  classAnnouncements,
  classMembers,
  postComments,
  postSubmissions,
  students,
  users,
  type AnnouncementItem,
  type CommentItem,
  type SubmissionItem,
} from "../../database/schemas/index.ts";

export type RosterName = { studentId: string; firstName: string; lastName: string };

export class SubmissionRepo extends Context.Service<
  SubmissionRepo,
  {
    // An assignment or activity of the class (null for anything else, or another class's post).
    readonly work: (classId: string, announcementId: string) => Effect.Effect<AnnouncementItem | null>;
    // Every assignment and activity of the class.
    readonly workOf: (classId: string) => Effect.Effect<AnnouncementItem[]>;
    readonly roster: (classId: string) => Effect.Effect<RosterName[]>;
    readonly forPost: (announcementId: string) => Effect.Effect<SubmissionItem[]>;
    readonly forPosts: (announcementIds: readonly string[]) => Effect.Effect<SubmissionItem[]>;
    // One student's private thread on a post, oldest first, with the author's name.
    readonly comments: (announcementId: string, studentId: string) => Effect.Effect<(CommentItem & { authorName: string })[]>;
    readonly insertComment: (row: typeof postComments.$inferInsert) => Effect.Effect<CommentItem>;
    readonly forStudent: (announcementIds: readonly string[], studentId: string) => Effect.Effect<SubmissionItem[]>;
    readonly turnIn: (row: { id: string; announcementId: string; studentId: string; attachments: Attachment[]; at: Date }) => Effect.Effect<SubmissionItem>;
    // Back to unsubmitted; null when there is nothing turned in to take back (or it was returned).
    readonly unsubmit: (announcementId: string, studentId: string) => Effect.Effect<SubmissionItem | null>;
    readonly setScore: (row: { id: string; announcementId: string; studentId: string; score: number | null }) => Effect.Effect<void>;
    // Marks work returned: the listed students, or every graded one when `studentIds` is null. Answers with the count.
    readonly returnWork: (announcementId: string, studentIds: readonly string[] | null, at: Date) => Effect.Effect<number>;
    readonly setAccepting: (classId: string, announcementId: string, accepting: boolean) => Effect.Effect<void>;
  }
>()("examinus/api/SubmissionRepo") {
  static readonly layer = Layer.effect(
    SubmissionRepo,
    Effect.gen(function* () {
      const db = yield* Database;
      const isWork = inArray(classAnnouncements.kind, ["assignment", "activity"]);
      return SubmissionRepo.of({
        work: Effect.fn("SubmissionRepo.work")(function* (classId, announcementId) {
          const [row] = yield* db.query((d) =>
            d.select().from(classAnnouncements).where(and(eq(classAnnouncements.classId, classId), eq(classAnnouncements.id, announcementId), isWork)),
          );
          return row ?? null;
        }),
        workOf: Effect.fn("SubmissionRepo.workOf")(function* (classId) {
          return yield* db.query((d) => d.select().from(classAnnouncements).where(and(eq(classAnnouncements.classId, classId), isWork)));
        }),
        roster: Effect.fn("SubmissionRepo.roster")(function* (classId) {
          return yield* db.query((d) =>
            d
              .select({ studentId: students.id, firstName: students.firstName, lastName: students.lastName })
              .from(classMembers)
              .innerJoin(students, eq(students.id, classMembers.studentId))
              .where(eq(classMembers.classId, classId))
              .orderBy(asc(students.lastName), asc(students.firstName)),
          );
        }),
        forPost: Effect.fn("SubmissionRepo.forPost")(function* (announcementId) {
          return yield* db.query((d) => d.select().from(postSubmissions).where(eq(postSubmissions.announcementId, announcementId)));
        }),
        comments: Effect.fn("SubmissionRepo.comments")(function* (announcementId, studentId) {
          const rows = yield* db.query((d) =>
            d
              .select({ comment: postComments, authorName: users.name })
              .from(postComments)
              .leftJoin(users, eq(users.id, postComments.authorId))
              .where(and(eq(postComments.announcementId, announcementId), eq(postComments.studentId, studentId)))
              .orderBy(asc(postComments.createdAt)),
          );
          return rows.map((r) => ({ ...r.comment, authorName: r.authorName ?? "" }));
        }),
        insertComment: Effect.fn("SubmissionRepo.insertComment")(function* (row) {
          const [created] = yield* db.query((d) => d.insert(postComments).values(row).returning());
          return created!;
        }),
        forPosts: Effect.fn("SubmissionRepo.forPosts")(function* (announcementIds) {
          if (announcementIds.length === 0) return [];
          return yield* db.query((d) => d.select().from(postSubmissions).where(inArray(postSubmissions.announcementId, [...announcementIds])));
        }),
        forStudent: Effect.fn("SubmissionRepo.forStudent")(function* (announcementIds, studentId) {
          if (announcementIds.length === 0) return [];
          return yield* db.query((d) =>
            d
              .select()
              .from(postSubmissions)
              .where(and(inArray(postSubmissions.announcementId, [...announcementIds]), eq(postSubmissions.studentId, studentId))),
          );
        }),
        turnIn: Effect.fn("SubmissionRepo.turnIn")(function* ({ id, announcementId, studentId, attachments, at }) {
          const [row] = yield* db.query((d) =>
            d
              .insert(postSubmissions)
              .values({ id, announcementId, studentId, attachments, turnedInAt: at })
              .onConflictDoUpdate({
                target: [postSubmissions.announcementId, postSubmissions.studentId],
                set: { attachments, turnedInAt: at },
              })
              .returning(),
          );
          return row!;
        }),
        unsubmit: Effect.fn("SubmissionRepo.unsubmit")(function* (announcementId, studentId) {
          const [row] = yield* db.query((d) =>
            d
              .update(postSubmissions)
              .set({ turnedInAt: null })
              .where(
                and(
                  eq(postSubmissions.announcementId, announcementId),
                  eq(postSubmissions.studentId, studentId),
                  isNotNull(postSubmissions.turnedInAt),
                  sql`${postSubmissions.returnedAt} is null`,
                ),
              )
              .returning(),
          );
          return row ?? null;
        }),
        setScore: Effect.fn("SubmissionRepo.setScore")(function* ({ id, announcementId, studentId, score }) {
          yield* db.query((d) =>
            d
              .insert(postSubmissions)
              .values({ id, announcementId, studentId, score })
              .onConflictDoUpdate({ target: [postSubmissions.announcementId, postSubmissions.studentId], set: { score } }),
          );
        }),
        returnWork: Effect.fn("SubmissionRepo.returnWork")(function* (announcementId, studentIds, at) {
          const rows = yield* db.query((d) =>
            d
              .update(postSubmissions)
              .set({ returnedAt: at })
              .where(
                and(
                  eq(postSubmissions.announcementId, announcementId),
                  isNotNull(postSubmissions.score),
                  ...(studentIds ? [inArray(postSubmissions.studentId, [...studentIds])] : []),
                ),
              )
              .returning({ id: postSubmissions.id }),
          );
          return rows.length;
        }),
        setAccepting: Effect.fn("SubmissionRepo.setAccepting")(function* (classId, announcementId, accepting) {
          yield* db.query((d) =>
            d
              .update(classAnnouncements)
              .set({ acceptingSubmissions: accepting })
              .where(and(eq(classAnnouncements.classId, classId), eq(classAnnouncements.id, announcementId))),
          );
        }),
      });
    }),
  );
}
