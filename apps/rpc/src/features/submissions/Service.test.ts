import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { harness, stub } from "../../testing/config.ts";
import { classItem, fakeClassRepo, studentItem, type ClassWorld } from "../classes/fixtures.ts";
import { ClassService } from "../classes/Service.ts";
import type { AnnouncementItem, CommentItem, SubmissionItem } from "../../database/schemas/index.ts";
import type { Actor } from "../auth/Session.ts";
import { SubmissionRepo } from "./Repo.ts";
import { SubmissionService } from "./Service.ts";

const actor = (id: string): Actor => ({ id, organizationId: "org1" });
const epoch = new Date("2026-09-01T00:00:00Z");

const post = (over: Partial<AnnouncementItem> = {}): AnnouncementItem => ({
  id: "p1",
  classId: "c1",
  authorId: "t1",
  kind: "assignment",
  title: "SQL JOIN Activity",
  body: "",
  dueAt: null,
  attachments: [],
  points: 100,
  timeLimitMinutes: null,
  rubric: [],
  acceptingSubmissions: true,
  createdAt: epoch,
  ...over,
});

const world: ClassWorld = {
  classes: [classItem({ id: "c1", teacherId: "t1" }), classItem({ id: "c2", teacherId: "t2", joinCode: "UUUUUUU" })],
  students: [
    studentItem({ id: "s1", userId: "u1", firstName: "Ana", lastName: "Reyes" }),
    studentItem({ id: "s2", userId: "u2", email: "bo@x.ph", firstName: "Bo", lastName: "Cruz" }),
    studentItem({ id: "s9", userId: "u9", email: "out@x.ph" }),
  ],
  members: [
    ["c1", "s1"],
    ["c1", "s2"],
  ],
};

const setup = (posts: AnnouncementItem[] = [post()]) => {
  const subs: SubmissionItem[] = [];
  const comments: CommentItem[] = [];
  const upsert = (announcementId: string, studentId: string, set: Partial<SubmissionItem>) => {
    let row = subs.find((s) => s.announcementId === announcementId && s.studentId === studentId);
    if (!row) subs.push((row = { id: `sub${subs.length}`, announcementId, studentId, attachments: [], turnedInAt: null, score: null, returnedAt: null, createdAt: epoch, updatedAt: epoch }));
    return Object.assign(row, set);
  };
  const repo = Layer.succeed(
    SubmissionRepo,
    stub<SubmissionRepo["Service"]>("SubmissionRepo", {
      work: (classId, id) => Effect.sync(() => posts.find((p) => p.classId === classId && p.id === id && p.kind !== "announcement") ?? null),
      workOf: (classId) => Effect.sync(() => posts.filter((p) => p.classId === classId && p.kind !== "announcement")),
      roster: () => Effect.succeed([{ studentId: "s1", firstName: "Ana", lastName: "Reyes" }, { studentId: "s2", firstName: "Bo", lastName: "Cruz" }]),
      forPost: (id) => Effect.sync(() => subs.filter((s) => s.announcementId === id)),
      forStudent: (ids, studentId) => Effect.sync(() => subs.filter((s) => ids.includes(s.announcementId) && s.studentId === studentId)),
      turnIn: ({ announcementId, studentId, attachments, at }) => Effect.sync(() => upsert(announcementId, studentId, { attachments, turnedInAt: at })),
      unsubmit: (id, studentId) =>
        Effect.sync(() => {
          const row = subs.find((s) => s.announcementId === id && s.studentId === studentId);
          return row && row.turnedInAt && !row.returnedAt ? Object.assign(row, { turnedInAt: null }) : null;
        }),
      setScore: ({ announcementId, studentId, score }) => Effect.sync(() => void upsert(announcementId, studentId, { score })),
      returnWork: (id, studentIds, at) =>
        Effect.sync(() => {
          const rows = subs.filter((s) => s.announcementId === id && s.score !== null && (!studentIds || studentIds.includes(s.studentId)));
          for (const r of rows) r.returnedAt = at;
          return rows.length;
        }),
      comments: (announcementId, studentId) =>
        Effect.sync(() => comments.filter((c) => c.announcementId === announcementId && c.studentId === studentId).map((c) => ({ ...c, authorName: c.fromTeacher ? "Mr. Teacher" : "Ana Reyes" }))),
      insertComment: (row) =>
        Effect.sync(() => {
          const made: CommentItem = { ...row, fromTeacher: row.fromTeacher ?? false, createdAt: epoch };
          comments.push(made);
          return made;
        }),
      setAccepting: (_c, id, accepting) => Effect.sync(() => void Object.assign(posts.find((p) => p.id === id)!, { acceptingSubmissions: accepting })),
    }),
  );
  const fake = fakeClassRepo(world);
  const classes = ClassService.layer.pipe(Layer.provide(fake.layer));
  const layer = SubmissionService.layer.pipe(Layer.provide([repo, fake.layer, classes]));
  return { ...harness(layer), subs };
};
const svc = SubmissionService;

describe("SubmissionService", () => {
  test("a student who isn't in the class can't see or turn in work", async () => {
    const { fail } = setup();
    const err = await fail(Effect.flatMap(svc, (s) => s.turnIn(actor("u9"), "c1", "p1", [])));
    expect(err._tag).toBe("NotFound");
    expect((await fail(Effect.flatMap(svc, (s) => s.mine(actor("u9"), "c1", "p1"))))._tag).toBe("NotFound");
  });

  test("turning in with nothing attached is 'mark as done'; unsubmit takes it back", async () => {
    const { run } = setup();
    const done = await run(Effect.flatMap(svc, (s) => s.turnIn(actor("u1"), "c1", "p1", [])));
    expect(done.status).toBe("turned_in");
    const back = await run(Effect.flatMap(svc, (s) => s.unsubmit(actor("u1"), "c1", "p1")));
    expect(back.status).toBe("assigned");
  });

  test("work turned in after the deadline is marked late; work not turned in past it is missing", async () => {
    const { run } = setup([post({ dueAt: new Date("2020-01-01T00:00:00Z") })]);
    const before = await run(Effect.flatMap(svc, (s) => s.mine(actor("u2"), "c1", "p1")));
    expect(before.status).toBe("missing");
    const late = await run(Effect.flatMap(svc, (s) => s.turnIn(actor("u1"), "c1", "p1", [])));
    expect(late).toMatchObject({ status: "turned_in", late: true });
  });

  test("turning in is refused while the teacher isn't accepting submissions", async () => {
    const { fail } = setup([post({ acceptingSubmissions: false })]);
    expect((await fail(Effect.flatMap(svc, (s) => s.turnIn(actor("u1"), "c1", "p1", []))))._tag).toBe("Conflict");
  });

  test("the score stays hidden from the student until the teacher returns it, and returned work is locked", async () => {
    const { run, fail } = setup();
    await run(Effect.flatMap(svc, (s) => s.turnIn(actor("u1"), "c1", "p1", [])));
    await run(Effect.flatMap(svc, (s) => s.grade(actor("t1"), "c1", "p1", "s1", 88)));
    expect((await run(Effect.flatMap(svc, (s) => s.mine(actor("u1"), "c1", "p1")))).score).toBeNull();
    expect((await run(Effect.flatMap(svc, (s) => s.classMine(actor("u1"), "c1"))))[0]!.score).toBeNull();
    expect(await run(Effect.flatMap(svc, (s) => s.returnWork(actor("t1"), "c1", "p1", null)))).toBe(1);
    const returned = await run(Effect.flatMap(svc, (s) => s.mine(actor("u1"), "c1", "p1")));
    expect(returned).toMatchObject({ status: "returned", score: 88 });
    expect((await fail(Effect.flatMap(svc, (s) => s.unsubmit(actor("u1"), "c1", "p1"))))._tag).toBe("Conflict");
    expect((await fail(Effect.flatMap(svc, (s) => s.turnIn(actor("u1"), "c1", "p1", []))))._tag).toBe("Conflict");
  });

  test("a classmate's work isn't in a student's own view, and only the class's own teacher can list or grade", async () => {
    const { run, fail } = setup();
    await run(Effect.flatMap(svc, (s) => s.turnIn(actor("u1"), "c1", "p1", [])));
    expect((await run(Effect.flatMap(svc, (s) => s.mine(actor("u2"), "c1", "p1")))).status).toBe("assigned");
    const list = await run(Effect.flatMap(svc, (s) => s.list(actor("t1"), "c1", "p1")));
    expect(list).toMatchObject({ turnedIn: 1, assigned: 1 });
    expect((await fail(Effect.flatMap(svc, (s) => s.list(actor("t2"), "c1", "p1"))))._tag).toBe("NotFound");
    expect((await fail(Effect.flatMap(svc, (s) => s.grade(actor("t2"), "c1", "p1", "s1", 5))))._tag).toBe("NotFound");
  });

  test("a score must be within the post's points, and a post without points isn't graded", async () => {
    const { fail } = setup([post({ points: 20 }), post({ id: "p2", points: null })]);
    expect((await fail(Effect.flatMap(svc, (s) => s.grade(actor("t1"), "c1", "p1", "s1", 21))))._tag).toBe("Conflict");
    expect((await fail(Effect.flatMap(svc, (s) => s.grade(actor("t1"), "c1", "p2", "s1", 1))))._tag).toBe("Conflict");
  });

  test("a private thread is between one student and the teacher: classmates and other teachers can't read it", async () => {
    const { run, fail } = setup();
    await run(Effect.flatMap(svc, (s) => s.addMyComment(actor("u1"), "c1", "p1", "  Is a Word file okay?  ")));
    await run(Effect.flatMap(svc, (s) => s.addStudentComment(actor("t1"), "c1", "p1", "s1", "Yes.")));
    const mine = await run(Effect.flatMap(svc, (s) => s.myComments(actor("u1"), "c1", "p1")));
    expect(mine.map((c) => [c.fromTeacher, c.body])).toEqual([
      [false, "Is a Word file okay?"],
      [true, "Yes."],
    ]);
    // A classmate has their own, empty thread; the teacher sees each student's thread apart.
    expect(await run(Effect.flatMap(svc, (s) => s.myComments(actor("u2"), "c1", "p1")))).toEqual([]);
    expect(await run(Effect.flatMap(svc, (s) => s.studentComments(actor("t1"), "c1", "p1", "s2")))).toEqual([]);
    expect(await run(Effect.flatMap(svc, (s) => s.studentComments(actor("t1"), "c1", "p1", "s1")))).toHaveLength(2);
    // Another teacher, a student outside the class and a student who isn't on the roster are all refused.
    expect((await fail(Effect.flatMap(svc, (s) => s.studentComments(actor("t2"), "c1", "p1", "s1"))))._tag).toBe("NotFound");
    expect((await fail(Effect.flatMap(svc, (s) => s.myComments(actor("u9"), "c1", "p1"))))._tag).toBe("NotFound");
    expect((await fail(Effect.flatMap(svc, (s) => s.studentComments(actor("t1"), "c1", "p1", "s9"))))._tag).toBe("NotFound");
  });

  test("a blank comment isn't sent", async () => {
    const { fail } = setup();
    expect((await fail(Effect.flatMap(svc, (s) => s.addMyComment(actor("u1"), "c1", "p1", "   "))))._tag).toBe("NotFound");
    expect((await fail(Effect.flatMap(svc, (s) => s.addStudentComment(actor("t1"), "c1", "p1", "s1", ""))))._tag).toBe("NotFound");
  });
});
