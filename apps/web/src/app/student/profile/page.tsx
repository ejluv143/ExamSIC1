import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { assetUrls } from "@/features/assets/data";
import { getMyProfile } from "@/features/profile/data";
import { ProfileForm } from "@/features/profile/components/profile-form";
import { assetIdOfRef } from "@examinus/domain/asset";

export const metadata: Metadata = { title: "Student information" };

export default async function StudentProfilePage() {
  const profile = await getMyProfile();
  const ids = [profile.picture, profile.signature].flatMap((r) => (r ? [assetIdOfRef(r)] : [])).filter((id): id is string => id !== null);
  const urls = await assetUrls(ids);
  const urlOf = (ref: string | null) => (ref ? (urls[assetIdOfRef(ref) ?? ""] ?? null) : null);
  return (
    <>
      <PageHeader
        title="Student information"
        description={profile.updatedAt ? `Last updated ${new Date(profile.updatedAt).toLocaleString()}` : "Keep your details up to date. Your name and student ID are set by your school."}
      />
      <ProfileForm profile={profile} pictureUrl={urlOf(profile.picture)} signatureUrl={urlOf(profile.signature)} />
    </>
  );
}
