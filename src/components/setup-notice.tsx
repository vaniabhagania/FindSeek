import { missingSetup } from "@/lib/env";

export function SetupNotice() {
  const missing = missingSetup();
  if (!missing.length) return null;
  return (
    <div className="no-print border-b border-border bg-surface px-4 py-3 text-sm">
      <div className="mx-auto max-w-5xl">
        <strong className="text-warn">Setup needed.</strong>{" "}
        <span className="text-muted">Add these environment variables (see .env.example): {missing.join(" · ")}</span>
      </div>
    </div>
  );
}
