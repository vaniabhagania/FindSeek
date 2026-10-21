/** Match score as a number with a thin meter, so it reads at a glance without a traffic-light badge. */
export function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 75 ? "var(--good)" : score >= 50 ? "var(--caution)" : "var(--blocker)";
  return (
    <div className="flex w-14 shrink-0 flex-col items-end" aria-label={`Match score ${score} out of 100`}>
      <span className="figure text-[28px] leading-none font-semibold">{score}</span>
      <span className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-line" aria-hidden>
        <span className="block h-full rounded-full" style={{ width: `${score}%`, background: tone }} />
      </span>
      <span className="mt-1 text-xs text-muted">match</span>
    </div>
  );
}
