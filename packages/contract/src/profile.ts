// The signed-in student's own profile (Student Information).
import { Rpc, RpcGroup } from "effect/rpc";
import { ProfileFields, StudentProfile } from "@examinus/domain/profile";
import { Forbidden } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";

export class ProfileRpcs extends RpcGroup.make(
  Rpc.make("mine", { success: StudentProfile, error: Forbidden }),
  Rpc.make("save", { payload: { fields: ProfileFields }, success: StudentProfile, error: Forbidden }),
)
  .prefix("profile.")
  .middleware(AuthMiddleware) {}
