import { missingSetup } from "@/lib/env";

/**
 * Which environment variables are still missing. In production that list is for the people running the
 * site (the operator area), not for visitors to the public pages, so it is shown only when `operator`
 * is set. Everywhere else, while building, it stays visible.
 */
export function SetupNotice({ operator = false }: { operator?: boolean }) {
  if (process.env.NODE_ENV === "production" && !operator) return null;
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
