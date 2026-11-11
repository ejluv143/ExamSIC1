// Students joining and leaving classes with a join code.
import { Conflict, Forbidden, NotFound, TooManyRequests } from "@examinus/contract/errors";
import { can, grantsOf } from "@examinus/domain/permissions";
import { parseMemberRoles } from "@examinus/domain/roles";
import type { PostFields } from "@examinus/domain/classes";
import { type SessionUser } from "@examinus/domain/user";
import { Context, Effect, Layer } from "effect";
import type { Headers as EffectHeaders } from "effect/http";
import { newId } from "../../platform/ids.ts";
import type { AnnouncementItem, ClassItem, ResourceItem, StudentItem } from "../../database/schemas/index.ts";
import { limits, RateLimiter } from "../../platform/RateLimiter.ts";
import { BetterAuth, webHeaders } from "../auth/BetterAuth.ts";
import { type Actor } from "../auth/Session.ts";
import { OrganizationRepo } from "../organization/Repo.ts";
import { ClassService, postValues, type ClassWithRoster } from "./Service.ts";
import { ClassRepo, type Sex } from "./Repo.ts";
import { ClassRoster } from "./Roster.ts";
import { normalizeCode, splitName } from "./rules.ts";

export class EnrollmentService extends Context.Service<
  EnrollmentService,
  {
    // The student's roster entry and their classes (with rosters) in the active organization (or their personal
    // space); the entry is null before their first class there.
    readonly mine: (actor: Actor) => Effect.Effect<{ student: StudentItem | null; classes: ClassWithRoster[] }>;
    // The code says which organization the class is in (none: the teacher's personal space). The student becomes a
    // member of the organization (with the student role) and it becomes their active one; for a personal-space
    // class their personal space does.
    readonly join: (
      user: SessionUser,
      input: { code: string; sex: Sex | null; studentNumber: string | null },
      headers: EffectHeaders.Headers,
    ) => Effect.Effect<{ classId: string }, Forbidden | NotFound | Conflict | TooManyRequests>;
    readonly leave: (actor: Actor, classId: string) => Effect.Effect<void, NotFound>;
    // The announcements of a class the student belongs to, newest first.
    readonly announcements: (actor: Actor, classId: string) => Effect.Effect<(AnnouncementItem & { authorName: string })[], NotFound>;
    // What a join code opens, before joining: so the student can confirm. Wrong codes count against the same limit as joining.
    readonly preview: (
      user: SessionUser,
      code: string,
    ) => Effect.Effect<
      { courseCode: string; title: string; section: string; term: string; schedule: string; room: string; units: number; teacher: string; joined: boolean },
      NotFound | TooManyRequests
    >;
    // A student's own announcement to the class (text and links only; assignments and activities are the teacher's).
    readonly post: (actor: Actor, classId: string, post: PostFields) => Effect.Effect<AnnouncementItem, NotFound>;
    // Removes the student's own announcement.
    readonly deletePost: (actor: Actor, classId: string, announcementId: string) => Effect.Effect<void, NotFound>;
    // The names of the teacher and the students of a class the student belongs to.
    readonly people: (
      actor: Actor,
      classId: string,
    ) => Effect.Effect<{ teacher: string | null; classmates: { firstName: string; lastName: string }[] }, NotFound>;
    // The Resources shelf of a class the student belongs to.
    readonly resources: (actor: Actor, classId: string) => Effect.Effect<ResourceItem[], NotFound>;
  }
>()("examinus/api/EnrollmentService") {
  static readonly layer = Layer.effect(
    EnrollmentService,
    Effect.gen(function* () {
      const repo = yield* ClassRepo;
      const roster = yield* ClassRoster;
      const classes = yield* ClassService;
      const limiter = yield* RateLimiter;
      const organizations = yield* OrganizationRepo;
      const auth = yield* BetterAuth;

      // A roster entry imported from Google Classroom has the student's email but no account. The first time a
      // student whose email Google has verified signs in, it becomes theirs, with its classes and their open sessions.
      // Unverified emails (email and password sign-up) never claim one, so nobody takes over a classmate's grades.
      const claimImported = Effect.fn("EnrollmentService.claimImported")(function* (actor: Actor) {
        const account = yield* repo.emailOf(actor.id);
        if (!account?.verified) return null;
        const claimed = yield* repo.claimByEmail(actor.organizationId, actor.id, account.email);
        if (!claimed) return null;
        yield* roster.claimed(claimed.id);
        return claimed;
      });

      // The student's roster entry in the organization, if they've joined a class there before (or one was imported
      // for them).
      const rosterEntry = Effect.fn("EnrollmentService.rosterEntry")(function* (actor: Actor) {
        return (yield* repo.studentOf(actor.organizationId, actor.id)) ?? (yield* claimImported(actor));
      });

      return EnrollmentService.of({
        mine: Effect.fn("EnrollmentService.mine")(function* (actor) {
          const student = yield* rosterEntry(actor);
          if (!student) return { student: null, classes: [] };
          const rows: ClassItem[] = yield* repo.classesOf(student.id);
          return { student, classes: yield* classes.withRosters(rows) };
        }),

        join: Effect.fn("EnrollmentService.join")(function* (user, { code, sex, studentNumber }, headers) {
          // Only wrong codes count, to slow guessing.
          yield* limiter.check(limits.joinCode, user.id);
          const found = yield* repo.idByJoinCode(normalizeCode(code));
          if (!found) {
            yield* limiter.count(limits.joinCode, user.id);
            return yield* new NotFound({ message: "No class uses that code. Check it with your teacher." });
          }
          const { id: classId, organizationId } = found;
          // A personal-space class has no organization to join; `can` for the user already allowed enrolling.
          if (organizationId !== null) {
            const member = yield* organizations.addMember(organizationId, user.id, ["student"]);
            const allowed = can(
              { role: user.role, organization: { permissions: grantsOf(parseMemberRoles(member.role)) } },
              { enrollment: ["create"] },
            );
            if (!allowed) return yield* new Forbidden({ message: "Only students join classes." });
          }
          const actor: Actor = { id: user.id, organizationId };
          const existing = yield* rosterEntry(actor);

          let student = existing;
          // An entry imported from Classroom lacks these until the student gives them, here.
          if (student && (!student.studentNumber || !student.sex)) {
            const number = student.studentNumber || studentNumber?.trim();
            const studentSex = student.sex ?? sex;
            if (!number) return yield* new Conflict({ message: "Enter your student number for your teacher's grade sheet." });
            if (!studentSex) return yield* new Conflict({ message: "Choose male or female for your teacher's grade sheet." });
            student = yield* repo.fillStudent(student.id, number, studentSex);
          }
          if (!student) {
            const number = studentNumber?.trim();
            if (!number) return yield* new Conflict({ message: "Enter your student number for your teacher's grade sheet." });
            if (!sex) return yield* new Conflict({ message: "Choose male or female for your teacher's grade sheet." });
            // The first class they join gives them a roster entry; a double submit finds the one just made.
            yield* repo.ensureStudent({
              id: newId("s"),
              organizationId,
              userId: user.id,
              studentNumber: number,
              email: user.email,
              sex,
              ...splitName(user.name),
            });
            student = yield* repo.studentOf(organizationId, user.id);
          }
          if (!student) return yield* Effect.die(`No roster entry for student ${user.id} after creating it.`);
          yield* roster.joined(classId, student.id);
          if ((user.organization?.id ?? null) !== organizationId) {
            yield* auth
              .call((api) => api.setActiveOrganization({ headers: webHeaders(headers), body: { organizationId } }))
              .pipe(Effect.orDie);
          }
          return { classId };
        }),

        leave: Effect.fn("EnrollmentService.leave")(function* (actor, classId) {
          const student = yield* rosterEntry(actor);
          const left = student ? yield* roster.left(classId, student.id) : false;
          if (!left) return yield* new NotFound({ message: "You're not in that class." });
        }),

        announcements: Effect.fn("EnrollmentService.announcements")(function* (actor, classId) {
          const member = yield* repo.membership(actor.id, classId);
          if (!member) return yield* new NotFound({ message: "You're not in that class." });
          return yield* repo.announcements(classId);
        }),

        preview: Effect.fn("EnrollmentService.preview")(function* (user, code) {
          yield* limiter.check(limits.joinCode, user.id);
          const found = yield* repo.previewByJoinCode(normalizeCode(code));
          if (!found) {
            yield* limiter.count(limits.joinCode, user.id);
            return yield* new NotFound({ message: "No class uses that code. Check it with your teacher." });
          }
          const { cls, teacher } = found;
          const joined = (yield* repo.membership(user.id, cls.id)) !== null;
          return { courseCode: cls.courseCode, title: cls.title, section: cls.section, term: cls.term, schedule: cls.schedule, room: cls.room, units: cls.units, teacher, joined };
        }),

        post: Effect.fn("EnrollmentService.post")(function* (actor, classId, post) {
          const member = yield* repo.membership(actor.id, classId);
          if (!member) return yield* new NotFound({ message: "You're not in that class." });
          const values = yield* postValues({ ...post, kind: "announcement" });
          return yield* repo.insertAnnouncement({ id: newId("an"), classId, authorId: actor.id, kind: "announcement", ...values });
        }),

        deletePost: Effect.fn("EnrollmentService.deletePost")(function* (actor, classId, announcementId) {
          const removed = yield* repo.deleteOwnAnnouncement(classId, announcementId, actor.id);
          if (!removed) return yield* new NotFound({ message: "You can only remove your own announcements." });
        }),

        people: Effect.fn("EnrollmentService.people")(function* (actor, classId) {
          const member = yield* repo.membership(actor.id, classId);
          if (!member) return yield* new NotFound({ message: "You're not in that class." });
          return yield* repo.people(classId);
        }),

        resources: Effect.fn("EnrollmentService.resources")(function* (actor, classId) {
          const member = yield* repo.membership(actor.id, classId);
          if (!member) return yield* new NotFound({ message: "You're not in that class." });
          return yield* repo.resources(classId);
        }),
      });
    }),
  );
}
