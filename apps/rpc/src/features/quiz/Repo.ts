// The quiz tables: parts and questions of quizzes, read as the contract's quiz detail.
import type { QuizDetail, QuizDraft, QuizPartWithQuestions } from "@examinus/contract/quiz";
import type { Question } from "@examinus/domain/question";
import { and, asc, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { Context, Effect, Layer } from "effect";
import { Database, type Db, type Drizzle } from "../../platform/Database.ts";
import { ownedQuizzes } from "../../platform/organization-scope.ts";
import {
  attempts,
  questions,
  quizParts,
  quizSessions,
  quizzes,
  type NewQuestion,
  type QuizItem,
  type QuizSessionItem,
} from "../../database/schemas/index.ts";
import { groupBy } from "../../platform/group.ts";
import { newId } from "../../platform/ids.ts";
import type { Actor } from "../auth/Session.ts";
import { toPart, toQuestion, toQuiz } from "./mappers.ts";

// Plain functions for code that already holds a `Db` (a transaction, say); `QuizRepo` wraps them as effects.
export async function loadParts(d: Db, quizIds: readonly string[]): Promise<Map<string, QuizPartWithQuestions[]>> {
  const byQuiz = new Map<string, QuizPartWithQuestions[]>();
  if (quizIds.length === 0) return byQuiz;
  const partRows = await d
    .select()
    .from(quizParts)
    .where(inArray(quizParts.quizId, [...quizIds]))
    .orderBy(asc(quizParts.position));
  const questionRows = partRows.length
    ? await d
        .select()
        .from(questions)
        .where(inArray(questions.partId, partRows.map((p) => p.id)))
        .orderBy(asc(questions.position))
    : [];
  const byPart = new Map<string, Question[]>();
  for (const q of questionRows) {
    const list = byPart.get(q.partId) ?? [];
    list.push(toQuestion(q));
    byPart.set(q.partId, list);
  }
  for (const p of partRows) {
    const list = byQuiz.get(p.quizId) ?? [];
    list.push({ ...toPart(p), questions: byPart.get(p.id) ?? [] });
    byQuiz.set(p.quizId, list);
  }
  return byQuiz;
}

// How many questions and points each quiz's paper has (the rules of `quizTotals`), added up by the database so no
// question body is read.
export async function loadTotals(d: Db, quizIds: readonly string[]): Promise<Map<string, { questionCount: number; totalPoints: number }>> {
  const totals = new Map<string, { questionCount: number; totalPoints: number }>();
  if (quizIds.length === 0) return totals;
  const rows = await d
    .select({
      quizId: quizParts.quizId,
      poolSize: quizParts.poolSize,
      count: sql<number>`count(${questions.id})::int`,
      sum: sql<number>`coalesce(sum(${questions.points}), 0)::float8`,
      first: sql<number | null>`(array_agg(${questions.points} order by ${questions.position}))[1]`,
    })
    .from(quizParts)
    .leftJoin(questions, eq(questions.partId, quizParts.id))
    .where(inArray(quizParts.quizId, [...quizIds]))
    .groupBy(quizParts.id);
  for (const r of rows) {
    const drawn = r.poolSize === null ? r.count : Math.min(r.poolSize, r.count);
    const total = totals.get(r.quizId) ?? { questionCount: 0, totalPoints: 0 };
    total.questionCount += drawn;
    // A pool's questions all have the same points; a plain part adds them up.
    total.totalPoints += r.poolSize === null ? r.sum : drawn * (r.first ?? 0);
    totals.set(r.quizId, total);
  }
  return totals;
}

export async function loadQuizDetail(d: Db, quiz: QuizItem): Promise<QuizDetail> {
  const parts = (await loadParts(d, [quiz.id])).get(quiz.id) ?? [];
  return { quiz: toQuiz(quiz), parts };
}

// A question as its row: the base fields have columns, the rest is the body.
const questionRow = (q: Question, id: string, partId: string, position: number): NewQuestion => {
  const { id: _id, prompt, points, topic, gamePoints, partialCredit, ...body } = q;
  return { id, partId, position, type: q.type, prompt, points, gamePoints, partialCredit, topic: topic ?? null, body: body as NewQuestion["body"] };
};

// Rows per insert statement, so one never nears Postgres's limit of 65535 parameters (a question row has 9).
const BATCH = 1000;

// Inserts rows in batches, each statement updating the row that already has the id (`excluded` is the row offered).
async function upsertAll<T extends PgTable & { id: { name: string } }>(d: Db, table: T, rows: readonly T["$inferInsert"][]) {
  if (rows.length === 0) return;
  const set = Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([, column]) => column.name !== "id")
      .map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)]),
  );
  for (let i = 0; i < rows.length; i += BATCH)
    await d.insert(table).values(rows.slice(i, i + BATCH)).onConflictDoUpdate({ target: table.id as never, set: set as never });
}

// Inserts or updates a quiz with its parts and questions in one transaction. Ids the quiz already has
// are kept; anything else gets a fresh id (a client's own ids may collide with other quizzes' rows).
const write = (d: Drizzle, actor: Actor, draft: QuizDraft, existing: string | null) =>
  d.transaction(async (tx) => {
    const fields = {
      title: draft.title,
      description: draft.description,
      subject: draft.subject,
      subjectArea: draft.subjectArea,
      header: draft.header,
      paper: draft.paper,
      settings: draft.settings,
    };
    let quizId: string;
    const oldParts = new Set<string>();
    const oldQuestions = new Set<string>();
    if (existing) {
      quizId = existing;
      await tx.update(quizzes).set(fields).where(eq(quizzes.id, quizId));
      const parts = await tx.select({ id: quizParts.id }).from(quizParts).where(eq(quizParts.quizId, quizId));
      for (const p of parts) oldParts.add(p.id);
      if (parts.length) {
        const qs = await tx
          .select({ id: questions.id })
          .from(questions)
          .where(inArray(questions.partId, [...oldParts]));
        for (const q of qs) oldQuestions.add(q.id);
      }
    } else {
      const [row] = await tx
        .insert(quizzes)
        .values({ ownerId: actor.id, organizationId: actor.organizationId, ...fields })
        .returning({ id: quizzes.id });
      quizId = row!.id;
    }

    const keptParts = new Set<string>();
    const keptQuestions = new Set<string>();
    const partRows: (typeof quizParts.$inferInsert)[] = [];
    const questionRows: NewQuestion[] = [];
    for (const [position, part] of draft.parts.entries()) {
      const partId = oldParts.has(part.id) && !keptParts.has(part.id) ? part.id : newId("part");
      keptParts.add(partId);
      partRows.push({
        id: partId,
        quizId,
        position,
        title: part.title,
        instructions: part.instructions,
        shuffleQuestions: part.shuffleQuestions,
        poolSize: part.poolSize,
      });
      for (const [qPosition, q] of part.questions.entries()) {
        const id = oldQuestions.has(q.id) && !keptQuestions.has(q.id) ? q.id : newId("q");
        keptQuestions.add(id);
        questionRows.push(questionRow(q, id, partId, qPosition));
      }
    }
    // Parts before the questions that point at them; a few statements however big the quiz is.
    await upsertAll(tx, quizParts, partRows);
    await upsertAll(tx, questions, questionRows);
    // Questions first, so one moved into a kept part isn't deleted with its old part.
    const droppedQuestions = [...oldQuestions].filter((id) => !keptQuestions.has(id));
    if (droppedQuestions.length) await tx.delete(questions).where(inArray(questions.id, droppedQuestions));
    const droppedParts = [...oldParts].filter((id) => !keptParts.has(id));
    if (droppedParts.length) await tx.delete(quizParts).where(inArray(quizParts.id, droppedParts));
    return quizId;
  });

export class QuizRepo extends Context.Service<
  QuizRepo,
  {
    // The quiz row, or null.
    readonly find: (quizId: string) => Effect.Effect<QuizItem | null>;
    // The parts (with their questions, in order) of each quiz; quizzes without parts are absent.
    readonly parts: (quizIds: readonly string[]) => Effect.Effect<Map<string, QuizPartWithQuestions[]>>;
    readonly detail: (quiz: QuizItem) => Effect.Effect<QuizDetail>;
    // The quiz, when the actor owns it in their organization.
    readonly findOwned: (quizId: string, actor: Actor) => Effect.Effect<QuizItem | null>;
    // The user's quizzes in the organization, newest edit first, each with its question and point totals and its sessions (newest first).
    readonly listOwned: (
      actor: Actor,
    ) => Effect.Effect<{ quiz: QuizItem; totals: { questionCount: number; totalPoints: number }; sessions: QuizSessionItem[] }[]>;
    // Whether any student has started the quiz, in any of its sessions.
    readonly hasAttempts: (quizId: string) => Effect.Effect<boolean>;
    // Inserts (existing = null) or updates a quiz with its parts and questions in one transaction; the quiz's id.
    readonly save: (actor: Actor, draft: QuizDraft, existing: string | null) => Effect.Effect<string>;
    // Deletes the quiz with its sessions and their attempts and answers.
    readonly remove: (quizId: string) => Effect.Effect<void>;
  }
>()("examinus/api/QuizRepo") {
  static readonly layer = Layer.effect(
    QuizRepo,
    Effect.gen(function* () {
      const db = yield* Database;
      return QuizRepo.of({
        find: Effect.fn("QuizRepo.find")(function* (quizId) {
          const [quiz] = yield* db.query((d) => d.select().from(quizzes).where(eq(quizzes.id, quizId)));
          return quiz ?? null;
        }),
        parts: Effect.fn("QuizRepo.parts")(function* (quizIds) {
          return yield* db.query((d) => loadParts(d, quizIds));
        }),
        detail: Effect.fn("QuizRepo.detail")(function* (quiz) {
          return yield* db.query((d) => loadQuizDetail(d, quiz));
        }),
        findOwned: Effect.fn("QuizRepo.findOwned")(function* (quizId, actor) {
          const [quiz] = yield* db.query((d) =>
            d
              .select()
              .from(quizzes)
              .where(
                and(eq(quizzes.id, quizId), ownedQuizzes(actor)),
              ),
          );
          return quiz ?? null;
        }),
        listOwned: Effect.fn("QuizRepo.listOwned")(function* (actor) {
          return yield* db.query(async (d) => {
            const rows = await d
              .select()
              .from(quizzes)
              .where(ownedQuizzes(actor))
              .orderBy(desc(quizzes.updatedAt));
            const ids = rows.map((q) => q.id);
            const totals = await loadTotals(d, ids);
            const sessions = ids.length
              ? await d.select().from(quizSessions).where(inArray(quizSessions.quizId, ids)).orderBy(desc(quizSessions.createdAt))
              : [];
            const sessionsOf = groupBy(sessions, (s) => s.quizId);
            return rows.map((quiz) => ({
              quiz,
              totals: totals.get(quiz.id) ?? { questionCount: 0, totalPoints: 0 },
              sessions: sessionsOf.get(quiz.id) ?? [],
            }));
          });
        }),
        hasAttempts: Effect.fn("QuizRepo.hasAttempts")(function* (quizId) {
          const rows = yield* db.query((d) =>
            d
              .select({ id: attempts.id })
              .from(attempts)
              .innerJoin(quizSessions, eq(attempts.sessionId, quizSessions.id))
              .where(eq(quizSessions.quizId, quizId))
              .limit(1),
          );
          return rows.length > 0;
        }),
        save: Effect.fn("QuizRepo.save")(function* (actor, draft, existing) {
          return yield* db.query((d) => write(d, actor, draft, existing));
        }),
        remove: Effect.fn("QuizRepo.remove")(function* (quizId) {
          // Sessions first: answers restrict deleting their question, so they go (with the attempts) before the
          // questions do.
          yield* db.query((d) =>
            d.transaction(async (tx) => {
              await tx.delete(quizSessions).where(eq(quizSessions.quizId, quizId));
              await tx.delete(quizzes).where(eq(quizzes.id, quizId));
            }),
          );
        }),
      });
    }),
  );
}
