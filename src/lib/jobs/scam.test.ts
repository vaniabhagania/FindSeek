import { describe, expect, it } from "vitest";
import { MAX_PARSE_CHARS } from "@/lib/limits";
import { normaliseForScan, scamFlags } from "./scam";

const flags = (description: string, title = "Job") => scamFlags({ title, description });

describe("cleaning the text before the rules read it", () => {
  it("closes up letter-spacing", () => {
    expect(normaliseForScan("W h a t s A p p only")).toBe("whatsapp only");
    expect(normaliseForScan("w.h.a.t.s.a.p.p")).toBe("whatsapp");
    expect(normaliseForScan("T-e-l-e-g-r-a-m me")).toBe("telegram me");
  });

  it("leaves ordinary text alone", () => {
    expect(normaliseForScan("Plan A or B. B.Tech in CS, e.g. IIT.")).toBe("plan a or b. b.tech in cs, e.g. iit.");
    expect(normaliseForScan("Apply by 5 Nov")).toBe("apply by 5 nov");
  });

  it("removes invisible characters and look-alike letters", () => {
    expect(normaliseForScan("Regis​tration")).toBe("registration");
    expect(normaliseForScan("Registrаtion")).toBe("registration"); // Cyrillic а
    expect(normaliseForScan("ＷｈａｔｓＡｐｐ")).toBe("whatsapp"); // full-width
  });
});

describe("what gets flagged", () => {
  it.each([
    // fees and deposits
    ["Pay the registration fee of ₹499 to confirm.", "Asks for an upfront fee or deposit"],
    ["Registration amount of ₹499 is refundable.", "Asks for an upfront fee or deposit"],
    ["A refundable laptop deposit of ₹5,000 is collected on joining.", "Asks for an upfront fee or deposit"],
    ["Pay ₹499 for your ID card and kit", "Asks for an upfront fee or deposit"],
    ["Security deposit of Rs. 2000 is required.", "Asks for an upfront fee or deposit"],
    ["Joining amount ₹2,500 payable on day one.", "Asks for an upfront fee or deposit"],
    ["Initial investment of ₹10,000 is needed to start.", "Asks for an upfront fee or deposit"],
    ["पंजीकरण शुल्क ₹500 जमा करें", "Asks for an upfront fee or deposit"],
    ["सिक्योरिटी डिपॉजिट 2000 रुपये", "Asks for an upfront fee or deposit"],
    ["Registration fees paise jama karna padega", "Asks for an upfront fee or deposit"],
    ["Regis​tration fee ₹999 applies", "Asks for an upfront fee or deposit"],
    ["Registrаtion fee ₹999 applies", "Asks for an upfront fee or deposit"],
    ["Offer letter fee ₹1,500, interview charges extra", "Charges for an offer letter or interview"],
    // messaging apps
    ["Contact HR on 9876543210 via whatsapp", "Hires only through a messaging app"],
    ["DM on WA 9876543210 for interview", "Hires only through a messaging app"],
    ["Telegram: @hrdesk_jobs", "Hires only through a messaging app"],
    ["telegram @abc_jobs", "Hires only through a messaging app"],
    ["W h a t s A p p only: 98765 43210", "Hires only through a messaging app"],
    ["w.h.a.t.s.a.p.p only: 98765 43210", "Hires only through a messaging app"],
    ["ＷｈａｔｓＡｐｐ only 98765 43210", "Hires only through a messaging app"],
    ["Apply here: t.me/abcjobs", "Hires only through a messaging app"],
    ["व्हाट्सएप पर संपर्क करें 9876543210", "Hires only through a messaging app"],
    // earnings claims
    ["Earn ₹30,000-50,000 monthly from home, part time.", "Promises unrealistic pay for little work"],
    ["Earn ₹5,000 daily with simple work", "Promises unrealistic pay for little work"],
    ["Earn up to 3000 per day", "Promises unrealistic pay for little work"],
    ["Earn ₹40k per month working online, just a few hours", "Promises unrealistic pay for little work"],
    ["Ghar baithe paise kamaye", "Promises unrealistic pay for little work"],
    ["घर बैठे कमाएं रोज़ 1000", "Promises unrealistic pay for little work"],
    ["Easy copy paste jobs for students", "Promises unrealistic pay for little work"],
    ["Like and earn: rate videos", "Promises unrealistic pay for little work"],
    // other schemes
    ["Guaranteed placement after the course", "Promises a guaranteed job or income"],
    ["100% job guarantee", "Promises a guaranteed job or income"],
    ["Join our network marketing team", "Network marketing or pay-to-join scheme"],
    ["Buy a starter pack to join the team", "Network marketing or pay-to-join scheme"],
    ["No interview, direct joining", "No interview, direct joining"],
    ["Bina interview seedhi bharti", "No interview, direct joining"],
    ["बिना इंटरव्यू सीधी भर्ती", "No interview, direct joining"],
    // personal email
    ["Send your CV to hr.jobs@gmail.com", "Uses a personal email address to apply"],
    ["Apply: mail your resume to razorpay.careers@yahoo.co.in", "Uses a personal email address to apply"],
    ["Contact us at hr@pm.me", "Uses a personal email address to apply"],
  ])("%s", (text, flag) => {
    expect(flags(text)).toContain(flag);
  });
});

describe("what is left alone", () => {
  it.each([
    "We never charge candidates any fee.",
    "We'll send your offer letter within 3 days of the final round.",
    "There is no registration fee. We never ask candidates for money.",
    "Registration fee: nil",
    "Training charges: not applicable",
    "No security deposit or training charges are taken at any stage.",
    "We do not collect any joining amount.",
    "Beware of fraudsters asking for a registration fee in our name.",
    "Work from home. Salary ₹25,000 - ₹30,000 per month. B.Com required.",
    "You will earn ₹25,000 per month plus incentives.",
    "Pay: ₹25,000 per month",
    "Apply through our careers page, or mail your resume to careers@razorpay.com.",
    "Join our Pune office. Hybrid, three days a week.",
    "Offer amount will depend on your experience.",
    "Training cost is borne by the company.",
    "Our team uses Slack and Google Meet. Interviews are held on video calls.",
    "Joining bonus of ₹1 lakh for lateral hires.",
    "कोई पंजीकरण शुल्क नहीं है",
  ])("%s", (text) => {
    expect(flags(text)).toEqual([]);
  });

  it("still flags a fee when an earlier sentence says something negative", () => {
    expect(flags("Not a desk job. Registration fee of ₹500 must be paid.")).toContain("Asks for an upfront fee or deposit");
  });

  it("reports each warning once", () => {
    const f = flags("Registration fee ₹499. Security deposit ₹2000. Joining amount ₹1000.");
    expect(f).toEqual(["Asks for an upfront fee or deposit"]);
  });
});

describe("time on hostile text", () => {
  const time = (s: string) => {
    const t0 = performance.now();
    flags(s);
    return performance.now() - t0;
  };
  const N = MAX_PARSE_CHARS;
  it.each([
    ["spaced single letters", "a ".repeat(N / 2)],
    ["spaced letters then a word", `${"a ".repeat(N / 2 - 3)}ab`],
    ["dotted letters", "a.".repeat(N / 2)],
    ["whatsapp spelled out", "w h a t s a p p ".repeat(N / 16)],
    ["fee words", "registration ".repeat(N / 13)],
    ["apply words", `${"apply ".repeat(N / 6 - 1)}@`],
    ["earn words", "earn 1 ".repeat(N / 7)],
    ["pay words", "pay ".repeat(N / 4)],
    ["spaces", " ".repeat(N)],
    ["pipes and newlines", "|\n".repeat(N / 2)],
    ["hindi fee words", "रजिस्ट्रेशन ".repeat(N / 12)],
    ["digits and commas", "1,".repeat(N / 2)],
  ])("stays fast on %s", (_name, text) => {
    expect(time(text)).toBeLessThan(250);
  });
});
