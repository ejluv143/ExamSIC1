// Paging a session's attempts and a class's sessions against a real Postgres: every row exactly once, in order, whatever
// happens between two page reads, and nothing of another teacher's session through a cursor.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { attempts, classes, questions, quizSessions, quizzes, students } from "../../database/schemas/index.ts";
import { decodeCursor } from "../../platform/cursor.ts";
import { testPostgres } from "../../testing/postgres.ts";
import { attemptRow, questionRow, quizRow, sessionRow } from "../../testing/rows.ts";
import { seedOrganizations, seedPart, seedUsers } from "../../testing/seed.ts";
import { SessionRepo } from "./Repo.ts";

const pg = await testPostgres();
const { db } = pg;
afterAll(() => pg.close());

const run = <A>(use: (repo: SessionRepo["Service"]) => Effect.Effect<A, any>) =>
  Effect.runPromise(SessionRepo.use(use).pipe(Effect.provide(SessionRepo.layer.pipe(Layer.provide(pg.layer)))) as Effect.Effect<A>);

const teacher = { id: "teacher1", organizationId: "org1" };
const t0 = new Date("2026-03-02T09:00:00.000Z").getTime();

beforeEach(async () => {
  await pg.reset();
  await seedOrganizations(db, "org1");
  await seedUsers(db, "teacher1", "teacher2");
  await db.insert(quizzes).values(quizRow({ id: "quiz1", ownerId: "teacher1", organizationId: "org1" }));
  await seedPart(db, "quiz1", "part1");
  await db.insert(questions).values(questionRow({ id: "q1", partId: "part1", position: 0 }));
  await db.insert(quizSessions).values(sessionRow({ id: "sess1", quizId: "quiz1", joinCode: "AAAAAAA" }));
});

// `n` students with an attempt each; `startOf(i)` is when attempt i started.
const seedAttempts = async (n: number, startOf: (i: number) => number = (i) => t0 + i * 1000, status: "graded" | "in_progress" = "graded") => {
  const ids = Array.from({ length: n }, (_, i) => `u${String(i).padStart(2, "0")}`);
  await seedUsers(db, ...ids);
  await db.insert(students).values(ids.map((id) => ({ id: `roster-${id}`, organizationId: "org1", userId: id, firstName: id, lastName: "X", email: `${id}@test.dev` })));
  await db.insert(attempts).values(ids.map((id, i) => attemptRow({ id: `att-${id}`, sessionId: "sess1", studentId: id, status, startedAt: new Date(startOf(i)) })));
  return ids.map((id) => `att-${id}`);
};

const attemptsOf = async (sessionId: string, limit: number, cursor: string | null, status?: "submitted" | "in_progress") => {
  const [quiz] = await db.select().from(quizzes);
  return run((r) => r.attemptsPage(quiz!, sessionId, { limit, after: cursor === null ? null : decodeCursor(cursor), status }));
};
const pageOf = (limit: number, cursor: string | null = null, status?: "submitted" | "in_progress") => attemptsOf("sess1", limit, cursor, status);
const readAll = async (limit: number) => {
  const pages: string[][] = [];
  let cursor: string | null = null;
  do {
    const page = await pageOf(limit, cursor);
    pages.push(page.items.map((d) => d.attempt.id));
    cursor = page.nextCursor;
  } while (cursor !== null);
  return pages;
};

describe("session attempts, a page at a time", () => {
  test("pages hold at most the limit and together give every attempt once, oldest start first", async () => {
    const ids = await seedAttempts(7);
    const pages = await readAll(3);
    expect(pages.map((p) => p.length)).toEqual([3, 3, 1]);
    expect(pages.flat()).toEqual(ids);
  });

  test("exactly one page of rows has no next page; one more has", async () => {
    await seedAttempts(3);
    expect((await pageOf(3)).nextCursor).toBeNull();
    await db.insert(attempts).values(attemptRow({ id: "extra", sessionId: "sess1", studentId: "u00", attemptNumber: 2, startedAt: new Date(t0 + 99_000) }));
    expect((await pageOf(3)).nextCursor).not.toBeNull();
  });

  test("an empty session is one empty page", async () => {
    expect(await pageOf(10)).toEqual({ items: [], nextCursor: null });
  });

  test("attempts that started in the same millisecond are neither skipped nor repeated", async () => {
    const ids = await seedAttempts(5, () => t0);
    const pages = await readAll(2);
    expect(pages.flat().sort()).toEqual([...ids].sort());
    expect(new Set(pages.flat()).size).toBe(5);
  });

  test("a start time with microseconds, which the API shows only to the millisecond, doesn't repeat a row", async () => {
    const ids = await seedAttempts(4, () => t0);
    await db.execute(sql`update attempts set started_at = '2026-03-02 09:00:00.123456+00' where id = ${ids[0]!}`);
    const pages = await readAll(1);
    expect(pages.flat().sort()).toEqual([...ids].sort());
  });

  test("an attempt that starts between two page reads shows up on a later page and nothing repeats", async () => {
    const ids = await seedAttempts(4);
    const first = await pageOf(2);
    await seedUsers(db, "late");
    await db.insert(students).values({ id: "roster-late", organizationId: "org1", userId: "late", firstName: "l", lastName: "X", email: "late@test.dev" });
    await db.insert(attempts).values(attemptRow({ id: "att-late", sessionId: "sess1", studentId: "late", startedAt: new Date(t0 + 60_000) }));
    const rest: string[] = [];
    let cursor = first.nextCursor;
    while (cursor !== null) {
      const page = await pageOf(2, cursor);
      rest.push(...page.items.map((d) => d.attempt.id));
      cursor = page.nextCursor;
    }
    expect([...first.items.map((d) => d.attempt.id), ...rest]).toEqual([...ids, "att-late"]);
  });

  test("status narrows to the submitted or to the attempts still in progress", async () => {
    await seedAttempts(3, undefined, "graded");
    await seedUsers(db, "busy");
    await db.insert(students).values({ id: "roster-busy", organizationId: "org1", userId: "busy", firstName: "b", lastName: "X", email: "busy@test.dev" });
    await db.insert(attempts).values(attemptRow({ id: "att-busy", sessionId: "sess1", studentId: "busy", startedAt: new Date(t0 + 50_000) }));
    expect((await pageOf(10, null, "submitted")).items).toHaveLength(3);
    expect((await pageOf(10, null, "in_progress")).items.map((d) => d.attempt.id)).toEqual(["att-busy"]);
    expect((await pageOf(10)).items).toHaveLength(4);
  });

  test("a cursor can't be used to read another session's attempts", async () => {
    await seedAttempts(4);
    const cursor = (await pageOf(2)).nextCursor!;
    await db.insert(quizSessions).values(sessionRow({ id: "sess2", quizId: "quiz1", joinCode: "BBBBBBB" }));
    const page = await attemptsOf("sess2", 10, cursor);
    expect(page.items).toEqual([]);
  });
});

describe("a class's sessions, a page at a time", () => {
  const seedSessions = async (n: number) => {
    await db.insert(classes).values({ id: "c1", teacherId: "teacher1", organizationId: "org1", courseCode: "c1", title: "c1", joinCode: "c1" });
    const ids = Array.from({ length: n }, (_, i) => `s${i}`);
    await db.insert(quizSessions).values(
      ids.map((id, i) => sessionRow({ id, quizId: "quiz1", classId: "c1", status: "ended", joinCode: `J${String(i).padStart(6, "0")}`, createdAt: new Date(t0 + i * 1000) })),
    );
    return ids;
  };
  const read = (limit: number, cursor: string | null) =>
    run((r) => r.classScoreData(teacher, "c1", { limit, after: cursor === null ? null : decodeCursor(cursor) }));

  test("sessions come in pages of the limit, oldest first, each once, with the last page ending the list", async () => {
    const ids = await seedSessions(5);
    const seen: string[][] = [];
    let cursor: string | null = null;
    do {
      const page = await read(2, cursor);
      seen.push(page.rows.map((r) => r.session.id));
      cursor = page.nextCursor;
    } while (cursor !== null);
    expect(seen.map((p) => p.length)).toEqual([2, 2, 1]);
    expect(seen.flat()).toEqual(ids);
  });

  test("another teacher's class gives nothing", async () => {
    await seedSessions(3);
    const page = await run((r) => r.classScoreData({ id: "teacher2", organizationId: "org1" }, "c1", { limit: 10, after: null }));
    expect(page.rows).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});

describe("cursors", () => {
  test("only what this API made decodes", () => {
    expect(decodeCursor("not a cursor")).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify(["nope", "x"])).toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify([1, 2, 3])).toString("base64url"))).toBeNull();
  });
});
