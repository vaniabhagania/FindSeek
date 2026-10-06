import { env } from "@/lib/env";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("RESEND_API_KEY and EMAIL_FROM are not set");
  }
}

/** Sends one plain-text email through Resend. Throws on any non-2xx so the caller can record the failure. */
export async function sendEmail(email: OutgoingEmail): Promise<{ id: string | null }> {
  if (!env.resendApiKey || !env.emailFrom) throw new EmailNotConfiguredError();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Email provider returned ${response.status}: ${detail}`);
  }
  const json = (await response.json().catch(() => ({}))) as { id?: string };
  return { id: json.id ?? null };
}
