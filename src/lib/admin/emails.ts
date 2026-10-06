// Outcome emails are drafted from fixed templates and then edited and sent by a person.
// They never mention the AI score, the criteria results or the recruiter's internal note.

export type OutcomeKind = "selected" | "not_selected";

export interface OutcomeEmailInput {
  kind: OutcomeKind;
  candidateName: string | null;
  jobTitle: string;
  company: string;
}

export interface OutcomeEmail {
  subject: string;
  body: string;
}

export function buildOutcomeEmail({ kind, candidateName, jobTitle, company }: OutcomeEmailInput): OutcomeEmail {
  const greeting = candidateName?.trim() ? `Dear ${candidateName.trim()},` : "Hello,";

  if (kind === "selected") {
    return {
      subject: `Your application for ${jobTitle} at ${company}`,
      body: [
        greeting,
        `Thank you for applying for the ${jobTitle} role at ${company}. We were impressed by your application and would like to take it forward.`,
        `We will contact you shortly with the next steps and to arrange a time to talk. If you have any questions or need adjustments to make the process work for you, just reply to this email.`,
        `Kind regards,\nThe ${company} hiring team`,
      ].join("\n\n"),
    };
  }

  return {
    subject: `Your application for ${jobTitle} at ${company}`,
    body: [
      greeting,
      `Thank you for taking the time to apply for the ${jobTitle} role at ${company}, and for sharing your experience with us.`,
      `After careful consideration we have decided not to take your application forward on this occasion. This was a close call between many applicants and is not a reflection of your potential.`,
      `Applications are organised with the help of AI-assisted screening, but the decision was made by a member of our hiring team. If you would like to ask about the decision or request a review, reply to this email and a person will respond.`,
      `We wish you every success in your search.`,
      `Kind regards,\nThe ${company} hiring team`,
    ].join("\n\n"),
  };
}
