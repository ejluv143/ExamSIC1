// Browser side of attaching a document to a post: checks the file's type (from its name: browsers often give an
// Office file no type) and size, sends it straight to S3 with the presigned POST the API issued, and confirms it.
import { cleanFileName, fileMimeOf, maxFileBytes } from "@examinus/domain/asset";
import { confirmImageUpload, requestImageUpload } from "@/features/assets/actions";

export type UploadedFile = { assetId: string; name: string };

// Throws an Error whose message is for people.
export async function uploadFile(file: File): Promise<UploadedFile> {
  const name = cleanFileName(file.name);
  const mime = fileMimeOf(name);
  if (!mime) throw new Error("Attach a PDF, Word, Excel or PowerPoint file.");
  if (file.size < 1) throw new Error("That file is empty.");
  if (file.size > maxFileBytes) throw new Error("Files can be up to 10 MB.");
  const target = await requestImageUpload("post", mime, file.size, name);
  if ("error" in target) throw new Error(target.error);
  const form = new FormData();
  for (const [field, value] of Object.entries(target.ok.fields)) form.append(field, value);
  // S3 wants the file as the last field, with the type the upload was signed for.
  form.append("file", new Blob([file], { type: mime }), name);
  const response = await fetch(target.ok.url, { method: "POST", body: form });
  if (!response.ok) throw new Error(response.status === 400 ? "That file is too big." : "The file couldn't be uploaded.");
  const confirmed = await confirmImageUpload(target.ok.assetId);
  if ("error" in confirmed) throw new Error(confirmed.error);
  return { assetId: target.ok.assetId, name };
}
