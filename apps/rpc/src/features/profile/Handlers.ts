import { AccountRejected } from "@examinus/contract/admin";
import { CurrentUser } from "@examinus/contract/middleware";
import { ProfileRpcs } from "@examinus/contract/profile";
import { cleanImageRef, type ProfileFields, type StudentProfile } from "@examinus/domain/profile";
import { Effect } from "effect";
import type { StudentProfileRow } from "../../database/schemas/index.ts";
import { BetterAuth, webHeaders } from "../auth/BetterAuth.ts";
import { requireActor } from "../auth/Session.ts";
import { ProfileRepo } from "./Repo.ts";

const emptyFields: ProfileFields = {
  usn: "", lrn: "", middleName: "", suffix: "", purok: "", province: "", barangay: "", city: "", zipCode: "", contactNumber: "", birthDate: "",
  personalEmail: "", facebookUrl: "", contactFirstName: "", contactLastName: "", contactMiddleName: "", contactPhone: "",
  contactAddress: "", picture: null, signature: null,
};

export const ProfileHandlers = ProfileRpcs.toLayer(
  Effect.gen(function* () {
    const repo = yield* ProfileRepo;
    const auth = yield* BetterAuth;

    // The student's fields with their roster entry's name and number and their account's email around them.
    const view = Effect.fn("profile.view")(function* (userId: string, account: { name: string; email: string }, row: StudentProfileRow | null) {
      const roster = yield* repo.roster(userId);
      const [first = "", ...rest] = account.name.split(" ");
      const { userId: _user, createdAt: _created, updatedAt, ...fields } = row ?? { ...emptyFields, userId, createdAt: new Date(), updatedAt: null };
      return {
        ...fields,
        firstName: roster?.firstName ?? first,
        lastName: roster?.lastName ?? rest.join(" "),
        studentNumber: roster?.studentNumber ?? "",
        email: account.email,
        updatedAt: updatedAt ? updatedAt.toISOString() : null,
      } satisfies StudentProfile;
    });

    return ProfileRpcs.of({
      "profile.updateName": Effect.fn("profile.updateName")(function* ({ name }, { headers }) {
        yield* CurrentUser;
        yield* auth.call((api) => api.updateUser({ body: { name }, headers: webHeaders(headers) })).pipe(
          Effect.catchTag("AuthApiError", (e) => Effect.fail(new AccountRejected({ message: e.message }))),
        );
      }),

      "profile.changePassword": Effect.fn("profile.changePassword")(function* ({ currentPassword, newPassword }, { headers }) {
        yield* CurrentUser;
        yield* auth.call((api) => api.changePassword({ body: { currentPassword, newPassword }, headers: webHeaders(headers) })).pipe(
          Effect.catchTag("AuthApiError", (e) => Effect.fail(new AccountRejected({ message: e.message }))),
        );
      }),

      "profile.mine": Effect.fn("profile.mine")(function* () {
        const me = yield* requireActor({ enrollment: ["read"] });
        return yield* view(me.id, me, yield* repo.get(me.id));
      }),

      "profile.save": Effect.fn("profile.save")(function* ({ fields }) {
        const me = yield* requireActor({ enrollment: ["read"] });
        const trimmed = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])) as ProfileFields;
        const row = yield* repo.save(me.id, { ...trimmed, picture: cleanImageRef(trimmed.picture), signature: cleanImageRef(trimmed.signature) });
        return yield* view(me.id, me, row);
      }),
    });
  }),
);
