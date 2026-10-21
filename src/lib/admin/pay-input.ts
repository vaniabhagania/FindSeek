// The pay boxes on the opening form, in the units employers think in (LPA for jobs, rupees per
// month for stipends), and the annual rupee figures the database stores.

export type PayUnit = "lpa" | "month";

export interface PayFields {
  min: number;
  max: number;
  period: "year" | "month";
}

const positive = (raw: string): number | null => {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** The form's pay boxes as annual rupees. null when "from" is missing or not a positive number. */
export function payFromForm(fromRaw: string, toRaw: string, unit: string): { ok: true; pay: PayFields } | { ok: false; reason: "missing" | "range" } {
  const monthly = unit === "month";
  const toAnnual = (n: number) => Math.round(monthly ? n * 12 : n * 100_000);
  const from = positive(fromRaw);
  if (from == null) return { ok: false, reason: "missing" };
  const to = positive(toRaw);
  const min = toAnnual(from);
  const max = to == null ? min : toAnnual(to);
  if (max < min) return { ok: false, reason: "range" };
  return { ok: true, pay: { min, max, period: monthly ? "month" : "year" } };
}

const trim = (n: number) => String(Number(n.toFixed(2)));

/** A stored opening's pay as the form shows it. Empty boxes for an opening that never had pay. */
export function payForForm(post: { pay_min_inr?: number | string | null; pay_max_inr?: number | string | null; pay_period?: string | null }): { from: string; to: string; unit: PayUnit } {
  const unit: PayUnit = post.pay_period === "month" ? "month" : "lpa";
  const divisor = unit === "month" ? 12 : 100_000;
  const show = (v: number | string | null | undefined) => (v == null || v === "" || Number(v) <= 0 ? "" : trim(Number(v) / divisor));
  const from = show(post.pay_min_inr);
  const to = show(post.pay_max_inr);
  return { from, to: to === from ? "" : to, unit };
}
