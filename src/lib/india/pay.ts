// Reads pay from Indian job ads ("₹12-18 LPA", "CTC 8 lakhs", "Stipend ₹15,000/month",
// "Salary: 25000-30000 per month") and normalises it to annual INR, so a ₹25k/month internship
// and a 6 LPA job can be compared against what the user expects.
//
// An amount only counts as pay when the words around it say so. A rupee figure next to "insurance",
// "bond", "registration fee" or "raised" is not a salary, and a bare number only counts straight
// after a pay word ("Salary: 25000-30000"). Every step looks at a short window around one number,
// so the time taken grows in a straight line with the text, never with its square.

import { MAX_PARSE_CHARS } from "@/lib/limits";

export interface Pay {
  minAnnualInr: number;
  maxAnnualInr: number;
  period: "year" | "month";
  /** The exact words in the ad, so users can see what the number came from. */
  source: string;
  unpaid?: boolean;
}

const CUR = String.raw`(?:₹|rs\.?|inr)`;

/** One number: Indian grouping (4,50,000), plain digits, or decimals. Never starts inside another number. */
const NUMBER = new RegExp(String.raw`(?<![\w.,])(?:(${CUR})\s{0,2})?(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)`, "gi");

// What follows a number, each matched at one fixed position, over a short slice.
const UNIT = /^\s{0,2}(lpa|lakhs?|lacs?|crores?|cr(?![a-z])|k(?![a-z])|l(?![a-z]))/i;
const RANGE = new RegExp(String.raw`^\s{0,3}(?:-|–|—|to)\s{0,3}(?:(${CUR})\s{0,2})?(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)`, "i");
const PERIOD = /^\s{0,2}(?:(?:\/|per\s|a\s|p\.?\s?)\s{0,2})?(month(?:ly)?|mo(?![a-z])|pm(?![a-z])|p\.m\.|annum|year(?:ly)?|yr(?![a-z])|p\.a\.?|pa(?![a-z]))/i;

const UNPAID = /\b(?:unpaid(?!\s+(?:leave|notice|holiday|time off|vacation|overtime|break))(?:\s+internship)?|no stipend|without (?:a )?stipend)\b/i;

/** Words that say the number after them is what the employer pays. */
const PAY_WORD = /\b(?:salary|salaries|ctc|stipend|package|compensation|remuneration|wages?|honorarium|earnings?|earn|in[- ]hand|take[- ]home|pay\s*(?:range|scale|band|structure)|pay(?=\s*[:\-–]))\b/gi;
/** What may sit between a pay word and its number: "Salary: 25000", "CTC of up to", "Stipend from". */
const DIRECT = /^[\s:\-–—=(]*(?:(?:is|of|up\s*to|upto|around|approx\.?|about|from|starting(?:\s+(?:at|from))?|range|between|at)[\s:\-–—=(]*)*$/i;

/** Words that make a nearby amount something other than pay: cover, fees, funding, perks. */
const NOT_PAY_WORD = String.raw`insurance|insured|cover(?:age)?|mediclaim|bond|fees?|charges?|deposit|funding|funded|raised|series\s+[a-e]|valuation|revenue|turnover|investment|investors?|penalt(?:y|ies)|fine|loan|advance|refundable|registration|premium|bonus|incentives?|allowances?|reimburse\w*|relocation|gratuity|esops?|stocks?|equity|commission|referral|subscription|membership|tuition|kit|laptop|uniform|processing|enrol\w*|course|security\s+(?:amount|money)`;
const NOT_PAY_BEFORE = new RegExp(String.raw`\b(?:${NOT_PAY_WORD})\b`, "i");
/**
 * Right after the amount, when the amount describes that thing: "₹5 lakh health insurance",
 * "₹999 registration fee", "5L term life cover". "plus ESOPs" or "and a bonus" after a real salary
 * adds something else and does not disqualify it.
 */
const NOT_PAY_AFTER = new RegExp(
  String.raw`^[\s,:\-]{0,3}(?:(?!(?:plus|and|with|including|excluding|or)\b)[a-z]+\s+){0,2}(?:insurance|insured|cover(?:age)?|mediclaim|bonds?|fees?|charges?|deposit|funding|funded|valuation|revenue|turnover|penalt(?:y|ies)|fine|loan|premium|registration|refundable|security|round|investment)\b`,
  "i",
);

const FOREIGN_BEFORE = /(?:[$€£¥]|\b(?:usd|eur|gbp|aud|cad|sgd|aed)|\b[usac]\$)\s{0,2}$/i;
const FOREIGN_AFTER = /^\s{0,2}(?:usd|eur|gbp|aud|cad|sgd|aed|dollars?|euros?|pounds?)\b/i;

/** Text before `index`, back to the start of its sentence or line, at most 70 characters. */
function clauseBefore(text: string, index: number): string {
  const from = text.slice(Math.max(0, index - 70), index);
  const cut = Math.max(from.lastIndexOf("\n"), from.lastIndexOf(";"), from.lastIndexOf("|"), from.lastIndexOf("•"), from.lastIndexOf(". "));
  return cut >= 0 ? from.slice(cut + 1) : from;
}

function clauseAfter(text: string, index: number): string {
  const to = text.slice(index, index + 50);
  const cut = to.search(/[\n;|•]|\.\s/);
  return cut >= 0 ? to.slice(0, cut) : to;
}

const scale = (unit: string | undefined) => {
  const u = (unit ?? "").toLowerCase();
  if (!u) return { factor: 1, annual: false };
  if (u === "k") return { factor: 1e3, annual: false };
  if (u.startsWith("cr")) return { factor: 1e7, annual: true };
  return { factor: 1e5, annual: true }; // lpa, lakh, lac, l
};

const num = (s: string) => Number(s.replace(/,/g, ""));

export function parsePay(input: string): Pay | null {
  const text = input.length > MAX_PARSE_CHARS ? input.slice(0, MAX_PARSE_CHARS) : input;

  const unpaid = text.match(UNPAID);
  if (unpaid) return { minAnnualInr: 0, maxAnnualInr: 0, period: "month", source: unpaid[0], unpaid: true };

  let looked = 0;
  for (const m of text.matchAll(NUMBER)) {
    if (++looked > 600) break; // a real ad has a few dozen numbers
    const start = m.index;
    const hasCurrency = Boolean(m[1]);
    if (FOREIGN_BEFORE.test(text.slice(Math.max(0, start - 6), start))) continue;

    // One number, or a range like "10-15", with the unit written after either of them ("12-18 LPA").
    const first = num(m[2]);
    let end = start + m[0].length;
    const unitA = text.slice(end, end + 12).match(UNIT);
    if (unitA) end += unitA[0].length;

    let lo = first * scale(unitA?.[1]).factor;
    let hi = lo;
    let unitName = unitA?.[1];
    const range = text.slice(end, end + 30).match(RANGE);
    if (range) {
      const afterRange = end + range[0].length;
      const unitB = text.slice(afterRange, afterRange + 12).match(UNIT);
      const loValue = first * scale(unitA?.[1] ?? unitB?.[1]).factor;
      const hiValue = num(range[2]) * scale(unitB?.[1] ?? unitA?.[1]).factor;
      if (hiValue >= loValue) {
        lo = loValue;
        hi = hiValue;
        unitName = unitB?.[1] ?? unitA?.[1];
        end = afterRange + (unitB?.[0].length ?? 0);
      }
      // otherwise "₹15,000 - 20 hours a week": the second number isn't part of the pay
    }
    const unit = scale(unitName);

    const periodMatch = text.slice(end, end + 20).match(PERIOD);
    if (periodMatch) end += periodMatch[0].length;
    const period = (periodMatch?.[1] ?? "").toLowerCase();
    const named = /^(month|mo|pm|p\.m\.)/.test(period) ? "month" : period ? "year" : "";

    if (FOREIGN_AFTER.test(text.slice(end, end + 12))) continue;

    // Do the words around the number say it is pay?
    const before = clauseBefore(text, start);
    const lastWord = [...before.matchAll(PAY_WORD)].at(-1);
    const sincePayWord = (lastWord ? before.slice(lastWord.index + lastWord[0].length) : before).replace(/\([^)]*\)/g, " ");
    if (NOT_PAY_BEFORE.test(sincePayWord)) continue;
    if (NOT_PAY_AFTER.test(clauseAfter(text, end))) continue;

    const direct = Boolean(lastWord) && DIRECT.test(sincePayWord);
    const strongUnit = (unitName ?? "").toLowerCase() === "lpa";
    const evidence =
      direct ||
      strongUnit ||
      (Boolean(lastWord) && (hasCurrency || Boolean(periodMatch) || unit.annual)) ||
      (hasCurrency && Boolean(periodMatch));
    if (!evidence) continue;

    // A bare 2025 after "Salary review in" is a year, not a salary.
    if (!hasCurrency && !unitName && !periodMatch && lo >= 1900 && lo <= 2100) continue;
    // ₹500 a month is the floor; ₹50 crore a year the ceiling.
    if (unit.annual ? lo <= 0 : lo < 500) continue;

    const monthly = named === "month" || (!named && !unit.annual && hi < 2e5);
    const factor = monthly ? 12 : 1;
    if (hi * factor > 5e8) continue;

    return {
      minAnnualInr: lo * factor,
      maxAnnualInr: hi * factor,
      period: monthly ? "month" : "year",
      source: text.slice(start, end).trim(),
    };
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
