import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Announcement, ClassInfo, PostFields, RosterStudent, SexSchema } from "@examinus/domain/classes";
import { Conflict, Forbidden, NotFound, TooManyRequests } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";
import { ClassId } from "./shared.ts";

// A student's own classes.
export class EnrollmentRpcs extends RpcGroup.make(
  // Their roster entry (none before they first join a class) and the classes they're in.
  Rpc.make("mine", {
    success: Schema.Struct({ student: Schema.NullOr(RosterStudent), classes: Schema.Array(ClassInfo) }),
    error: Forbidden,
  }),
  // `sex` and `studentNumber` are needed the first time, for the teacher's grade sheet.
  Rpc.make("join", {
    payload: {
      code: Schema.String,
      sex: Schema.NullOr(SexSchema),
      studentNumber: Schema.NullOr(Schema.String.check(Schema.isMaxLength(40))),
    },
    success: Schema.Struct({ classId: Schema.String }),
    error: Schema.Union([Forbidden, NotFound, Conflict, TooManyRequests]),
  }),
  Rpc.make("leave", { payload: ClassId, error: Schema.Union([Forbidden, NotFound]) }),
  // The stream of a class the student is in: the teacher's posts, newest first.
  // What a class code opens, before joining, so the student can confirm it is the right class.
  Rpc.make("preview", {
    payload: { code: Schema.String },
    success: Schema.Struct({
      courseCode: Schema.String,
      title: Schema.String,
      section: Schema.String,
      term: Schema.String,
      schedule: Schema.String,
      room: Schema.String,
      units: Schema.Number,
      teacher: Schema.String,
      joined: Schema.Boolean,
    }),
    error: Schema.Union([Forbidden, NotFound, TooManyRequests]),
  }),
  // A student's own announcement to a class they are in; the answer is the new post.
  Rpc.make("post", { payload: { ...ClassId, post: PostFields }, success: Announcement, error: Schema.Union([Forbidden, NotFound]) }),
  Rpc.make("deletePost", { payload: { ...ClassId, announcementId: Schema.String }, error: Schema.Union([Forbidden, NotFound]) }),
  // Who is in a class the student belongs to: names only.
  Rpc.make("people", {
    payload: ClassId,
    success: Schema.Struct({ teachers: Schema.Array(Schema.String), classmates: Schema.Array(Schema.String) }),
    error: Schema.Union([Forbidden, NotFound]),
  }),
  Rpc.make("announcements", { payload: ClassId, success: Schema.Array(Announcement), error: Schema.Union([Forbidden, NotFound]) }),
)
  .prefix("enrollment.")
  .middleware(AuthMiddleware) {}
