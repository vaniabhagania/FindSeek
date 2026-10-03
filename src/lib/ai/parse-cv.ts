import { structuredCall } from "./client";
import { ParsedCvSchema, type ParsedCv } from "./schemas";

const SYSTEM = `You extract facts from a candidate's CV into structured data.
Rules:
- Copy facts exactly as written. Never infer, embellish, or add anything not in the document.
- Dates: use YYYY-MM when month is given, YYYY-01 when only a year is given, null when absent.
- Keep each bullet as written (you may fix obvious typos only).
- Skills: list skills the CV explicitly names. Do not derive skills from job titles.`;

/** Parse an uploaded CV (PDF bytes or plain text) into facts the user then confirms. */
export async function parseCv(input: { pdfBase64: string } | { text: string }): Promise<ParsedCv> {
  const document =
    "pdfBase64" in input
      ? {
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf" as const, data: input.pdfBase64 },
        }
      : { type: "text" as const, text: `<cv>\n${input.text}\n</cv>` };

  return structuredCall({
    schema: ParsedCvSchema,
    system: SYSTEM,
    effort: "low",
    content: [document, { type: "text", text: "Extract this CV." }],
  });
}
