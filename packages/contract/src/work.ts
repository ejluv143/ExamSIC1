// Turning in work for assignments and activities: the student's side and the teacher's "Student work".
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Attachment } from "@examinus/domain/classes";
import { MyWork, MyWorkStatus, PostWork } from "@examinus/domain/submissions";
import { Conflict, Forbidden, NotFound } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";
import { ClassId } from "./shared.ts";

const Post = { ...ClassId, announcementId: Schema.String };

export class WorkRpcs extends RpcGroup.make(
  // A student's own work on one post.
  Rpc.make("mine", { payload: Post, success: MyWork, error: Schema.Union([Forbidden, NotFound]) }),
  // Where a student stands on every assignment and activity of a class.
  Rpc.make("classMine", { payload: ClassId, success: Schema.Array(MyWorkStatus), error: Schema.Union([Forbidden, NotFound]) }),
  // Turns work in (with no attachments it is "mark as done").
  Rpc.make("turnIn", {
    payload: { ...Post, attachments: Schema.Array(Attachment) },
    success: MyWork,
    error: Schema.Union([Forbidden, NotFound, Conflict]),
  }),
  // Takes turned-in work back to change it; refused once the teacher has returned it.
  Rpc.make("unsubmit", { payload: Post, success: MyWork, error: Schema.Union([Forbidden, NotFound, Conflict]) }),
  // The teacher's view: every student on the roster and where they stand.
  Rpc.make("list", { payload: Post, success: PostWork, error: Schema.Union([Forbidden, NotFound]) }),
  // A grade (null clears it); the student only sees it once the work is returned.
  Rpc.make("grade", {
    payload: { ...Post, studentId: Schema.String, score: Schema.NullOr(Schema.Int) },
    error: Schema.Union([Forbidden, NotFound, Conflict]),
  }),
  // Gives graded work back (the listed students, or everyone turned in when null). Answers with how many.
  Rpc.make("returnWork", {
    payload: { ...Post, studentIds: Schema.NullOr(Schema.Array(Schema.String)) },
    success: Schema.Struct({ returned: Schema.Int }),
    error: Schema.Union([Forbidden, NotFound]),
  }),
  Rpc.make("setAccepting", { payload: { ...Post, accepting: Schema.Boolean }, error: Schema.Union([Forbidden, NotFound]) }),
)
  .prefix("work.")
  .middleware(AuthMiddleware) {}
