import { WorkRpcs } from "@examinus/contract/work";
import { Effect } from "effect";
import { requireActor } from "../auth/Session.ts";
import { SubmissionService } from "./Service.ts";

export const WorkHandlers = WorkRpcs.toLayer(
  Effect.gen(function* () {
    const work = yield* SubmissionService;

    return WorkRpcs.of({
      "work.mine": Effect.fn("work.mine")(function* ({ classId, announcementId }) {
        const me = yield* requireActor({ enrollment: ["read"] });
        return yield* work.mine(me.actor, classId, announcementId);
      }),
      "work.classMine": Effect.fn("work.classMine")(function* ({ classId }) {
        const me = yield* requireActor({ enrollment: ["read"] });
        return yield* work.classMine(me.actor, classId);
      }),
      "work.turnIn": Effect.fn("work.turnIn")(function* ({ classId, announcementId, attachments }) {
        const me = yield* requireActor({ enrollment: ["read"] });
        return yield* work.turnIn(me.actor, classId, announcementId, attachments);
      }),
      "work.unsubmit": Effect.fn("work.unsubmit")(function* ({ classId, announcementId }) {
        const me = yield* requireActor({ enrollment: ["read"] });
        return yield* work.unsubmit(me.actor, classId, announcementId);
      }),
      "work.list": Effect.fn("work.list")(function* ({ classId, announcementId }) {
        const me = yield* requireActor({ class: ["read"] });
        return yield* work.list(me.actor, classId, announcementId);
      }),
      "work.grade": Effect.fn("work.grade")(function* ({ classId, announcementId, studentId, score }) {
        const me = yield* requireActor({ class: ["update"] });
        yield* work.grade(me.actor, classId, announcementId, studentId, score);
      }),
      "work.returnWork": Effect.fn("work.returnWork")(function* ({ classId, announcementId, studentIds }) {
        const me = yield* requireActor({ class: ["update"] });
        return { returned: yield* work.returnWork(me.actor, classId, announcementId, studentIds) };
      }),
      "work.setAccepting": Effect.fn("work.setAccepting")(function* ({ classId, announcementId, accepting }) {
        const me = yield* requireActor({ class: ["update"] });
        yield* work.setAccepting(me.actor, classId, announcementId, accepting);
      }),
    });
  }),
);
