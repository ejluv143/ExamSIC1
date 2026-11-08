// A teacher's classes: who owns one, its roster, and the teacher's changes to both.
import { NotFound } from "@examinus/contract/errors";
import { assetIdsIn } from "@examinus/domain/asset";
import { cleanAttachment, maxAttachments, maxPostPoints, maxRubricRows, maxTimeLimitMinutes, type ClassAppearance, type ClassFields, type PostFields } from "@examinus/domain/classes";
import { Context, Effect, Layer } from "effect";
import { newId } from "../../platform/ids.ts";
import type { Actor } from "../auth/Session.ts";
import type { AnnouncementItem, ClassItem, StudentItem } from "../../database/schemas/index.ts";
import { classColumns } from "./mappers.ts";
import { ClassRepo } from "./Repo.ts";
import { ClassRoster } from "./Roster.ts";
import { newJoinCode } from "./rules.ts";

const noSuchClass = () => new NotFound({ message: "That class doesn't exist or isn't yours." });

export type ClassWithRoster = { row: ClassItem; studentIds: string[] };

// What a post is made of once it is checked: an announcement needs text, an assignment or activity a title, a
// deadline only goes with the latter two, and each attachment's address is checked again here (one that isn't
// valid is refused, not dropped).
export const postValues = Effect.fn("ClassService.postValues")(function* (post: PostFields) {
  const body = post.body.trim();
  const title = post.kind === "announcement" ? "" : post.title.trim();
  if (post.kind === "announcement" ? !body : !title)
    return yield* new NotFound({ message: post.kind === "announcement" ? "Write something to announce." : "Give it a title." });
  const attachments = post.attachments.slice(0, maxAttachments).map((a) => cleanAttachment(a.kind, a.url, a.title));
  if (attachments.includes(null)) return yield* new NotFound({ message: "One of the attachments has an address that isn't valid." });
  const due = post.kind === "announcement" || !post.dueAt ? null : new Date(post.dueAt);
  // Points, a time limit and a rubric only go with an assignment. A rubric's total is the assignment's points.
  const assignment = post.kind === "assignment";
  const rubric = (assignment ? (post.rubric ?? []) : [])
    .slice(0, maxRubricRows)
    .map((row) => ({ criterion: row.criterion.trim().slice(0, 200), points: row.points }))
    .filter((row) => row.criterion !== "");
  const whole = (n: number, max: number, min = 0) => Number.isInteger(n) && n >= min && n <= max;
  if (rubric.some((row) => !whole(row.points, maxPostPoints)))
    return yield* new NotFound({ message: `Each rubric row is worth a whole number of points from 0 to ${maxPostPoints}.` });
  const given = assignment ? (post.points ?? null) : null;
  if (given !== null && !whole(given, maxPostPoints)) return yield* new NotFound({ message: `Points are a whole number from 0 to ${maxPostPoints}.` });
  const points = rubric.length > 0 ? rubric.reduce((sum, row) => sum + row.points, 0) : given;
  if (points !== null && points > maxPostPoints) return yield* new NotFound({ message: `The rubric adds up to more than ${maxPostPoints} points.` });
  const timeLimitMinutes = assignment ? (post.timeLimitMinutes ?? null) : null;
  if (timeLimitMinutes !== null && !whole(timeLimitMinutes, maxTimeLimitMinutes, 1))
    return yield* new NotFound({ message: `The time limit is a whole number of minutes from 1 to ${maxTimeLimitMinutes}.` });
  return {
    points,
    timeLimitMinutes,
    rubric,
    title,
    body,
    dueAt: due && !Number.isNaN(due.getTime()) ? due : null,
    attachments: attachments.filter((a) => a !== null),
  };
});

export class ClassService extends Context.Service<
  ClassService,
  {
    // The signed-in teacher's class in their organization, unless it's archived.
    readonly ownClass: (actor: Actor, classId: string) => Effect.Effect<ClassItem, NotFound>;
    // Each class with its roster, in the order students joined.
    readonly withRosters: (rows: readonly ClassItem[]) => Effect.Effect<ClassWithRoster[]>;
    // The teacher's classes that aren't archived.
    readonly ownClasses: (actor: Actor) => Effect.Effect<ClassItem[]>;
    // The ids of the class's members.
    readonly memberIds: (classId: string) => Effect.Effect<string[]>;
    // The class and roster entry of a student who belongs to it; null when they don't (or it is archived).
    readonly membership: (userId: string, classId: string) => Effect.Effect<{ cls: ClassItem; studentId: string } | null>;
    readonly list: (actor: Actor) => Effect.Effect<ClassWithRoster[]>;
    // The class's announcements, newest first.
    readonly announcements: (actor: Actor, classId: string) => Effect.Effect<(AnnouncementItem & { authorName: string })[], NotFound>;
    readonly postAnnouncement: (actor: Actor, classId: string, post: PostFields) => Effect.Effect<AnnouncementItem, NotFound>;
    readonly updateAnnouncement: (
      actor: Actor,
      classId: string,
      announcementId: string,
      post: PostFields,
    ) => Effect.Effect<AnnouncementItem, NotFound>;
    readonly deleteAnnouncement: (actor: Actor, classId: string, announcementId: string) => Effect.Effect<void, NotFound>;
    // The teacher's class with its roster, or null when it isn't theirs (or is archived).
    readonly get: (actor: Actor, classId: string) => Effect.Effect<ClassWithRoster | null>;
    readonly create: (actor: Actor, fields: ClassFields) => Effect.Effect<{ id: string }>;
    readonly update: (actor: Actor, classId: string, fields: ClassFields) => Effect.Effect<void, NotFound>;
    readonly customize: (actor: Actor, classId: string, appearance: ClassAppearance) => Effect.Effect<void, NotFound>;
    readonly archive: (actor: Actor, classId: string) => Effect.Effect<void, NotFound>;
    readonly newJoinCode: (actor: Actor, classId: string) => Effect.Effect<{ joinCode: string }, NotFound>;
    readonly removeStudent: (actor: Actor, classId: string, studentId: string) => Effect.Effect<void, NotFound>;
    // The roster entries among `studentIds` that the teacher may see.
    readonly students: (actor: Actor, studentIds: readonly string[]) => Effect.Effect<StudentItem[]>;
  }
>()("examinus/api/ClassService") {
  static readonly layer = Layer.effect(
    ClassService,
    Effect.gen(function* () {
      const repo = yield* ClassRepo;
      const roster = yield* ClassRoster;

      const ownClass = Effect.fn("ClassService.ownClass")(function* (actor: Actor, classId: string) {
        const row = yield* repo.findOwn(actor, classId);
        if (!row) return yield* noSuchClass();
        return row;
      });

      const withRosters = Effect.fn("ClassService.withRosters")(function* (rows: readonly ClassItem[]) {
        if (rows.length === 0) return [];
        const members = yield* repo.members(rows.map((r) => r.id));
        return rows.map((row) => ({
          row,
          studentIds: members.filter((m) => m.classId === row.id).map((m) => m.studentId),
        }));
      });

      return ClassService.of({
        ownClass,
        withRosters,
        ownClasses: repo.ofTeacher,
        memberIds: repo.memberIds,
        membership: repo.membership,
        announcements: Effect.fn("ClassService.announcements")(function* (actor, classId) {
          yield* ownClass(actor, classId);
          return yield* repo.announcements(classId);
        }),
        postAnnouncement: Effect.fn("ClassService.postAnnouncement")(function* (actor, classId, post) {
          yield* ownClass(actor, classId);
          const values = yield* postValues(post);
          return yield* repo.insertAnnouncement({ id: newId("an"), classId, authorId: actor.id, kind: post.kind, ...values });
        }),
        updateAnnouncement: Effect.fn("ClassService.updateAnnouncement")(function* (actor, classId, announcementId, post) {
          yield* ownClass(actor, classId);
          const values = yield* postValues(post);
          const updated = yield* repo.updateAnnouncement(classId, announcementId, post.kind, values);
          if (!updated) return yield* new NotFound({ message: "That post doesn't exist." });
          return updated;
        }),
        deleteAnnouncement: Effect.fn("ClassService.deleteAnnouncement")(function* (actor, classId, announcementId) {
          yield* ownClass(actor, classId);
          const removed = yield* repo.deleteAnnouncement(classId, announcementId);
          if (!removed) return yield* new NotFound({ message: "That announcement doesn't exist." });
        }),
        list: Effect.fn("ClassService.list")(function* (actor) {
          return yield* withRosters(yield* repo.ofTeacher(actor));
        }),
        get: Effect.fn("ClassService.get")(function* (actor, classId) {
          const row = yield* repo.findOwn(actor, classId);
          if (!row) return null;
          const [withRoster] = yield* withRosters([row]);
          return withRoster!;
        }),
        create: Effect.fn("ClassService.create")(function* (actor, fields) {
          const id = newId("c");
          yield* repo.insert({ id, teacherId: actor.id, organizationId: actor.organizationId, joinCode: newJoinCode(), ...classColumns(fields) });
          return { id };
        }),
        update: Effect.fn("ClassService.update")(function* (actor, classId, fields) {
          yield* ownClass(actor, classId);
          yield* repo.update(classId, classColumns(fields));
        }),
        customize: Effect.fn("ClassService.customize")(function* (actor, classId, appearance) {
          yield* ownClass(actor, classId);
          const image = appearance.headerImage;
          // Only an asset id is kept; what it may show is decided when its URL is asked for.
          if (image !== null && assetIdsIn(image)[0] !== image) return yield* new NotFound({ message: "That picture isn't valid." });
          yield* repo.update(classId, { color: appearance.color, headerImage: image });
        }),
        archive: Effect.fn("ClassService.archive")(function* (actor, classId) {
          yield* ownClass(actor, classId);
          yield* repo.update(classId, { archivedAt: new Date() });
        }),
        newJoinCode: Effect.fn("ClassService.newJoinCode")(function* (actor, classId) {
          yield* ownClass(actor, classId);
          const joinCode = newJoinCode();
          yield* repo.update(classId, { joinCode });
          return { joinCode };
        }),
        removeStudent: Effect.fn("ClassService.removeStudent")(function* (actor, classId, studentId) {
          yield* ownClass(actor, classId);
          const removed = yield* roster.left(classId, studentId);
          if (!removed) return yield* new NotFound({ message: "That student isn't in this class." });
        }),
        students: Effect.fn("ClassService.students")(function* (actor, studentIds) {
          if (studentIds.length === 0) return [];
          const found = yield* repo.teacherStudents(actor, studentIds);
          return [...new Map(found.map((student) => [student.id, student])).values()];
        }),
      });
    }),
  );
}
