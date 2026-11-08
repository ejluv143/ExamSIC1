import type { ProfileFields } from "@examinus/domain/profile";
import { asc, eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database } from "../../platform/Database.ts";
import { students, studentProfiles, type StudentProfileRow } from "../../database/schemas/index.ts";

export class ProfileRepo extends Context.Service<
  ProfileRepo,
  {
    readonly get: (userId: string) => Effect.Effect<StudentProfileRow | null>;
    // The account's earliest roster entry: its name and student number.
    readonly roster: (userId: string) => Effect.Effect<{ firstName: string; lastName: string; studentNumber: string | null } | null>;
    readonly save: (userId: string, fields: ProfileFields) => Effect.Effect<StudentProfileRow>;
  }
>()("examinus/api/ProfileRepo") {
  static readonly layer = Layer.effect(
    ProfileRepo,
    Effect.gen(function* () {
      const db = yield* Database;
      return ProfileRepo.of({
        get: Effect.fn("ProfileRepo.get")(function* (userId) {
          const [row] = yield* db.query((d) => d.select().from(studentProfiles).where(eq(studentProfiles.userId, userId)));
          return row ?? null;
        }),
        roster: Effect.fn("ProfileRepo.roster")(function* (userId) {
          const [row] = yield* db.query((d) =>
            d
              .select({ firstName: students.firstName, lastName: students.lastName, studentNumber: students.studentNumber })
              .from(students)
              .where(eq(students.userId, userId))
              .orderBy(asc(students.createdAt))
              .limit(1),
          );
          return row ?? null;
        }),
        save: Effect.fn("ProfileRepo.save")(function* (userId, fields) {
          const [row] = yield* db.query((d) =>
            d
              .insert(studentProfiles)
              .values({ userId, ...fields })
              .onConflictDoUpdate({ target: studentProfiles.userId, set: { ...fields } })
              .returning(),
          );
          return row!;
        }),
      });
    }),
  );
}
