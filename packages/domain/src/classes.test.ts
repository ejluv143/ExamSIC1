import { describe, expect, test } from "bun:test";
import { cleanFileName, fileLooksLike, fileMimeOf, fileTypes } from "./asset.ts";
import { cleanAttachment } from "./classes.ts";

const id = "asset-0b6f3c1e-2d4a-4f8b-9c7d-1e2f3a4b5c6d";

describe("cleanAttachment", () => {
  test("a link must be an http(s) address; a YouTube or Drive one must be on that site", () => {
    expect(cleanAttachment("link", "https://example.com/a")?.title).toBe("example.com");
    expect(cleanAttachment("link", "javascript:alert(1)")).toBeNull();
    expect(cleanAttachment("link", "https://user:pw@example.com")).toBeNull();
    expect(cleanAttachment("youtube", "https://youtu.be/abc")).not.toBeNull();
    expect(cleanAttachment("youtube", "https://evil.example/youtube.com")).toBeNull();
    expect(cleanAttachment("drive", "https://docs.google.com/document/d/1")).not.toBeNull();
    expect(cleanAttachment("drive", "https://example.com/drive.google.com")).toBeNull();
  });

  test("a file attachment needs an asset reference and an Office or PDF file name", () => {
    expect(cleanAttachment("file", `asset:${id}`, "Syllabus.docx")).toEqual({ kind: "file", url: `asset:${id}`, title: "Syllabus.docx" });
    expect(cleanAttachment("file", "https://example.com/x.docx", "x.docx")).toBeNull();
    expect(cleanAttachment("file", "asset:nope", "x.docx")).toBeNull();
    expect(cleanAttachment("file", `asset:${id}`, "run.exe")).toBeNull();
    expect(cleanAttachment("file", `asset:${id}`, "")).toBeNull();
  });
});

describe("post files", () => {
  test("the type comes from the extension, in any case; macro-enabled and web formats are refused", () => {
    expect(fileMimeOf("Report.PDF")).toBe(fileTypes.pdf);
    expect(fileMimeOf("a.b.pptx")).toBe(fileTypes.pptx);
    for (const name of ["a.docm", "a.xlsm", "a.html", "a.svg", "a.exe", "noextension"]) expect(fileMimeOf(name)).toBeNull();
  });

  test("a file name loses folders, control characters and quotes", () => {
    expect(cleanFileName("C:\\Users\\me\\Plan.docx")).toBe("Plan.docx");
    expect(cleanFileName('a"b\r\nc.pdf')).toBe("abc.pdf");
  });

  test("the first bytes must match the type: %PDF-, a ZIP package or an OLE file", () => {
    expect(fileLooksLike(fileTypes.pdf, new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(fileLooksLike(fileTypes.pdf, new TextEncoder().encode("<html>"))).toBe(false);
    expect(fileLooksLike(fileTypes.docx, new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(fileLooksLike(fileTypes.docx, new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe(false);
    expect(fileLooksLike(fileTypes.doc, new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe(true);
    expect(fileLooksLike(fileTypes.xls, new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(false);
  });
});
