import { describe, expect, it } from "vitest";
import { collapseDuplicates, dedupeKey } from "./dedupe";

const key = (title: string, location: string | null = "Bengaluru", company = "Razorpay") => dedupeKey({ company, title, location });

describe("the same vacancy listed twice gets one key", () => {
  it.each([
    ["Backend Engineer", "Backend Engineer (Hybrid)"],
    ["Backend Engineer", "Backend Engineer - Bengaluru"],
    ["Backend Engineer", "Backend Engineer - Bangalore, Karnataka"],
    ["Backend Engineer", "Backend Engineer [Bengaluru]"],
    ["Backend Engineer", "Backend Engineer (Remote) | India"],
    ["Backend Engineer", "URGENT HIRING: Backend Engineer - Immediate Joiners"],
    ["Backend Engineer", "Backend Engineer - Full Time"],
    ["Backend Engineer", "Backend Engineer - Razorpay"], // an aggregator appending the employer's name
    ["Backend Engineer II", "Backend Engineer - II"],
    ["Backend Engineer II", "Backend Engineer (II)"],
    ["Backend Engineer II", "Backend Engineer 2"],
    ["Backend Engineer II", "Backend Engineer - Level 2"],
  ])("%s == %s", (a, b) => {
    expect(key(a)).toBe(key(b));
  });
});

describe("different vacancies are never merged into one", () => {
  it.each([
    ["Backend Engineer - I", "Backend Engineer - II"],
    ["Backend Engineer I", "Backend Engineer II"],
    ["Backend Engineer (I)", "Backend Engineer (II)"],
    ["Backend Engineer II", "Backend Engineer III"],
    ["Backend Engineer 1", "Backend Engineer 2"],
    ["SDE 1", "SDE 2"],
    ["Senior Engineer - Payments", "Senior Engineer - Search"],
    ["Senior Engineer (Payments)", "Senior Engineer (Search)"],
    ["Engineer | Data Platform", "Engineer | Growth"],
    ["Data Analyst", "Data Scientist"],
    ["Backend Engineer", "Senior Backend Engineer"],
    ["Backend Engineer", "Backend Engineer Intern"],
  ])("%s != %s", (a, b) => {
    expect(key(a)).not.toBe(key(b));
  });

  it("keeps the same role in two cities apart", () => {
    expect(key("Backend Engineer", "Pune")).not.toBe(key("Backend Engineer", "Bengaluru"));
  });

  it("keeps two companies apart", () => {
    expect(key("Backend Engineer", "Pune", "Razorpay")).not.toBe(key("Backend Engineer", "Pune", "Zerodha"));
  });
});

describe("collapseDuplicates", () => {
  const job = (over: Record<string, unknown>) => ({
    source: "adzuna" as const, company: "Razorpay", title: "Backend Engineer - I", location: "Bengaluru", description: "d", ...over,
  });

  it("keeps both levels of the same role", () => {
    const kept = collapseDuplicates([job({ title: "Backend Engineer - I" }), job({ title: "Backend Engineer - II" })]);
    expect(kept).toHaveLength(2);
  });

  it("still keeps one copy of a true duplicate, preferring the employer's own board", () => {
    const kept = collapseDuplicates([job({ source: "adzuna" }), job({ source: "greenhouse", title: "Backend Engineer - I (Bengaluru)" })]);
    expect(kept).toHaveLength(1);
    expect(kept[0].source).toBe("greenhouse");
  });
});
