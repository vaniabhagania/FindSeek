import { failedCheckLabels, noticeMessage } from "@/lib/notices";
import { Caution, Check } from "./icons";

/**
 * The red alert box. `error` comes from the page link, which anyone can write, so it is only ever a
 * lookup key into the fixed list in lib/notices. A code that isn't on the list shows nothing.
 * `checks` (failed verification checks) is filtered the same way.
 */
export function Notice({ error, checks }: { error?: string | string[]; checks?: string | string[] }) {
  const code = Array.isArray(error) ? error[0] : error;
  const message = noticeMessage(code);
  if (!message) return null;
  const failed = (code === "unpublishable" || code === "edit_unpublishable") ? failedCheckLabels(checks) : [];
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-blocker/30 bg-blocker/5 px-4 py-3 text-[15px] text-blocker">
      <Caution className="mt-1 shrink-0" />
      <span>
        {message}
        {failed.length > 0 && <> Still missing: {failed.join(", ")}.</>}
      </span>
    </div>
  );
}

export function Success({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-lg border border-good/30 bg-good/5 px-4 py-3 text-[15px]">
      <Check className="mt-1 shrink-0 text-good" />
      <span>{children}</span>
    </div>
  );
}
