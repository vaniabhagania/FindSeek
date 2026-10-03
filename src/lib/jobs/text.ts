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
