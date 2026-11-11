"use client";

import { useActionState, useRef, useState } from "react";
import { Camera, Loader2, PenLine } from "lucide-react";
import { assetRef } from "@examinus/domain/asset";
import type { StudentProfile } from "@examinus/domain/profile";
import { Button, inputClass } from "@/components/ui";
import { uploadImage } from "@/features/assets/upload-image";
import { saveProfileAction } from "../actions";
import { AddressFields } from "./address-fields";

const readonlyClass = `${inputClass} cursor-not-allowed bg-surface-muted text-muted`;

function Text({ label, name, value, type = "text", readOnly = false }: { label: string; name: string; value: string; type?: string; readOnly?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input name={readOnly ? undefined : name} defaultValue={value} type={type} readOnly={readOnly} className={readOnly ? readonlyClass : inputClass} />
    </label>
  );
}

// One image (the picture or the signature): shows what is saved, and a button that uploads a replacement.
function ImagePicker({ name, label, icon: Icon, initialRef, initialUrl, shape }: { name: string; label: string; icon: typeof Camera; initialRef: string | null; initialUrl: string | null; shape: "photo" | "signature" }) {
  const [value, setValue] = useState(initialRef);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function choose(file: File) {
    setError(null);
    setBusy(true);
    try {
      const uploaded = await uploadImage(file, "profile");
      setValue(assetRef(uploaded.assetId));
      setUrl(URL.createObjectURL(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The image couldn't be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <input type="hidden" name={name} value={value ?? ""} />
      <div className={shape === "photo" ? "grid h-48 w-40 place-items-center overflow-hidden rounded-md border border-border bg-surface" : "grid h-24 w-48 place-items-center overflow-hidden rounded-md border border-dashed border-border bg-surface"}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="size-full object-contain" />
        ) : (
          <span className="text-xs text-muted">No {label.toLowerCase()} yet</span>
        )}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} />
      <button type="button" onClick={() => input.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline disabled:opacity-60">
        {label} {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Icon className="size-4" aria-hidden />}
      </button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// The student's own Student Information: the name and student number come from the roster and can't be changed here.
export function ProfileForm({ profile, pictureUrl, signatureUrl }: { profile: StudentProfile; pictureUrl: string | null; signatureUrl: string | null }) {
  const [state, action, pending] = useActionState(saveProfileAction, undefined);
  const p = profile;
  return (
    <form action={action} className="space-y-6">
      <section className="rounded-xl border border-border bg-surface-muted/50 p-6">
        <div className="flex flex-wrap gap-8">
          <div className="space-y-4">
            <ImagePicker name="picture" label="Picture" icon={Camera} initialRef={p.picture} initialUrl={pictureUrl} shape="photo" />
            <ImagePicker name="signature" label="Signature" icon={PenLine} initialRef={p.signature} initialUrl={signatureUrl} shape="signature" />
          </div>
          <div className="min-w-64 flex-1 space-y-3">
            <p className="text-sm">
              Student ID: <span className="font-semibold">{p.studentNumber || "Not set yet"}</span>
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Text label="USN" name="usn" value={p.usn} />
              <Text label="LRN" name="lrn" value={p.lrn} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border p-6">
        <h2 className="mb-3 text-lg font-medium">Student name</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_8rem]">
          <Text label="First name" name="firstName" value={p.firstName} readOnly />
          <Text label="Last name" name="lastName" value={p.lastName} readOnly />
          <Text label="Middle name" name="middleName" value={p.middleName} />
          <Text label="Suffix" name="suffix" value={p.suffix} />
        </div>

        <h2 className="mt-6 mb-3 text-lg font-medium">Address</h2>
        <AddressFields initial={{ purok: p.purok, province: p.province, city: p.city, barangay: p.barangay, zipCode: p.zipCode }} />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Text label="Contact number" name="contactNumber" value={p.contactNumber} type="tel" />
          <Text label="Birth date" name="birthDate" value={p.birthDate} type="date" />
          <Text label="Primary email" name="personalEmail" value={p.personalEmail || p.email} type="email" />
        </div>
        <div className="mt-3 sm:w-2/3">
          <Text label="Facebook link" name="facebookUrl" value={p.facebookUrl} type="url" />
        </div>

        <h2 className="mt-6 mb-3 text-lg font-medium">Contact person information</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Text label="First name" name="contactFirstName" value={p.contactFirstName} />
          <Text label="Last name" name="contactLastName" value={p.contactLastName} />
          <Text label="Middle name" name="contactMiddleName" value={p.contactMiddleName} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr]">
          <Text label="Contact number" name="contactPhone" value={p.contactPhone} type="tel" />
          <Text label="Address" name="contactAddress" value={p.contactAddress} />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          {state && "error" in state && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
          {state && "saved" in state && <p className="text-sm text-success">Saved.</p>}
          <Button type="submit" disabled={pending} className="min-w-40">
            {pending ? "Saving…" : "Update"}
          </Button>
        </div>
      </section>
    </form>
  );
}
