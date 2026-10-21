import type { FitCheck } from "@/lib/jobs/fit";
import type { Check as VerifyCheck } from "@/lib/jobs/verify";
import { Caution, Check, Cross, Pulse } from "./icons";

/** One row of verdicts: personal fit first (what the user cares about), then freshness. */
export function FitLedger({ checks, live }: { checks: FitCheck[]; live?: string | null }) {
  if (!checks.length && !live) return null;
  const order = { blocker: 0, caution: 1, good: 2 } as const;
  const sorted = [...checks].sort((a, b) => order[a.level] - order[b.level]);
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="How this job fits you">
      {sorted.map((c) => (
        <li key={c.key + c.text} className={`tick tick-${c.level}`}>
          {c.level === "good" ? <Check title="Fits" /> : c.level === "caution" ? <Caution title="Check" /> : <Cross title="Doesn't fit" />}
          {c.text}
        </li>
      ))}
      {live && <li className="tick text-muted"><Pulse /> {live}</li>}
    </ul>
  );
}

/** The verification record for one listing: every check, with what it found. */
export function VerificationList({ checks }: { checks: VerifyCheck[] }) {
  return (
    <ul className="divide-y divide-line">
      {checks.map((c) => (
        <li key={c.key} className="flex items-start gap-3 py-2.5">
          <span className={`mt-0.5 ${c.ok ? "text-good" : "text-blocker"}`}>{c.ok ? <Check title="Passed" /> : <Cross title="Failed" />}</span>
          <div className="min-w-0">
            <div className="text-[15px] font-medium">{c.label}</div>
            <div className="text-sm text-muted break-words">{c.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
