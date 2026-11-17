// The signed-in student's own profile (Student Information).
import { Rpc, RpcGroup } from "effect/rpc";
import { ProfileFields, StudentProfile } from "@examinus/domain/profile";
import { Schema } from "effect";
import { Password } from "@examinus/domain/user";
import { AccountRejected } from "./admin.ts";
import { Forbidden } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";

export class ProfileRpcs extends RpcGroup.make(
  Rpc.make("mine", { success: StudentProfile, error: Forbidden }),
  Rpc.make("save", { payload: { fields: ProfileFields }, success: StudentProfile, error: Forbidden }),
  // Any signed-in account's own name and password (a teacher's profile page).
  Rpc.make("updateName", { payload: { name: Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(100)) }, error: AccountRejected }),
  Rpc.make("changePassword", { payload: { currentPassword: Schema.String, newPassword: Password }, error: AccountRejected }),
)
  .prefix("profile.")
  .middleware(AuthMiddleware) {}
