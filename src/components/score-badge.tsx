export function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 75 ? "text-good border-good" : score >= 50 ? "text-warn border-warn" : "text-bad border-bad";
  return (
    <span className={`inline-flex min-w-12 justify-center rounded-full border px-2 py-0.5 text-sm font-semibold ${tone}`}>
      {score}%
    </span>
  );
}
