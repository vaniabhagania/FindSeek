import { MAX_PARSE_CHARS } from "@/lib/limits";

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ",
};

/** Greenhouse returns HTML-escaped HTML; turn it into readable plain text. */
export function htmlToText(html: string): string {
  const decoded = html.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m);
  return decoded
    .replace(/<\s*(br|\/p|\/li|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function looksRemote(...fields: (string | null | undefined)[]): boolean | null {
  const text = fields.filter(Boolean).join(" ").toLowerCase();
  if (!text) return null;
  return /\bremote\b|work from home|anywhere/.test(text) ? true : null;
}

/** A real ad uses at least this many different words; filler is a few phrases said again and again. */
const MIN_DISTINCT_WORDS = 40;
/** More than this share of the ad being a word-for-word repeat of earlier text counts as padding. */
const MAX_REPEATED_SHARE = 0.3;
const SHINGLE = 4;

/**
 * Is this description padded out rather than written? An ad can clear a word count by saying the same
 * sentence thirty times, so length alone proves nothing. Returns why it reads as filler, or null.
 * One pass over at most MAX_PARSE_CHARS characters.
 */
export function fillerReason(input: string): string | null {
  const text = input.length > MAX_PARSE_CHARS ? input.slice(0, MAX_PARSE_CHARS) : input;
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

  if (words.length >= SHINGLE) {
    const seen = new Set<string>();
    let total = 0;
    for (let i = 0; i + SHINGLE <= words.length; i++) {
      seen.add(words.slice(i, i + SHINGLE).join(" "));
      total++;
    }
    if (1 - seen.size / total > MAX_REPEATED_SHARE) {
      return "Repeats the same text over and over instead of describing the role";
    }
  }

  const distinct = new Set(words).size;
  if (distinct < MIN_DISTINCT_WORDS) {
    return `Uses only ${distinct} different words; reads as filler, not a job description`;
  }
  return null;
}
