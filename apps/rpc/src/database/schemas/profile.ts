// A student's own details (Student Information), one row per account.
import { pgTable, text } from "drizzle-orm/pg-core";
import { timestamps } from "./_helpers.ts";
import { users } from "./auth.ts";

export const studentProfiles = pgTable("student_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  usn: text("usn").notNull().default(""),
  lrn: text("lrn").notNull().default(""),
  middleName: text("middle_name").notNull().default(""),
  suffix: text("suffix").notNull().default(""),
  purok: text("purok").notNull().default(""),
  province: text("province").notNull().default(""),
  barangay: text("barangay").notNull().default(""),
  city: text("city").notNull().default(""),
  zipCode: text("zip_code").notNull().default(""),
  contactNumber: text("contact_number").notNull().default(""),
  birthDate: text("birth_date").notNull().default(""),
  personalEmail: text("personal_email").notNull().default(""),
  facebookUrl: text("facebook_url").notNull().default(""),
  contactFirstName: text("contact_first_name").notNull().default(""),
  contactLastName: text("contact_last_name").notNull().default(""),
  contactMiddleName: text("contact_middle_name").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  contactAddress: text("contact_address").notNull().default(""),
  // `asset:<id>` references to uploaded images.
  picture: text("picture"),
  signature: text("signature"),
  ...timestamps,
});
export type StudentProfileRow = typeof studentProfiles.$inferSelect;
