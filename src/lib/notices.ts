// Every message the red alert box can show lives here, keyed by a short code.
//
// Pages receive the code in `?error=`. Anyone can write that link, so the box looks the code up in
// this list and shows nothing for a code that isn't on it. It never prints text taken from the link,
// which is what stopped a crafted link from putting a fake "pay ₹499 to keep your account" notice
// inside FindSeek's own alert box.

import { CRITERION_LABELS } from "@/lib/admin/criteria-guard";
import type { CheckKey } from "@/lib/jobs/verify";

const STATIC = {
  // Sign-in and setup
  setup: "The app isn't fully connected yet, so this can't be saved.",
  email: "Enter your email address.",
  link: "That sign-in link is invalid or has expired. Request a new one.",
  signin: "We couldn't send the sign-in link. Check the address and try again in a minute.",
  ratelimit: "Too many sign-in emails requested. Wait a few minutes and try again.",

  // Profile, CV and onboarding
  consent: "Turn on AI processing first. Nothing is sent to the AI without it.",
  noverified: "Confirm at least one experience on your profile. FindSeek only uses facts you have confirmed.",
  nofile: "Choose a CV file to upload.",
  toolarge: "That file is over 4 MB.",
  type: "Upload a PDF or a plain-text CV.",
  upload: "We couldn't store that file. Try again in a moment.",
  intake: "Write a sentence or two about what you're looking for, then continue.",
  intake_long: "That's longer than we can read in one go. Keep it to about 3,000 characters.",
  confirm: "Type DELETE to confirm account deletion.",

  // Jobs and applications
  ack: "This CV has warnings. Review them and tick the box to confirm before approving.",
  approve: "Approve the tailored CV before marking this job as applied.",
  cap: "You've reached your monthly application limit. You can raise it on your profile.",
  closed: "This job has closed at the source, so it's been taken out of your feed. Nothing was spent on it.",
  held: "This listing hasn't passed verification, so FindSeek won't tailor a CV for it. The checks below show what's missing.",
  post: "Paste the whole post, including the role, company, requirements and pay (at least a few lines).",
  post_long: "That post is too long (the limit is 20,000 characters). Paste only the job post itself.",
  notjob: "That doesn't read like a job or internship post. Paste the post itself, not a link or a comment.",
  save: "Couldn't save that job. Try again in a moment.",
  consent_both: "Tick both boxes to confirm you agree to share your CV and to AI-assisted screening.",
  post_closed: "This opening is closed and no longer accepting applications.",
  already_applied: "You've already applied to this opening.",
  apply_failed: "Couldn't submit your application. Please try again.",

  // Reports on listings
  report_limit: "You've sent a lot of reports today. Try again tomorrow.",
  report_failed: "Couldn't send that report. Try again in a moment.",
  report_hidden: "That listing isn't available to report.",

  // Reviewing reports
  ops_failed: "Couldn't record that decision. Try again in a moment.",

  // Daily limits on the paid AI actions
  limit_intake: "You've used today's limit for reading your own words. Fill in your preferences by hand, or try again tomorrow.",
  limit_cv: "You've used today's limit for reading CVs. Add your experience by hand, or try again tomorrow.",
  limit_match: "You've used today's limit for finding matches. New matches are also scored each day, so check back tomorrow.",
  limit_tailor: "You've used today's limit for tailored CVs. Pick the jobs that matter most and come back tomorrow.",
  limit_bring: "You've used today's limit for bringing in jobs. Try again tomorrow.",
  limit_error: "Daily usage limits aren't available right now, so this action is paused. Try again in a few minutes.",

  // Hiring side
  org_name: "Enter your organisation's name (2 to 120 characters).",
  employer_create: "Couldn't create the employer account. Please try again.",
  employer_setup: "Couldn't finish setting up the employer account. Please try again.",
  post_title: "Give the opening a title (2 to 160 characters).",
  post_description: "Describe the role in at least 40 characters, and no more than 20,000, so candidates can judge their fit.",
  post_pay: "State the pay. Every opening on FindSeek shows a salary or stipend.",
  post_pay_range: "The top of the pay range is below the bottom.",
  post_save: "Couldn't save the opening. Please try again.",
  service_key: "SUPABASE_SERVICE_ROLE_KEY isn't set, so openings can't be published yet.",
  unpublishable: "This opening can't be published yet.",
  edit_unpublishable: "That change wasn't saved. The opening is live, and with this change it would no longer pass the checks candidates rely on.",
  publish_failed: "Couldn't publish the opening. Please try again.",
  criterion_kind: "Choose what kind of criterion this is.",
  criterion_length: "A criterion needs 3 to 300 characters.",
  criterion_max: "An opening can have at most 30 criteria.",
  criterion_save: "Couldn't save the criterion. Please try again.",
  ai_unconfigured: "ANTHROPIC_API_KEY isn't set, so candidates can't be screened yet.",
  no_criteria: "Add at least one criterion before screening candidates.",
  decision_kind: "Choose selected or not selected.",
  withdrawn: "This candidate has withdrawn their application.",
  email_locked: "The outcome email has already been sent, so the decision can't be changed.",
  decision_save: "Couldn't record the decision. Please try again.",
  draft_subject: "The subject needs 1 to 200 characters.",
  draft_body: "The email body needs 20 to 5,000 characters.",
  draft_save: "Couldn't save the draft. Please try again.",
  no_decision: "Record a decision first.",
  email_sent: "This email has already been sent.",
  email_mismatch: "The draft doesn't match the decision. Record the decision again to regenerate it.",
  email_unconfigured: "RESEND_API_KEY and EMAIL_FROM aren't set, so emails can't be sent yet.",
  no_recipient: "Couldn't find an email address for this candidate.",
  email_rejected: "The email provider rejected the message. Check the sender settings and try again.",
} as const;

const CRITERIA = Object.fromEntries(
  CRITERION_LABELS.map((label, i) => [
    `criterion_${i}`,
    `This criterion appears to refer to ${label}, which can't be used to screen candidates. State the job-related requirement instead (for example a skill, a certification, a language level, or the right to work in a country).`,
  ]),
) as Record<`criterion_${number}`, string>;

export const NOTICES: Record<string, string> = { ...STATIC, ...CRITERIA };

export type NoticeCode = keyof typeof STATIC | `criterion_${number}`;

/** The message for a code, or null when the code isn't one of ours. */
export function noticeMessage(code: unknown): string | null {
  return typeof code === "string" && Object.hasOwn(NOTICES, code) ? NOTICES[code] : null;
}

const CHECK_LABELS: Record<CheckKey, string> = {
  source: "A real hiring source",
  description: "A full job description",
  qualifications: "Qualifications stated",
  pay: "Pay stated",
  safety: "No scam signals",
  india: "Open to candidates in India",
};

/** Names of the failed checks, taken only from the fixed list above. */
export function failedCheckLabels(keys: unknown): string[] {
  const list = (Array.isArray(keys) ? keys.join(",") : typeof keys === "string" ? keys : "").split(",");
  return list.filter((k): k is CheckKey => Object.hasOwn(CHECK_LABELS, k)).map((k) => CHECK_LABELS[k]);
}

const CHECK_HINTS: Partial<Record<CheckKey, string>> = {
  source:
    "An opening is trusted as your company's only when your account signs in with an email on your company's own domain, not Gmail, Yahoo or similar. If your domain differs from your company name, ask a FindSeek operator to vouch for it.",
};

/** What to do about a failed check, from the same fixed list: never text taken from the link. */
export function failedCheckHints(keys: unknown): string[] {
  const list = (Array.isArray(keys) ? keys.join(",") : typeof keys === "string" ? keys : "").split(",");
  return list.flatMap((k) => (Object.hasOwn(CHECK_HINTS, k) ? [CHECK_HINTS[k as CheckKey] as string] : []));
}

/** `/path?error=code`, optionally with extra fixed parameters. */
export function noticeUrl(path: string, code: NoticeCode, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ error: code, ...extra });
  return `${path}${path.includes("?") ? "&" : "?"}${q.toString()}`;
}
