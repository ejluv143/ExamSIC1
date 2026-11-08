import { Conflict, Forbidden, NotFound } from "@examinus/contract/errors";
import { cleanAttachment, maxAttachments, type Attachment } from "@examinus/domain/classes";
import { submissionStatus, type MyWork, type MyWorkStatus, type PostWork } from "@examinus/domain/submissions";
import { Context, Effect, Layer } from "effect";
import { newId } from "../../platform/ids.ts";
import type { AnnouncementItem, SubmissionItem } from "../../database/schemas/index.ts";
import type { Actor } from "../auth/Session.ts";
import { ClassRepo } from "../classes/Repo.ts";
import { ClassService } from "../classes/Service.ts";
import { SubmissionRepo } from "./Repo.ts";

type Missing = Forbidden | NotFound;

// A student's view of their own work. The score stays hidden until the teacher returns it.
export const toMyWork = (post: AnnouncementItem, sub: SubmissionItem | null): MyWork => {
  const { status, late } = submissionStatus({
    dueAt: post.dueAt?.toISOString() ?? null,
    turnedInAt: sub?.turnedInAt?.toISOString() ?? null,
    returnedAt: sub?.returnedAt?.toISOString() ?? null,
  });
  const returned = sub?.returnedAt != null;
  return {
    announcementId: post.id,
    accepting: post.acceptingSubmissions,
    status,
    late,
    attachments: sub?.attachments ?? [],
    turnedInAt: sub?.turnedInAt?.toISOString() ?? null,
    points: post.points,
    score: returned ? (sub?.score ?? null) : null,
    returnedAt: sub?.returnedAt?.toISOString() ?? null,
  };
};

export class SubmissionService extends Context.Service<
  SubmissionService,
  {
    readonly mine: (actor: Actor, classId: string, announcementId: string) => Effect.Effect<MyWork, NotFound>;
    readonly classMine: (actor: Actor, classId: string) => Effect.Effect<MyWorkStatus[], NotFound>;
    readonly turnIn: (actor: Actor, classId: string, announcementId: string, attachments: readonly Attachment[]) => Effect.Effect<MyWork, NotFound | Conflict>;
    readonly unsubmit: (actor: Actor, classId: string, announcementId: string) => Effect.Effect<MyWork, NotFound | Conflict>;
    readonly list: (actor: Actor, classId: string, announcementId: string) => Effect.Effect<PostWork, NotFound>;
    readonly grade: (actor: Actor, classId: string, announcementId: string, studentId: string, score: number | null) => Effect.Effect<void, NotFound | Conflict>;
    readonly returnWork: (actor: Actor, classId: string, announcementId: string, studentIds: readonly string[] | null) => Effect.Effect<number, NotFound>;
    readonly setAccepting: (actor: Actor, classId: string, announcementId: string, accepting: boolean) => Effect.Effect<void, NotFound>;
  }
>()("examinus/api/SubmissionService") {
  static readonly layer = Layer.effect(
    SubmissionService,
    Effect.gen(function* () {
      const repo = yield* SubmissionRepo;
      const classRepo = yield* ClassRepo;
      const classes = yield* ClassService;

      // The roster entry of a student who belongs to the class, and the post (an assignment or activity of it).
      const asStudent = Effect.fn("SubmissionService.asStudent")(function* (actor: Actor, classId: string, announcementId: string) {
        const member = yield* classRepo.membership(actor.id, classId);
        if (!member) return yield* new NotFound({ message: "You're not in that class." });
        const post = yield* repo.work(classId, announcementId);
        if (!post) return yield* new NotFound({ message: "That assignment doesn't exist." });
        return { studentId: member.studentId, post };
      });
      // The post of a class the teacher owns.
      const asTeacher = Effect.fn("SubmissionService.asTeacher")(function* (actor: Actor, classId: string, announcementId: string) {
        yield* classes.ownClass(actor, classId);
        const post = yield* repo.work(classId, announcementId);
        if (!post) return yield* new NotFound({ message: "That assignment doesn't exist." });
        return post;
      });
      const mineOf = (post: AnnouncementItem, studentId: string) =>
        repo.forStudent([post.id], studentId).pipe(Effect.map((rows) => toMyWork(post, rows[0] ?? null)));

      return SubmissionService.of({
        mine: Effect.fn("SubmissionService.mine")(function* (actor, classId, announcementId) {
          const { studentId, post } = yield* asStudent(actor, classId, announcementId);
          return yield* mineOf(post, studentId);
        }),

        classMine: Effect.fn("SubmissionService.classMine")(function* (actor, classId) {
          const member = yield* classRepo.membership(actor.id, classId);
          if (!member) return yield* new NotFound({ message: "You're not in that class." });
          const posts = yield* repo.workOf(classId);
          const subs = yield* repo.forStudent(posts.map((p) => p.id), member.studentId);
          return posts.map((post) => {
            const w = toMyWork(post, subs.find((s) => s.announcementId === post.id) ?? null);
            return { announcementId: post.id, status: w.status, late: w.late, score: w.score };
          });
        }),

        turnIn: Effect.fn("SubmissionService.turnIn")(function* (actor, classId, announcementId, attachments) {
          const { studentId, post } = yield* asStudent(actor, classId, announcementId);
          if (!post.acceptingSubmissions) return yield* new Conflict({ message: "Your teacher isn't taking submissions for this anymore." });
          const existing = (yield* repo.forStudent([post.id], studentId))[0];
          if (existing?.returnedAt) return yield* new Conflict({ message: "Your teacher already returned this work." });
          const cleaned = attachments.slice(0, maxAttachments).map((a) => cleanAttachment(a.kind, a.url, a.title));
          if (cleaned.includes(null)) return yield* new Conflict({ message: "One of the attachments has an address that isn't valid." });
          const row = yield* repo.turnIn({ id: newId("sub"), announcementId, studentId, attachments: cleaned as Attachment[], at: new Date() });
          return toMyWork(post, row);
        }),

        unsubmit: Effect.fn("SubmissionService.unsubmit")(function* (actor, classId, announcementId) {
          const { studentId, post } = yield* asStudent(actor, classId, announcementId);
          const row = yield* repo.unsubmit(announcementId, studentId);
          if (!row) return yield* new Conflict({ message: "There's nothing to take back: it isn't turned in, or your teacher returned it." });
          return toMyWork(post, row);
        }),

        list: Effect.fn("SubmissionService.list")(function* (actor, classId, announcementId) {
          const post = yield* asTeacher(actor, classId, announcementId);
          const [roster, subs] = yield* Effect.all([repo.roster(classId), repo.forPost(announcementId)]);
          const rows = roster.map((s) => {
            const sub = subs.find((x) => x.studentId === s.studentId) ?? null;
            const { status, late } = submissionStatus({
              dueAt: post.dueAt?.toISOString() ?? null,
              turnedInAt: sub?.turnedInAt?.toISOString() ?? null,
              returnedAt: sub?.returnedAt?.toISOString() ?? null,
            });
            return {
              studentId: s.studentId,
              name: `${s.firstName} ${s.lastName}`.trim(),
              status,
              late,
              attachments: sub?.attachments ?? [],
              turnedInAt: sub?.turnedInAt?.toISOString() ?? null,
              score: sub?.score ?? null,
            };
          });
          const turnedIn = rows.filter((r) => r.status === "turned_in" || r.status === "returned").length;
          return { accepting: post.acceptingSubmissions, points: post.points, turnedIn, assigned: rows.length - turnedIn, rows };
        }),

        grade: Effect.fn("SubmissionService.grade")(function* (actor, classId, announcementId, studentId, score) {
          const post = yield* asTeacher(actor, classId, announcementId);
          if (post.points === null) return yield* new Conflict({ message: "This one has no points, so it isn't graded." });
          if (score !== null && (score < 0 || score > post.points)) return yield* new Conflict({ message: `Give a score from 0 to ${post.points}.` });
          const onRoster = (yield* repo.roster(classId)).some((s) => s.studentId === studentId);
          if (!onRoster) return yield* new NotFound({ message: "That student isn't in this class." });
          yield* repo.setScore({ id: newId("sub"), announcementId, studentId, score });
        }),

        returnWork: Effect.fn("SubmissionService.returnWork")(function* (actor, classId, announcementId, studentIds) {
          yield* asTeacher(actor, classId, announcementId);
          return yield* repo.returnWork(announcementId, studentIds, new Date());
        }),

        setAccepting: Effect.fn("SubmissionService.setAccepting")(function* (actor, classId, announcementId, accepting) {
          yield* asTeacher(actor, classId, announcementId);
          yield* repo.setAccepting(classId, announcementId, accepting);
        }),
      });
    }),
  );
}
