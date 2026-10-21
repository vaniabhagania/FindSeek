/** The addresses allowed to review reports, from the OPERATOR_EMAILS setting: "a@x.com, b@y.com". */
export function parseOperators(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

/** Exact match, ignoring case. A part of an address, or a similar one, never counts. */
export function isOperatorEmail(email: string | undefined | null, operators: string[]): boolean {
  if (!email) return false;
  return operators.includes(email.trim().toLowerCase());
}
