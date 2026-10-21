import { describe, expect, it } from "vitest";
import { indianCitiesIn, indiaEligibility, isIndianLocation, normaliseCity, workModeOf } from "./location";
import { formatInr, formatPayRange, parsePay } from "./pay";
import { parseExperience, parseJobType, parseNoticeLimit, statesQualifications } from "./requirements";

describe("Indian locations", () => {
  it("maps old and new city names to one canonical name", () => {
    expect(normaliseCity("Bangalore")).toBe("Bengaluru");
    expect(normaliseCity("Gurgaon, Haryana")).toBe("Gurugram");
    expect(indianCitiesIn("Bombay / Madras / Hyderabad")).toEqual(["Mumbai", "Hyderabad", "Chennai"]);
  });

  it("recognises India from a city, state or country", () => {
    expect(isIndianLocation("Pune")).toBe(true);
    expect(isIndianLocation("Remote, Karnataka")).toBe(true);
    expect(isIndianLocation("Remote - India")).toBe(true);
    expect(isIndianLocation("Berlin")).toBe(false);
  });

  it("reads work mode", () => {
    expect(workModeOf("Bengaluru (Hybrid)", "", null)).toBe("hybrid");
    expect(workModeOf("Remote", "", true)).toBe("remote");
    expect(workModeOf("Pune", "This is a work from office role", null)).toBe("onsite");
  });
});

describe("indiaEligibility: remote doesn't mean remote for you", () => {
  it("accepts roles based in India", () => {
    expect(indiaEligibility({ location: "Bengaluru, India", description: "" }).status).toBe("eligible");
  });
  it("rejects remote roles locked to another country", () => {
    expect(indiaEligibility({ location: "Remote - US", description: "Build APIs." }).status).toBe("not_eligible");
    expect(indiaEligibility({ location: "Remote", description: "You must be authorized to work in the United States." }).status).toBe("not_eligible");
    expect(indiaEligibility({ location: "Remote", description: "This role is EU-based only." }).status).toBe("not_eligible");
  });
  it("accepts remote roles that are explicitly worldwide or APAC", () => {
    expect(indiaEligibility({ location: "Remote", description: "We hire anywhere in the world." }).status).toBe("eligible");
    expect(indiaEligibility({ location: "Remote (APAC)", description: "" }).status).toBe("eligible");
  });
  it("says unclear instead of guessing", () => {
    expect(indiaEligibility({ location: "Remote", description: "Build APIs." }).status).toBe("unclear");
  });
  it("rejects an office in another country", () => {
    expect(indiaEligibility({ location: "London", description: "" }).status).toBe("not_eligible");
  });
});

describe("parsePay", () => {
  it("reads LPA ranges", () => {
    expect(parsePay("CTC: ₹12-18 LPA plus ESOPs")).toMatchObject({ minAnnualInr: 1_200_000, maxAnnualInr: 1_800_000, period: "year" });
    expect(parsePay("Salary 8 to 10 lakhs per annum")).toMatchObject({ minAnnualInr: 800_000, maxAnnualInr: 1_000_000 });
    expect(parsePay("Package up to 1.2 Cr")).toMatchObject({ minAnnualInr: 12_000_000 });
  });
  it("reads monthly stipends and annualises them", () => {
    expect(parsePay("Stipend: ₹15,000 - ₹20,000 per month")).toMatchObject({ minAnnualInr: 180_000, maxAnnualInr: 240_000, period: "month" });
    expect(parsePay("Stipend 25k/month")).toMatchObject({ minAnnualInr: 300_000, period: "month" });
    expect(parsePay("Rs. 30,000/month")).toMatchObject({ minAnnualInr: 360_000, period: "month" });
  });
  it("reads full rupee amounts per annum", () => {
    expect(parsePay("INR 6,00,000 - 9,00,000 p.a.")).toMatchObject({ minAnnualInr: 600_000, maxAnnualInr: 900_000, period: "year" });
  });
  it("records unpaid roles as stated pay of zero", () => {
    expect(parsePay("This is an unpaid internship")).toMatchObject({ unpaid: true, minAnnualInr: 0 });
  });
  it("doesn't treat vague promises as pay", () => {
    expect(parsePay("Competitive salary, best in industry")).toBeNull();
    expect(parsePay("3+ years of experience with Python")).toBeNull();
  });
  it("formats the way candidates talk", () => {
    expect(formatInr(1_250_000)).toBe("₹12.5 LPA");
    expect(formatInr(12_000_000)).toBe("₹1.2 Cr");
    expect(formatInr(300_000, "month")).toBe("₹25k/month");
    expect(formatPayRange({ minAnnualInr: 1_200_000, maxAnnualInr: 1_800_000, period: "year" })).toBe("₹12–18 LPA");
  });
});

describe("requirements", () => {
  it("parses experience", () => {
    expect(parseExperience("We need 2-5 years of backend experience")).toEqual({ min: 2, max: 5 });
    expect(parseExperience("Minimum 3+ years of experience in React")).toEqual({ min: 3, max: null });
    expect(parseExperience("Freshers can apply")).toEqual({ min: 0, max: 1 });
  });
  it("parses notice period limits", () => {
    expect(parseNoticeLimit("Immediate joiners only")).toBe(0);
    expect(parseNoticeLimit("Notice period of max 30 days")).toBe(30);
    expect(parseNoticeLimit("Candidates serving 60 days notice can apply")).toBe(60);
  });
  it("tells internships from full-time roles", () => {
    expect(parseJobType("Data Science Intern", "")).toBe("internship");
    expect(parseJobType("Backend Engineer", "Full-time role")).toBe("full_time");
  });
  it("checks that qualifications are stated", () => {
    expect(statesQualifications("Requirements:\n- B.Tech in CS\n- 2+ years with Node.js").ok).toBe(true);
    expect(statesQualifications("Join our amazing team! Great culture and snacks.").ok).toBe(false);
  });
});
