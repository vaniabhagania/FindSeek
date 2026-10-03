const MESSAGES: Record<string, string> = {
  consent: "Please tick the AI-processing consent on your profile first. Nothing is sent to the AI without it.",
  noverified: "Confirm at least one experience on your profile. FindSeek only uses facts you have confirmed.",
  nofile: "Choose a CV file to upload.",
  toolarge: "That file is over 4 MB.",
  type: "Upload a PDF or a plain-text CV.",
  ack: "This CV has warnings. Review them and tick the box to confirm before approving.",
  approve: "Approve the tailored CV before marking this job as applied.",
  cap: "You've reached your monthly application limit. You can raise it on your profile.",
  confirm: "Type DELETE to confirm account deletion.",
  setup: "The app isn't connected to Supabase yet.",
  email: "Enter your email address.",
  link: "That sign-in link is invalid or has expired. Request a new one.",
};

export function Notice({ error }: { error?: string | string[] }) {
  const key = Array.isArray(error) ? error[0] : error;
  if (!key) return null;
  return (
    <div className="mb-4 rounded-lg border border-bad/40 bg-bad/5 px-4 py-3 text-sm text-bad">
      {MESSAGES[key] ?? decodeURIComponent(key)}
    </div>
  );
}
