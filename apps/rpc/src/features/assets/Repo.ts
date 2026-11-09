// Assets, and the reads of other features' content (quizzes, sessions, answers, question bank) that decide who may
// see an image and which images are still in use. Questions, choices and drawing answers refer to an asset by id
// inside markdown or jsonb, so "refers to" means the id appears in that text.
import { assetIdsIn } from "@examinus/domain/asset";
import { and, eq, inArray, isNotNull, isNull, like, lt, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import type { Actor } from "../auth/Session.ts";
import { Database, type Drizzle } from "../../platform/Database.ts";
import { assetsIn, bankReach, ownedAssets, ownedQuizzes } from "../../platform/organization-scope.ts";
import {
  answers,
  assets,
  attempts,
  bankQuestions,
  classAnnouncements,
  classResources,
  classMembers,
  classes,
  postSubmissions,
  questions,
  quizParts,
  quizSessions,
  quizzes,
  sessionStudents,
  studentProfiles,
  students,
  type AssetItem,
  type QuizSessionItem,
} from "../../database/schemas/index.ts";

export type NewAssetRow = {
  id: string;
  ownerId: string;
  organizationId: string | null;
  purpose: AssetItem["purpose"];
  s3Key: string;
  mime: AssetItem["mime"];
  fileName?: string | null;
};

const mentionsAsset = (column: SQLWrapper) => sql`${column}::text like '%asset-%'`;

// All the text of some quizzes' content (prompts, question bodies, part instructions, descriptions, paper header
// logos).
async function quizText(d: Drizzle, quizFilter: SQL | undefined): Promise<string> {
  const question = await d
    .select({ text: sql<string>`${questions.prompt} || ' ' || ${questions.body}::text` })
    .from(questions)
    .innerJoin(quizParts, eq(questions.partId, quizParts.id))
    .innerJoin(quizzes, eq(quizParts.quizId, quizzes.id))
    .where(quizFilter);
  const parts = await d
    .select({ text: quizParts.instructions })
    .from(quizParts)
    .innerJoin(quizzes, eq(quizParts.quizId, quizzes.id))
    .where(quizFilter);
  const described = await d
    .select({ text: sql<string>`${quizzes.description} || ' ' || ${quizzes.header}::text` })
    .from(quizzes)
    .where(quizFilter);
  return [...question, ...parts, ...described].map((r) => r.text).join("\n");
}

export class AssetRepo extends Context.Service<
  AssetRepo,
  {
    readonly insert: (row: NewAssetRow) => Effect.Effect<void>;
    // The user's own upload, or null. A user with an organization finds only uploads made in it; a guest (none) any.
    readonly findOwned: (assetId: string, owner: { id: string; organizationId: string | null }) => Effect.Effect<AssetItem | null>;
    // The organization of the guest's roster entry, or null.
    readonly guestOrganization: (userId: string) => Effect.Effect<string | null>;
    readonly markReady: (
      assetId: string,
      file: { sizeBytes: number; width: number | null; height: number | null; sha256: string },
    ) => Effect.Effect<void>;
    readonly remove: (assetIds: readonly string[]) => Effect.Effect<void>;
    // The confirmed assets among `ids`, of that organization; `null` (guests and platform admins, who have none) filters nothing.
    readonly ready: (ids: readonly string[], organizationId: string | null) => Effect.Effect<AssetItem[]>;
    // The confirmed assets among `ids` that are question images or the student's own answer images.
    readonly paperAssets: (studentId: string, ids: readonly string[]) => Effect.Effect<AssetItem[]>;
    // The text a teacher's images can appear in: their quizzes in the organization and the question bank they may see
    // (`question`: library, own and shared with them), and their students' answers in their sessions (`answer`).
    readonly teacherText: (actor: Actor) => Effect.Effect<{ question: string; answer: string }>;
    // The sessions on the student's own roster.
    readonly rosterSessions: (studentId: string) => Effect.Effect<QuizSessionItem[]>;
    // The text of the quizzes' content.
    readonly quizText: (quizIds: readonly string[]) => Effect.Effect<string>;
    // The attachments of work students turned in to the teacher's classes: only that teacher may see those files.
    readonly submissionText: (teacherId: string) => Effect.Effect<string>;
    // The attachments of the posts in the classes a student belongs to.
    readonly memberPostText: (userId: string) => Effect.Effect<string>;
    // Every asset created before the cutoff.
    readonly createdBefore: (cutoff: Date) => Effect.Effect<AssetItem[]>;
    // The ids of the assets that any question, bank entry or answer refers to.
    readonly usedIds: Effect.Effect<Set<string>>;
  }
>()("examinus/api/AssetRepo") {
  static readonly layer = Layer.effect(
    AssetRepo,
    Effect.gen(function* () {
      const db = yield* Database;
      return AssetRepo.of({
        insert: Effect.fn("AssetRepo.insert")(function* (row) {
          yield* db.query((d) => d.insert(assets).values(row));
        }),

        findOwned: Effect.fn("AssetRepo.findOwned")(function* (assetId, owner) {
          const [row] = yield* db.query((d) =>
            d
              .select()
              .from(assets)
              .where(
                and(eq(assets.id, assetId), ownedAssets(owner)),
              ),
          );
          return row ?? null;
        }),

        guestOrganization: Effect.fn("AssetRepo.guestOrganization")(function* (userId) {
          const [row] = yield* db.query((d) =>
            d.select({ organizationId: students.organizationId }).from(students).where(eq(students.userId, userId)).limit(1),
          );
          return row?.organizationId ?? null;
        }),

        markReady: Effect.fn("AssetRepo.markReady")(function* (assetId, file) {
          yield* db.query((d) => d.update(assets).set({ status: "ready", ...file }).where(eq(assets.id, assetId)));
        }),

        remove: Effect.fn("AssetRepo.remove")(function* (assetIds) {
          yield* db.query((d) => d.delete(assets).where(inArray(assets.id, [...assetIds])));
        }),

        ready: Effect.fn("AssetRepo.ready")(function* (ids, organizationId) {
          return yield* db.query((d) =>
            d
              .select()
              .from(assets)
              .where(
                and(inArray(assets.id, [...ids]), eq(assets.status, "ready"), assetsIn(organizationId)),
              ),
          );
        }),

        paperAssets: Effect.fn("AssetRepo.paperAssets")(function* (studentId, ids) {
          return yield* db.query((d) =>
            d
              .select()
              .from(assets)
              .where(
                and(
                  inArray(assets.id, [...ids]),
                  eq(assets.status, "ready"),
                  or(eq(assets.purpose, "question"), eq(assets.ownerId, studentId)),
                ),
              ),
          );
        }),

        teacherText: Effect.fn("AssetRepo.teacherText")(function* (actor) {
          const mine = ownedQuizzes(actor);
          return yield* db.query(async (d) => {
            const blobs = [
              await quizText(d, mine),
              ...(
                await d
                  .select({ text: sql<string>`${bankQuestions.question}::text` })
                  .from(bankQuestions)
                  .where(bankReach(actor))
              ).map((r) => r.text),
            ];
            const answered = await d
              .select({ text: sql<string>`${answers.value}::text` })
              .from(answers)
              .innerJoin(attempts, eq(answers.attemptId, attempts.id))
              .innerJoin(quizSessions, eq(attempts.sessionId, quizSessions.id))
              .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
              .where(and(mine, mentionsAsset(answers.value)));
            return { question: blobs.join("\n"), answer: answered.map((r) => r.text).join("\n") };
          });
        }),

        rosterSessions: Effect.fn("AssetRepo.rosterSessions")(function* (studentId) {
          const rows = yield* db.query((d) =>
            d
              .select({ session: quizSessions })
              .from(sessionStudents)
              .innerJoin(quizSessions, eq(sessionStudents.sessionId, quizSessions.id))
              .where(and(eq(sessionStudents.studentId, studentId), isNull(sessionStudents.removedAt))),
          );
          return rows.map((r) => r.session);
        }),

        quizText: Effect.fn("AssetRepo.quizText")(function* (quizIds) {
          return yield* db.query((d) => quizText(d, inArray(quizzes.id, [...quizIds])));
        }),

        submissionText: Effect.fn("AssetRepo.submissionText")(function* (teacherId) {
          const rows = yield* db.query((d) =>
            d
              .select({ text: sql<string>`${postSubmissions.attachments}::text` })
              .from(postSubmissions)
              .innerJoin(classAnnouncements, eq(classAnnouncements.id, postSubmissions.announcementId))
              .innerJoin(classes, eq(classes.id, classAnnouncements.classId))
              .where(eq(classes.teacherId, teacherId)),
          );
          return rows.map((r) => r.text).join("\n");
        }),

        memberPostText: Effect.fn("AssetRepo.memberPostText")(function* (userId) {
          const rows = yield* db.query((d) =>
            d
              .select({ text: sql<string>`${classAnnouncements.attachments}::text` })
              .from(classAnnouncements)
              .innerJoin(classMembers, eq(classMembers.classId, classAnnouncements.classId))
              .innerJoin(students, eq(students.id, classMembers.studentId))
              .where(eq(students.userId, userId)),
          );
          // The files on those classes' Resources shelves.
          const shelf = yield* db.query((d) =>
            d
              .select({ text: classResources.url })
              .from(classResources)
              .innerJoin(classMembers, eq(classMembers.classId, classResources.classId))
              .innerJoin(students, eq(students.id, classMembers.studentId))
              .where(eq(students.userId, userId)),
          );
          return [...rows, ...shelf].map((r) => r.text).join("\n");
        }),

        createdBefore: Effect.fn("AssetRepo.createdBefore")(function* (cutoff) {
          return yield* db.query((d) => d.select().from(assets).where(lt(assets.createdAt, cutoff)));
        }),

        usedIds: db
          .query(async (d) => {
            const text = [
              await quizText(d, undefined),
              ...(await d.select({ text: classes.headerImage }).from(classes).where(isNotNull(classes.headerImage))).map((r) => r.text ?? ""),
              ...(await d.select({ text: sql<string>`${bankQuestions.question}::text` }).from(bankQuestions)).map((r) => r.text),
              // A student's picture and signature.
              ...(await d.select({ text: studentProfiles.picture }).from(studentProfiles).where(isNotNull(studentProfiles.picture))).map((r) => r.text ?? ""),
              ...(await d.select({ text: studentProfiles.signature }).from(studentProfiles).where(isNotNull(studentProfiles.signature))).map((r) => r.text ?? ""),
              // Files students turned in.
              ...(
                await d.select({ text: sql<string>`${postSubmissions.attachments}::text` }).from(postSubmissions).where(mentionsAsset(postSubmissions.attachments))
              ).map((r) => r.text),
              // Files attached to class posts.
              ...(
                await d.select({ text: sql<string>`${classAnnouncements.attachments}::text` }).from(classAnnouncements).where(mentionsAsset(classAnnouncements.attachments))
              ).map((r) => r.text),
              // Files on a class's Resources shelf.
              ...(await d.select({ text: classResources.url }).from(classResources).where(like(classResources.url, "asset:%"))).map((r) => r.text),
              ...(
                await d.select({ text: sql<string>`${answers.value}::text` }).from(answers).where(mentionsAsset(answers.value))
              ).map((r) => r.text),
            ];
            return new Set(text.flatMap(assetIdsIn));
          })
          .pipe(Effect.withSpan("AssetRepo.usedIds")),
      });
    }),
  );
}
