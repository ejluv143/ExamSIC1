// Images: how a question refers to an uploaded file (`asset:<id>` in markdown) and what may be uploaded.
import { Schema } from "effect";
import { kindOf } from "./kinds/index.ts";
import type { Question, StudentQuestion } from "./question.ts";

// `question`: a teacher's image in a prompt, choice, background or paper header logo. `answer`: a student's drawing
// or photo.
// `post`: a file a teacher attaches to a class announcement (a PDF or a Word, Excel or PowerPoint file).
export const assetPurposes = ["question", "answer", "post"] as const;
export const AssetPurpose = Schema.Literals(assetPurposes);
export type AssetPurpose = typeof AssetPurpose.Type;

export const assetMimes = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const AssetMime = Schema.Literals(assetMimes);
export type AssetMime = typeof AssetMime.Type;

export const maxAssetBytes = 5 * 1024 * 1024;

// The documents a teacher may attach to a post, by file extension. Macro-enabled formats (.docm, .xlsm, .pptm) and
// anything that runs or renders in a browser (html, svg) are left out on purpose.
export const fileTypes = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;
export const fileMimes = [
  fileTypes.pdf,
  fileTypes.doc,
  fileTypes.docx,
  fileTypes.xls,
  fileTypes.xlsx,
  fileTypes.ppt,
  fileTypes.pptx,
] as const;
export const FileMime = Schema.Literals(fileMimes);
export type FileMime = typeof FileMime.Type;
export const maxFileBytes = 10 * 1024 * 1024;
// What `accept` on a file input takes.
export const fileAccept = Object.keys(fileTypes).map((e) => `.${e}`).join(",");

// The type of a file from its name's extension, or null when it isn't one of `fileTypes`. Browsers often give an
// Office file no type at all, so the extension is what decides.
export function fileMimeOf(name: string): FileMime | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return ext && ext in fileTypes ? fileTypes[ext as keyof typeof fileTypes] : null;
}

// A file name made safe to store and send in a header: no folders, no control characters, at most 150 characters.
export const cleanFileName = (name: string): string =>
  // eslint-disable-next-line no-control-regex
  name.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(-150);

// Whether the bytes begin like the file type they claim: PDF, a ZIP package (the OOXML formats) or an OLE
// compound file (the older Office formats).
export function fileLooksLike(mime: FileMime, bytes: Uint8Array): boolean {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (mime === fileTypes.pdf) return starts(0x25, 0x50, 0x44, 0x46, 0x2d);
  if (mime === fileTypes.doc || mime === fileTypes.xls || mime === fileTypes.ppt) return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  return starts(0x50, 0x4b, 0x03, 0x04);
}

// The markdown reference to an uploaded image: `![alt](asset:<id>)`.
export const assetUrlPrefix = "asset:";
export const assetMarkdown = (id: string, alt: string) => `![${alt.replace(/[[\]]/g, "")}](${assetUrlPrefix}${id})`;

// An uploaded image in a field of its own (a paper header logo): `asset:<id>`.
export const assetRef = (id: string) => `${assetUrlPrefix}${id}`;

// The asset id an `asset:<id>` field names, or null for anything else (a URL, an older data: URL).
export const assetIdOfRef = (value: string): string | null =>
  value.startsWith(assetUrlPrefix) ? value.slice(assetUrlPrefix.length) : null;

const imagePattern = /!\[([^\]]*)\]\(asset:([^)\s]+)\)/g;

// The images a markdown text embeds, with their alt text.
export function markdownImages(markdown: string): { id: string; alt: string }[] {
  return [...markdown.matchAll(imagePattern)].map((m) => ({ id: m[2]!, alt: m[1]! }));
}

// Every asset id found in some text or JSON (markdown prompts, question bodies, drawing answers).
export const assetIdsIn = (text: string): string[] =>
  text.match(/asset-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];


// The images a question refers to: in its prompt, and (by type) in its choices, items and background.
export function questionImages(q: Question | StudentQuestion): { id: string; alt: string; where: string }[] {
  return [...markdownImages(q.prompt).map((m) => ({ ...m, where: "the prompt" })), ...(kindOf(q).images?.(q) ?? [])];
}

// Where an image has no alt text: what the editor must fix before saving. Empty when every image has some.
export const imagesWithoutAlt = (q: Question): string[] =>
  questionImages(q)
    .filter((i) => i.alt.trim() === "")
    .map((i) => i.where);

