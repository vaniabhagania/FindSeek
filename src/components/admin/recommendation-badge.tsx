import type { Recommendation } from "@/lib/admin/screening";

const LABEL: Record<Recommendation, { text: string; tone: string }> = {
  advance: { text: "AI suggests: advance", tone: "text-good border-good" },
  review: { text: "AI suggests: review", tone: "text-warn border-warn" },
  decline: { text: "AI suggests: decline", tone: "text-bad border-bad" },
};

/** The AI's recommendation. Always worded as a suggestion: a person decides. */
export function RecommendationBadge({ recommendation, score }: { recommendation: Recommendation; score?: number }) {
  const { text, tone } = LABEL[recommendation];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {text}
      {score !== undefined && <span className="font-normal">· {score}/100</span>}
    </span>
  );
}

const STATUS: Record<string, { text: string; tone: string }> = {
  submitted: { text: "New", tone: "text-muted border-border" },
  screened: { text: "Screened", tone: "text-muted border-border" },
  selected: { text: "Selected", tone: "text-good border-good" },
  not_selected: { text: "Not selected", tone: "text-muted border-border" },
  withdrawn: { text: "Withdrawn", tone: "text-muted border-border" },
};

export function StatusChip({ status }: { status: string }) {
  const { text, tone } = STATUS[status] ?? { text: status, tone: "text-muted border-border" };
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}>{text}</span>;
}
