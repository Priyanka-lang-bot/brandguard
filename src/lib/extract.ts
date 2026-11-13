import "server-only";

const MAX_BYTES = 4 * 1024 * 1024;

/** Pull plain text out of an uploaded .txt / .md / .docx / .pdf file. */
export async function extractText(file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error("File is larger than 4 MB");
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return tidy(value);
  }
  if (name.endsWith(".pdf")) {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await pdfText(pdf, { mergePages: true });
    return tidy(Array.isArray(text) ? text.join("\n\n") : text);
  }
  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    return tidy(buf.toString("utf8"));
  }
  throw new Error("Unsupported file type. Use .txt, .md, .docx or .pdf");
}

function tidy(s: string) {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
