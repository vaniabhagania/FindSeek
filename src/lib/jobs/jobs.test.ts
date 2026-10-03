import { afterEach, describe, expect, it, vi } from "vitest";
import { keywordScore } from "@/lib/data/profile";
import { fetchGreenhouseBoard } from "./greenhouse";
import { fetchLeverSite } from "./lever";
import { scamFlags } from "./scam";
import { htmlToText } from "./text";

afterEach(() => vi.unstubAllGlobals());

const stubFetch = (body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));

describe("greenhouse adapter", () => {
  it("normalises listings and decodes escaped HTML", async () => {
    stubFetch({
      jobs: [{
        id: 42, title: "Data Engineer", absolute_url: "https://boards.greenhouse.io/acme/jobs/42",
        updated_at: "2026-09-01T00:00:00Z", location: { name: "Remote - US" },
        content: "&lt;p&gt;Build &amp;amp; run pipelines&lt;/p&gt;&lt;ul&gt;&lt;li&gt;SQL&lt;/li&gt;&lt;/ul&gt;",
      }],
    });
    const [job] = await fetchGreenhouseBoard("acme", "Acme");
    expect(job).toMatchObject({ source: "greenhouse", external_id: "acme:42", company: "Acme", remote: true });
    expect(job.description).toContain("Build & run pipelines");
    expect(job.description).toContain("• SQL");
  });
});

describe("lever adapter", () => {
  it("normalises postings", async () => {
    stubFetch([{
      id: "abc", text: "Designer", hostedUrl: "https://jobs.lever.co/x/abc", applyUrl: "https://jobs.lever.co/x/abc/apply",
      createdAt: 1790000000000, descriptionPlain: "Design things", workplaceType: "remote",
      categories: { location: "London" }, lists: [{ text: "You have", content: "<li>Figma</li>" }],
    }]);
    const [job] = await fetchLeverSite("x", "X Ltd");
    expect(job).toMatchObject({ source: "lever", external_id: "x:abc", remote: true, apply_url: "https://jobs.lever.co/x/abc/apply" });
    expect(job.description).toContain("Figma");
  });
});

describe("scamFlags", () => {
  it("flags upfront fees and messaging-app interviews", () => {
    expect(scamFlags({ title: "Data entry", description: "Pay the registration fee, then Telegram me for interview" })).toHaveLength(2);
    expect(scamFlags({ title: "Engineer", description: "Competitive salary and benefits." })).toEqual([]);
  });
});

describe("keywordScore", () => {
  it("rewards title matches and skill overlap", () => {
    const profile = { full_name: null, headline: null, location: null, target_roles: ["data engineer"], domains: [], skills: ["SQL", "Airflow"], experiences: [] };
    expect(keywordScore(profile, { title: "Senior Data Engineer", description: "SQL and Airflow" })).toBeGreaterThan(
      keywordScore(profile, { title: "Chef", description: "Cooking" }),
    );
  });
});

describe("htmlToText", () => {
  it("strips tags", () => expect(htmlToText("<p>a</p><p>b</p>")).toBe("a\nb"));
});
