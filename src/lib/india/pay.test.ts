import { describe, expect, it } from "vitest";
import { MAX_PARSE_CHARS } from "@/lib/limits";
import { parsePay } from "./pay";

const annual = (t: string) => {
  const p = parsePay(t);
  return p ? [p.minAnnualInr, p.maxAnnualInr, p.period] : null;
};

describe("amounts that are not pay", () => {
  it.each([
    "Medical insurance cover of ₹5 lakh for you and your family. Salary: competitive.",
    "Health insurance of Rs. 5,00,000 p.a. for every employee.",
    "5L term life cover for every employee",
    "Gratuity and PF as per law; 5L term life cover",
    "A service bond of 2 lakh applies for 2 years.",
    "Service agreement: bond amount ₹2,00,000 per annum",
    "We raised ₹50 Cr in our Series A last year.",
    "Backed by ₹120 crore of funding from top investors.",
    "Registration fee ₹999 to confirm your seat.",
    "Pay ₹499 for your ID card and kit",
    "Refundable laptop deposit of ₹5,000 on joining.",
    "Annual turnover ₹300 Cr, a profitable business.",
    "Joining bonus of ₹1 lakh for lateral hires.",
    "Referral bonus: ₹50,000 per hire",
    "Relocation allowance up to ₹75,000",
  ])("ignores: %s", (text) => {
    expect(parsePay(text)).toBeNull();
  });

  it("ignores years, phone numbers and dates next to a pay word", () => {
    expect(parsePay("Salary review happens in 2025 for all staff.")).toBeNull();
    expect(parsePay("For salary details call 9876543210.")).toBeNull();
    expect(parsePay("Stipend for the first 3 months, then reviewed.")).toBeNull();
  });

  it("ignores other currencies", () => {
    expect(parsePay("$80k-$100k base salary")).toBeNull();
    expect(parsePay("Salary: $90,000 per year")).toBeNull();
    expect(parsePay("Salary: 90000 USD")).toBeNull();
    expect(parsePay("CTC €70k")).toBeNull();
  });

  it("does not take a fee that sits in the same ad as real pay", () => {
    expect(annual("Stipend ₹10,000/month. Registration fee ₹999 is charged upfront.")).toEqual([120_000, 120_000, "month"]);
    expect(annual("Registration fee ₹999 applies. Stipend ₹10,000/month.")).toEqual([120_000, 120_000, "month"]);
  });

  it("ignores unpaid leave, which is not an unpaid role", () => {
    expect(parsePay("Unpaid leave is available after 12 months.")).toBeNull();
  });
});

describe("pay written without a rupee sign", () => {
  it("reads a bare number straight after a pay word", () => {
    expect(annual("Salary: 25000-30000 per month")).toEqual([300_000, 360_000, "month"]);
    expect(annual("Salary 4,50,000 per annum")).toEqual([450_000, 450_000, "year"]);
    expect(annual("Stipend - 12000")).toEqual([144_000, 144_000, "month"]);
    expect(annual("Salary: up to 9 lakhs")).toEqual([900_000, 900_000, "year"]);
  });

  it("reads LPA with no pay word at all", () => {
    expect(annual("12-18 LPA, Bengaluru")).toEqual([1_200_000, 1_800_000, "year"]);
  });

  it("reads a shared unit across a range", () => {
    expect(annual("Stipend 10-15k per month")).toEqual([120_000, 180_000, "month"]);
    expect(annual("Stipend ₹10,000 – ₹15,000/month")).toEqual([120_000, 180_000, "month"]);
  });

  it("does not stretch a range over unrelated numbers", () => {
    expect(annual("Stipend ₹15,000 - 20 hours a week")).toEqual([180_000, 180_000, "month"]);
  });
});

describe("pay that still reads", () => {
  it.each([
    ["CTC: ₹12-18 LPA plus ESOPs", [1_200_000, 1_800_000, "year"]],
    ["CTC ₹12 LPA including health insurance", [1_200_000, 1_200_000, "year"]],
    ["Annual CTC (including variable pay and bonus): ₹12 LPA", [1_200_000, 1_200_000, "year"]],
    ["Stipend ₹20,000/month + incentives", [240_000, 240_000, "month"]],
    ["Package up to 1.2 Cr", [12_000_000, 12_000_000, "year"]],
    ["Rs. 30,000/month", [360_000, 360_000, "month"]],
    ["INR 6,00,000 - 9,00,000 p.a.", [600_000, 900_000, "year"]],
    ["Salary: ₹1.5 lakh per month", [1_800_000, 1_800_000, "month"]],
    ["Honorarium of ₹8,000 per month", [96_000, 96_000, "month"]],
  ])("%s", (text, want) => {
    expect(annual(text)).toEqual(want);
  });

  it("keeps the exact words as the source", () => {
    expect(parsePay("CTC: ₹12-18 LPA plus ESOPs")?.source).toBe("₹12-18 LPA");
  });
});

describe("time on hostile text", () => {
  const time = (s: string) => {
    const t0 = performance.now();
    parsePay(s);
    return performance.now() - t0;
  };
  const nasty: [string, string][] = [
    ["comma digits", "1,".repeat(MAX_PARSE_CHARS / 2)],
    ["rupee signs", "₹1 ".repeat(MAX_PARSE_CHARS / 3)],
    ["one huge number", `${"9".repeat(MAX_PARSE_CHARS - 6)} lakh`],
    ["spaces", `1${" ".repeat(MAX_PARSE_CHARS - 10)}x`],
    ["rs rs rs", "rs ".repeat(MAX_PARSE_CHARS / 3)],
    ["ranges", "1-".repeat(MAX_PARSE_CHARS / 2)],
    ["salary words", "salary 1 ".repeat(MAX_PARSE_CHARS / 9)],
    ["periods", "1. ".repeat(MAX_PARSE_CHARS / 3)],
  ];

  it.each(nasty)("stays fast on %s", (_name, text) => {
    expect(time(text)).toBeLessThan(250);
  });

  it("grows in a straight line, not with the square", () => {
    const small = "1,".repeat(5_000);
    const big = "1,".repeat(20_000); // four times as long
    time(small); // warm up
    const a = Math.max(time(small), 0.2);
    const b = time(big);
    expect(b / a).toBeLessThan(12); // 4x the text; a square would be about 16x
  });

  it("never reads past the parse limit", () => {
    const pay = `${" ".repeat(MAX_PARSE_CHARS)} Salary: 25000 per month`;
    expect(parsePay(pay)).toBeNull();
  });
});
