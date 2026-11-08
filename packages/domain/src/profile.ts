// A student's own profile (Student Information): the details the school keeps beyond the roster entry. The student
// edits it; the name, student number and sign-in email come from their roster entry and account and are read-only.
import { Schema } from "effect";
import { assetIdOfRef } from "./asset.ts";

const Text = (max: number) => Schema.String.check(Schema.isMaxLength(max));

// What the student can change. `picture` and `signature` are `asset:<id>` references to uploaded images (null: none).
export const ProfileFields = Schema.Struct({
  usn: Text(40),
  lrn: Text(40),
  middleName: Text(80),
  suffix: Text(20),
  purok: Text(120),
  province: Text(120),
  barangay: Text(120),
  city: Text(120),
  zipCode: Text(10),
  contactNumber: Text(40),
  // YYYY-MM-DD, or "" when not given.
  birthDate: Schema.String.check(Schema.isPattern(/^(\d{4}-\d{2}-\d{2})?$/)),
  personalEmail: Text(200),
  facebookUrl: Text(300),
  contactFirstName: Text(80),
  contactLastName: Text(80),
  contactMiddleName: Text(80),
  contactPhone: Text(40),
  contactAddress: Text(300),
  picture: Schema.NullOr(Text(80)),
  signature: Schema.NullOr(Text(80)),
});
export type ProfileFields = typeof ProfileFields.Type;

export const StudentProfile = Schema.Struct({
  ...ProfileFields.fields,
  // From the roster entry and the account.
  firstName: Schema.String,
  lastName: Schema.String,
  studentNumber: Schema.String,
  email: Schema.String,
  // ISO time of the last save, null before the first.
  updatedAt: Schema.NullOr(Schema.String),
});
export type StudentProfile = typeof StudentProfile.Type;

// A picture or signature that is an uploaded image's reference, or null.
export const cleanImageRef = (value: string | null): string | null => (value && assetIdOfRef(value) ? value : null);
