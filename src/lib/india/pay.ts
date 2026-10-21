// Reads pay from Indian job ads ("₹12-18 LPA", "CTC 8 lakhs", "Stipend ₹15,000/month",
// "INR 6,00,000 - 9,00,000 p.a.") and normalises it to annual INR, so a ₹25k/month
// internship and a 6 LPA job can be compared against what the user expects.

export interface Pay {
  minAnnualInr: number;
  maxAnnualInr: number;
  period: "year" | "month";
  /** The exact words in the ad, so users can see what the number came from. */
  source: string;
  unpaid?: boolean;
}

const CUR = String.raw`(?:₹|rs\.?|inr)`;
const NUM = String.raw`(\d+(?:[.,]\d+)*)`;
const DASH = String.raw`\s*(?:-|–|—|to)\s*`;

const num = (s: string) => Number(s.replace(/,/g, ""));

const LAKH_RE = new RegExp(
  `${CUR}?\\s*${NUM}(?:${DASH}${CUR}?\\s*${NUM})?\\s*(lpa|lakhs?|lacs?|l(?![a-z])|crores?|cr(?![a-z]))(\\s*(?:per annum|p\\.?a\\.?|/\\s*annum|a year|per year))?`,
  "i",
);
const AMOUNT_RE = new RegExp(
  `${CUR}\\s*${NUM}\\s*(k)?(?:${DASH}${CUR}?\\s*${NUM}\\s*(k)?)?\\s*(?:/|per|a|p\\.?)?\\s*(month|mo\\b|pm\\b|p\\.m\\.|annum|year|yr|p\\.?a\\.?)?`,
  "i",
);
const STIPEND_RE = /stipend[^.\n₹\d]{0,25}(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*)\s*(k)?(?:\s*(?:-|–|to)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*)\s*(k)?)?/i;
const UNPAID_RE = /\b(unpaid( internship)?|no stipend|without stipend)\b/i;

export function parsePay(text: string): Pay | null {
  if (UNPAID_RE.test(text)) {
    return { minAnnualInr: 0, maxAnnualInr: 0, period: "month", source: text.match(UNPAID_RE)![0], unpaid: true };
  }

  const lakh = text.match(LAKH_RE);
  if (lakh) {
    const unit = lakh[3].toLowerCase().startsWith("c") ? 1e7 : 1e5;
    const lo = num(lakh[1]) * unit;
    const hi = (lakh[2] ? num(lakh[2]) : num(lakh[1])) * unit;
    // "1 L" is a plausible salary; "500 L" is not. Guard against matching unrelated numbers.
    if (lo > 0 && hi >= lo && hi <= 5e8) return { minAnnualInr: lo, maxAnnualInr: hi, period: "year", source: lakh[0].trim() };
  }

  const stipend = text.match(STIPEND_RE);
  if (stipend) {
    const lo = num(stipend[1]) * (stipend[2] ? 1000 : 1);
    const hi = (stipend[3] ? num(stipend[3]) * (stipend[4] ? 1000 : 1) : lo);
    if (lo >= 500 && hi >= lo) return { minAnnualInr: lo * 12, maxAnnualInr: hi * 12, period: "month", source: stipend[0].trim() };
  }

  const amount = text.match(AMOUNT_RE);
  if (amount) {
    const lo = num(amount[1]) * (amount[2] ? 1000 : 1);
    const hi = amount[3] ? num(amount[3]) * (amount[4] ? 1000 : 1) : lo;
    if (lo >= 500 && hi >= lo) {
      const p = (amount[5] ?? "").toLowerCase();
      const monthly = /^(month|mo|pm|p\.m\.)/.test(p) || (!p && hi < 2e5);
      const factor = monthly ? 12 : 1;
      return { minAnnualInr: lo * factor, maxAnnualInr: hi * factor, period: monthly ? "month" : "year", source: amount[0].trim() };
    }
  }
  return null;
}

/** Pay from structured source fields (Adzuna, Lever) when the currency is INR. */
export function payFromFields(min: number | null, max: number | null, currency: string | null): Pay | null {
  if (currency?.toUpperCase() !== "INR" || (!min && !max)) return null;
  const lo = Number(min ?? max);
  const hi = Number(max ?? min);
  return { minAnnualInr: lo, maxAnnualInr: hi, period: "year", source: "Salary field on the listing" };
}

const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

/** ₹12 LPA, ₹1.2 Cr, ₹25k/month — how Indian candidates actually talk about pay. */
export function formatInr(annual: number, period: "year" | "month" = "year"): string {
  if (period === "month") {
    const m = annual / 12;
    return m >= 1000 ? `₹${trim(Math.round(m / 100) / 10)}k/month` : `₹${Math.round(m)}/month`;
  }
  if (annual >= 1e7) return `₹${trim(Math.round(annual / 1e6) / 10)} Cr`;
  if (annual >= 1e5) return `₹${trim(Math.round(annual / 1e4) / 10)} LPA`;
  return `₹${annual.toLocaleString("en-IN")}/year`;
}

export function formatPayRange(pay: Pick<Pay, "minAnnualInr" | "maxAnnualInr" | "period" | "unpaid">): string {
  if (pay.unpaid) return "Unpaid";
  if (pay.minAnnualInr === pay.maxAnnualInr) return formatInr(pay.minAnnualInr, pay.period);
  const lo = formatInr(pay.minAnnualInr, pay.period);
  const hi = formatInr(pay.maxAnnualInr, pay.period);
  // "₹12 LPA – ₹18 LPA" reads worse than "₹12–18 LPA"
  const unit = hi.replace(/^₹[\d.]+/, "");
  return lo.endsWith(unit) ? `${lo.slice(0, -unit.length)}–${hi.slice(1)}` : `${lo} – ${hi}`;
}
