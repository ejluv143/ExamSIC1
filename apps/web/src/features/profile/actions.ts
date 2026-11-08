"use server";

import { revalidatePath } from "next/cache";
import type { ProfileFields } from "@examinus/domain/profile";
import { saveMyProfile } from "./data";

export type ProfileFormState = { error: string } | { saved: true } | undefined;

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");
const ref = (formData: FormData, name: string) => text(formData, name) || null;

export async function saveProfileAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const fields: ProfileFields = {
    usn: text(formData, "usn"),
    lrn: text(formData, "lrn"),
    middleName: text(formData, "middleName"),
    suffix: text(formData, "suffix"),
    purok: text(formData, "purok"),
    province: text(formData, "province"),
    barangay: text(formData, "barangay"),
    city: text(formData, "city"),
    zipCode: text(formData, "zipCode"),
    contactNumber: text(formData, "contactNumber"),
    birthDate: text(formData, "birthDate"),
    personalEmail: text(formData, "personalEmail"),
    facebookUrl: text(formData, "facebookUrl"),
    contactFirstName: text(formData, "contactFirstName"),
    contactLastName: text(formData, "contactLastName"),
    contactMiddleName: text(formData, "contactMiddleName"),
    contactPhone: text(formData, "contactPhone"),
    contactAddress: text(formData, "contactAddress"),
    picture: ref(formData, "picture"),
    signature: ref(formData, "signature"),
  };
  const error = await saveMyProfile(fields);
  if (error) return { error: "Some of what you entered is too long or isn't valid. Check it and try again." };
  revalidatePath("/student/profile");
  return { saved: true };
}
