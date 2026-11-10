// The quiz Repo against a real Postgres: the list's totals are added up in SQL and must equal the domain's rules, and a
// save of a big quiz goes in batches yet keeps, moves and drops rows exactly as before.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { QuizDraft } from "@examinus/contract/quiz";
import type { Question } from "@examinus/domain/question";
import { quizTotals } from "@examinus/domain/shuffle";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { questions, quizParts } from "../../database/schemas/index.ts";
import { testPostgres } from "../../testing/postgres.ts";
import { seedOrganizations, seedUsers } from "../../testing/seed.ts";
import type { Actor } from "../auth/Session.ts";
import { toQuiz } from "./mappers.ts";
import { QuizRepo } from "./Repo.ts";
import { quizRow } from "../../testing/rows.ts";

const pg = await testPostgres();
afterAll(() => pg.close());
beforeEach(async () => {
  await pg.reset();
  await seedOrganizations(pg.db, "org1");
  await seedUsers(pg.db, "teacher1");
});

const actor: Actor = { id: "teacher1", organizationId: "org1" };
const run = <A>(use: (repo: QuizRepo["Service"]) => Effect.Effect<A>) =>
  Effect.runPromise(QuizRepo.use(use).pipe(Effect.provide(QuizRepo.layer.pipe(Layer.provide(pg.layer)))));

const tf = (id: string, points: number): Question => ({
  id,
  prompt: `Question ${id}`,
  points,
  gamePoints: "standard",
  partialCredit: true,
  type: "true_false",
  answer: true,
});

const part = (id: string, qs: Question[], poolSize: number | null = null) => ({
  id,
  quizId: "x",
  position: 0,
  title: `Part ${id}`,
  instructions: "",
  shuffleQuestions: false,
  poolSize,
  questions: qs,
});

const draft = (parts: QuizDraft["parts"]): QuizDraft => {
  const base = toQuiz(quizRow());
  return { title: "Quiz", description: "", subject: null, subjectArea: null, header: base.header, paper: base.paper, settings: base.settings, parts };
};

describe("QuizRepo.listOwned totals", () => {
  test("equal the domain's totals for plain parts, pools, a pool larger than its part and an empty part", async () => {
    const parts = [
      part("plain", [tf("a", 2), tf("b", 1.5)]),
      part("pool", [tf("c", 3), tf("d", 3), tf("e", 3)], 2),
      part("big-pool", [tf("f", 4)], 9),
      part("empty", []),
    ];
    const id = await run((r) => r.save(actor, draft(parts), null));
    const [row] = await run((r) => r.listOwned(actor));
    expect(row!.quiz.id).toBe(id);
    const detail = await run((r) => r.detail(row!.quiz));
    expect(row!.totals).toEqual(quizTotals(detail.parts));
    expect(row!.totals).toEqual({ questionCount: 2 + 2 + 1, totalPoints: 3.5 + 6 + 4 });
  });

  test("a quiz with no parts is zero, and sessions are not mixed between quizzes", async () => {
    await run((r) => r.save(actor, draft([]), null));
    const [row] = await run((r) => r.listOwned(actor));
    expect(row!.totals).toEqual({ questionCount: 0, totalPoints: 0 });
    expect(row!.sessions).toEqual([]);
  });
});

describe("QuizRepo.save in batches", () => {
  test("a quiz bigger than one batch is stored whole and in order", async () => {
    const many = Array.from({ length: 2300 }, (_, i) => tf(`q${i}`, 1));
    const id = await run((r) => r.save(actor, draft([part("p", many)]), null));
    const quiz = await run((r) => r.find(id));
    const detail = await run((r) => r.detail(quiz!));
    expect(detail.parts[0]!.questions).toHaveLength(2300);
    expect(detail.parts[0]!.questions.map((q) => q.prompt)).toEqual(many.map((q) => q.prompt));
  });

  test("saving again keeps ids, moves a question to another part and drops the ones left out", async () => {
    const id = await run((r) => r.save(actor, draft([part("p1", [tf("a", 1), tf("b", 1), tf("c", 1)]), part("p2", [tf("d", 1)])]), null));
    const first = await run((r) => r.detail({ ...quizRow(), id } as never));
    const [p1, p2] = first.parts;
    const [a, b] = p1!.questions;
    const again = draft([
      { ...p1!, title: "Renamed", questions: [{ ...a!, points: 5 }] },
      { ...p2!, questions: [b!, ...p2!.questions] },
    ]);
    await run((r) => r.save(actor, again, id));
    const rows = await pg.db.select().from(questions);
    expect(rows).toHaveLength(3);
    expect(rows.find((q) => q.id === a!.id)?.points).toBe(5);
    expect(rows.find((q) => q.id === b!.id)?.partId).toBe(p2!.id);
    expect(rows.find((q) => q.id === p1!.questions[2]!.id)).toBeUndefined();
    expect((await pg.db.select().from(quizParts).where(eq(quizParts.id, p1!.id)))[0]!.title).toBe("Renamed");
  });
});
