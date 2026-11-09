import "server-only";
import type { ProfileFields } from "@examinus/domain/profile";
import { apiCall, messageOf, read } from "@/lib/api/helpers";
import { requirePermission } from "@/lib/auth/dal";

// The signed-in student's own profile with the name, student number and email around it.
export async function getMyProfile() {
  await requirePermission({ enrollment: ["read"] });
  return read((api) => api["profile.mine"]());
}

export async function saveMyProfile(fields: ProfileFields) {
  await requirePermission({ enrollment: ["read"] });
  return messageOf(await apiCall((api) => api["profile.save"]({ fields })));
}
