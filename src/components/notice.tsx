import { Caution, Check } from "./icons";

const MESSAGES: Record<string, string> = {
  consent: "Turn on AI processing first. Nothing is sent to the AI without it.",
  noverified: "Confirm at least one experience on your profile. FindSeek only uses facts you have confirmed.",
  nofile: "Choose a CV file to upload.",
  toolarge: "That file is over 4 MB.",
  type: "Upload a PDF or a plain-text CV.",
  ack: "This CV has warnings. Review them and tick the box to confirm before approving.",
  approve: "Approve the tailored CV before marking this job as applied.",
  cap: "You've reached your monthly application limit. You can raise it on your profile.",
  confirm: "Type DELETE to confirm account deletion.",
  setup: "The app isn't fully connected yet, so this can't be saved.",
  email: "Enter your email address.",
  link: "That sign-in link is invalid or has expired. Request a new one.",
  closed: "This job has closed at the source, so it's been taken out of your feed. Nothing was spent on it.",
  held: "This listing hasn't passed verification, so FindSeek won't tailor a CV for it. The checks below show what's missing.",
  post: "Paste the whole post, including the role, company, requirements and pay (at least a few lines).",
  notjob: "That doesn't read like a job or internship post. Paste the post itself, not a link or a comment.",
  save: "Couldn't save that job. Try again in a moment.",
  intake: "Write a sentence or two about what you're looking for, then continue.",
};

export function Notice({ error }: { error?: string | string[] }) {
  const key = Array.isArray(error) ? error[0] : error;
  if (!key) return null;
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-blocker/30 bg-blocker/5 px-4 py-3 text-[15px] text-blocker">
      <Caution className="mt-1 shrink-0" />
      <span>{MESSAGES[key] ?? decodeURIComponent(key)}</span>
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
