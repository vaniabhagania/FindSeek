import { beforeEach, describe, expect, it, vi } from "vitest";

// updatePost and createPost run on the server against Supabase. These tests swap Supabase for a
// recorder, so what they check is the decision each action makes: what it saves, what it refuses,
// and where it sends the recruiter.

type Call = { table: string; method: string; args: unknown[] };
const log: Call[] = [];
let storedPost: Record<string, unknown> | null = null;

/** A chainable stand-in: every method records itself, and awaiting it gives the result for its first method. */
function fakeClient(results: Record<string, unknown> = {}) {
  return {
    from(table: string) {
      let first = "";
      const b: unknown = new Proxy(function () {}, {
        get(_t, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) =>
              resolve(first === "select" ? { data: storedPost, error: null } : (results[first] ?? { data: null, error: null }));
          }
          return (...args: unknown[]) => {
            if (!first) first = String(prop);
            log.push({ table, method: String(prop), args });
            return b;
          };
        },
      });
      return b;
    },
  };
}

const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
let service: ReturnType<typeof fakeClient> | null = null;

vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url), notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/session", () => ({
  getRecruiter: async () => ({
    supabase: fakeClient(),
    user: { id: "u1", email: "r@acme.in" },
    employer: { id: "emp1", name: "Acme Technologies", role: "owner" },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => service }));
vi.mock("@/lib/ai/client", () => ({ MODEL: "test" }));
vi.mock("@/lib/ai/screen-candidate", () => ({ screenCandidate: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/data/profile", () => ({ logAiAction: vi.fn() }));

import { createPost, updatePost } from "./admin";

const GOOD_DESCRIPTION = `Acme Technologies is hiring a backend engineer for its Pune office. You will design and build payment APIs,
review code, and work with the product team to ship features every two weeks. The team is small, so you will own
services from design to production, including monitoring and on-call.

Requirements:
- B.Tech or B.E. in Computer Science or a related field
- 3+ years of experience building backend services in Java, Go or Python
- Strong knowledge of SQL databases and REST API design
- Good communication skills in English

Salary: ₹18-26 LPA depending on experience. Hybrid, three days a week in the office. Apply through this page.`;

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const valid = {
  title: "Backend Engineer",
  location: "Pune",
  work_style: "hybrid",
  pay_min: "18",
  pay_max: "26",
  pay_unit: "lpa",
  description: GOOD_DESCRIPTION,
};

const basePost = {
  id: "11111111-1111-1111-1111-111111111111",
  employer_id: "emp1",
  job_id: null,
  title: "Old title",
  description: "x".repeat(60),
  location: null,
  country_code: "in",
  remote: null,
  pay_min_inr: null,
  pay_max_inr: null,
  pay_period: "year",
  status: "draft",
  published_at: null,
};

const ran = (table: string, method: string) => log.filter((c) => c.table === table && c.method === method);
const run = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

beforeEach(() => {
  log.length = 0;
  redirect.mockClear();
  storedPost = { ...basePost };
  service = fakeClient();
});

describe("updatePost: a draft", () => {
  it("saves the new text and pay, then goes back to the opening", async () => {
    const out = await run(() => updatePost(basePost.id, form(valid)));
    expect(out).toBe(`REDIRECT:/admin/posts/${basePost.id}?saved=1`);
    const update = ran("job_posts", "update");
    expect(update).toHaveLength(1);
    expect(update[0].args[0]).toMatchObject({
      title: "Backend Engineer",
      location: "Pune",
      remote: false,
      pay_min_inr: 1_800_000,
      pay_max_inr: 2_600_000,
      pay_period: "year",
    });
    expect(ran("jobs", "upsert")).toHaveLength(0); // a draft is not in anyone's feed
  });

  it("keeps a monthly stipend monthly", async () => {
    await run(() => updatePost(basePost.id, form({ ...valid, pay_min: "15000", pay_max: "20000", pay_unit: "month" })));
    expect(ran("job_posts", "update")[0].args[0]).toMatchObject({ pay_min_inr: 180_000, pay_max_inr: 240_000, pay_period: "month" });
  });

  it("lets a draft saved without pay gain it (the opening that could never be saved before)", async () => {
    const out = await run(() => updatePost(basePost.id, form(valid)));
    expect(out).toContain("saved=1");
  });

  it("saves even when the text would not pass verification yet: that check is at publishing", async () => {
    const out = await run(() => updatePost(basePost.id, form({ ...valid, description: "A short but long enough description of the role here." })));
    expect(out).toContain("saved=1");
    expect(ran("job_posts", "update")).toHaveLength(1);
  });
});

describe("updatePost: refuses bad input without saving anything", () => {
  it.each([
    [{ title: "x" }, "post_title"],
    [{ title: "t".repeat(161) }, "post_title"],
    [{ description: "too short" }, "post_description"],
    [{ description: "d".repeat(20_001) }, "post_description"],
    [{ pay_min: "" }, "post_pay"],
    [{ pay_min: "0" }, "post_pay"],
    [{ pay_min: "-4" }, "post_pay"],
    [{ pay_min: "20", pay_max: "10" }, "post_pay_range"],
  ])("%j -> %s", async (change, code) => {
    const out = await run(() => updatePost(basePost.id, form({ ...valid, ...change })));
    expect(out).toBe(`REDIRECT:/admin/posts/${basePost.id}/edit?error=${code}`);
    expect(ran("job_posts", "update")).toHaveLength(0);
  });
});

describe("updatePost: somebody else's opening", () => {
  it("does nothing when the opening is not found for this employer", async () => {
    storedPost = null; // the lookup is filtered by the recruiter's employer, so a stranger's post comes back empty
    const out = await run(() => updatePost("22222222-2222-2222-2222-222222222222", form(valid)));
    expect(out).toBe("REDIRECT:/admin");
    expect(ran("job_posts", "update")).toHaveLength(0);
    expect(ran("jobs", "upsert")).toHaveLength(0);
  });

  it("always scopes the lookup and the write to the recruiter's employer", async () => {
    await run(() => updatePost(basePost.id, form(valid)));
    const eqs = log.filter((c) => c.table === "job_posts" && c.method === "eq").map((c) => c.args.join("="));
    expect(eqs).toContain("employer_id=emp1");
    expect(eqs.filter((e) => e === "employer_id=emp1").length).toBeGreaterThanOrEqual(2); // read and write
  });
});

describe("updatePost: an opening that is live", () => {
  const live = () => {
    storedPost = { ...basePost, status: "open", job_id: "33333333-3333-3333-3333-333333333333", published_at: "2026-10-01T00:00:00Z", pay_min_inr: 1_800_000, pay_max_inr: 2_600_000, location: "Pune", description: GOOD_DESCRIPTION };
  };

  it("saves a good edit and updates the listing candidates see", async () => {
    live();
    const out = await run(() => updatePost(basePost.id, form({ ...valid, title: "Senior Backend Engineer" })));
    expect(out).toBe(`REDIRECT:/admin/posts/${basePost.id}?saved=live`);
    expect(ran("job_posts", "update")).toHaveLength(1);
    const upsert = ran("jobs", "upsert");
    expect(upsert).toHaveLength(1);
    expect(upsert[0].args[0]).toMatchObject({
      id: "33333333-3333-3333-3333-333333333333",
      title: "Senior Backend Engineer",
      verification_status: "verified",
      closed_at: null,
    });
  });

  it("refuses an edit that would strip the qualifications, and saves nothing", async () => {
    live();
    const out = await run(() =>
      updatePost(basePost.id, form({ ...valid, description: "Join our amazing team in Pune! We love great culture, free snacks, team lunches and fun offsites. ".repeat(8) })),
    );
    expect(out).toMatch(/^REDIRECT:\/admin\/posts\/.+\/edit\?error=edit_unpublishable&checks=/);
    expect(out).toContain("qualifications");
    expect(ran("job_posts", "update")).toHaveLength(0);
    expect(ran("jobs", "upsert")).toHaveLength(0);
  });

  it("refuses an edit that adds a fee", async () => {
    live();
    const out = await run(() => updatePost(basePost.id, form({ ...valid, description: `${GOOD_DESCRIPTION}\nA refundable registration fee of ₹2,000 is payable before joining.` })));
    expect(out).toContain("error=edit_unpublishable");
    expect(out).toContain("safety");
    expect(ran("job_posts", "update")).toHaveLength(0);
  });

  it("refuses an edit that moves the role outside India", async () => {
    live();
    const out = await run(() => updatePost(basePost.id, form({ ...valid, location: "Remote", work_style: "remote", description: `${GOOD_DESCRIPTION}\nWe are unable to hire candidates in India at this time.` })));
    expect(out).toContain("error=edit_unpublishable");
    expect(out).toContain("india");
    expect(ran("job_posts", "update")).toHaveLength(0);
  });

  it("stops, without saving, when the server cannot write listings", async () => {
    live();
    service = null;
    const out = await run(() => updatePost(basePost.id, form(valid)));
    expect(out).toBe(`REDIRECT:/admin/posts/${basePost.id}/edit?error=service_key`);
    expect(ran("job_posts", "update")).toHaveLength(0);
  });

  it("never edits a closed opening's listing", async () => {
    storedPost = { ...basePost, status: "closed", job_id: "33333333-3333-3333-3333-333333333333" };
    const out = await run(() => updatePost(basePost.id, form(valid)));
    expect(out).toContain("saved=1");
    expect(ran("jobs", "upsert")).toHaveLength(0);
  });
});

describe("createPost", () => {
  it("shares the same checks", async () => {
    expect(await run(() => createPost(form({ ...valid, pay_min: "" })))).toBe("REDIRECT:/admin/posts/new?error=post_pay");
    expect(await run(() => createPost(form({ ...valid, title: "" })))).toBe("REDIRECT:/admin/posts/new?error=post_title");
    expect(ran("job_posts", "insert")).toHaveLength(0);
  });

  it("writes the pay in annual rupees with its unit", async () => {
    storedPost = { id: "new-id" };
    // the insert's result comes from the recorder's default, so only the payload is checked
    await run(() => createPost(form(valid)));
    expect(ran("job_posts", "insert")[0].args[0]).toMatchObject({ employer_id: "emp1", pay_min_inr: 1_800_000, pay_max_inr: 2_600_000, pay_period: "year", country_code: "in" });
  });
});
