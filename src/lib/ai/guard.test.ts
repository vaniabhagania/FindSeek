import { describe, expect, it } from "vitest";
import { checkForFabrication } from "./guard";
import type { VerifiedProfile } from "./profile-context";
import type { TailoredCv } from "./schemas";

const profile: VerifiedProfile = {
  full_name: "Sam Lee",
  headline: null,
  location: null,
  target_roles: ["Backend engineer"],
  domains: [],
  skills: ["Go", "PostgreSQL"],
  experiences: [
    {
      id: "exp-1",
      kind: "work",
      organisation: "Acme",
      title: "Software Engineer",
      start_date: "2021-03",
      end_date: null,
      bullets: ["Cut API latency by 40% across 12 services"],
    },
  ],
};

const base: TailoredCv = {
  headline: "Backend engineer",
  summary: "",
  experiences: [
    {
      source_id: "exp-1",
      organisation: "Acme",
      title: "Software Engineer",
      start_date: "2021-03",
      end_date: null,
      bullets: ["Reduced API latency 40% across 12 Go services"],
    },
  ],
  skills: ["Go", "postgresql"],
  keywords_matched: [],
  keywords_missing: [],
  change_log: [],
  cover_letter: "",
};

describe("checkForFabrication", () => {
  it("accepts truthful rewording and case differences", () => {
    expect(checkForFabrication(profile, base)).toEqual([]);
  });

  it("flags invented numbers, titles, dates, skills and experiences", () => {
    const cv: TailoredCv = {
      ...base,
      experiences: [
        { ...base.experiences[0], title: "Senior Software Engineer", start_date: "2019-01", bullets: ["Cut latency by 60%"] },
        { source_id: "made-up", organisation: "Globex", title: "Lead", start_date: null, end_date: null, bullets: [] },
      ],
      skills: ["Go", "Kubernetes"],
    };
    const warnings = checkForFabrication(profile, cv);
    expect(warnings).toHaveLength(5);
    expect(warnings.join("\n")).toMatch(/Senior Software Engineer/);
    expect(warnings.join("\n")).toMatch(/Dates changed/);
    expect(warnings.join("\n")).toMatch(/60/);
    expect(warnings.join("\n")).toMatch(/Globex/);
    expect(warnings.join("\n")).toMatch(/Kubernetes/);
  });
});
