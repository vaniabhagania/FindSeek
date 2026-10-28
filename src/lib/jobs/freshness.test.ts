import { describe, expect, it } from "vitest";
import { checkedAgo } from "./freshness";

// "Checked live" is a promise that someone looked at the source. Only listings pulled from a
// company's own job board or a job site are ever looked at again; a pasted post or an employer's
// own opening was written once and nothing re-checks it.

const now = new Date("2026-10-21T12:00:00Z");
const at = (iso: string, source?: string) => checkedAgo({ last_seen_at: iso, source }, now);

describe("what a listing says about when it was last seen", () => {
  it("says a company board listing was seen on that board", () => {
    expect(at("2026-10-21T09:00:00Z", "greenhouse")).toBe("Seen on the company's job board 3 hours ago");
    expect(at("2026-10-21T09:00:00Z", "lever")).toBe("Seen on the company's job board 3 hours ago");
  });

  it("says a job-site listing was seen in that site's results", () => {
    expect(at("2026-10-21T09:00:00Z", "adzuna")).toBe("Seen in job-site listings 3 hours ago");
  });

  it("makes no claim for a pasted post or an employer's own opening", () => {
    expect(at("2026-10-21T09:00:00Z", "user_submitted")).toBeNull();
    expect(at("2026-10-21T09:00:00Z", "manual")).toBeNull();
  });

  it("makes no claim when the source is unknown or the time is missing", () => {
    expect(at("2026-10-21T09:00:00Z")).toBeNull();
    expect(checkedAgo({ last_seen_at: null, source: "greenhouse" }, now)).toBeNull();
    expect(checkedAgo({ source: "greenhouse" }, now)).toBeNull();
  });

  it("never says 'live'", () => {
    for (const source of ["greenhouse", "lever", "adzuna"]) {
      for (const iso of ["2026-10-21T11:59:30Z", "2026-10-21T11:00:00Z", "2026-10-21T00:00:00Z", "2026-10-10T00:00:00Z"]) {
        expect(at(iso, source)).not.toMatch(/live/i);
      }
    }
  });

  it("words recent and old sightings plainly", () => {
    expect(at("2026-10-21T11:59:30Z", "greenhouse")).toBe("Seen on the company's job board just now");
    expect(at("2026-10-21T11:30:00Z", "greenhouse")).toBe("Seen on the company's job board 30 min ago");
    expect(at("2026-10-21T11:00:00Z", "greenhouse")).toBe("Seen on the company's job board 1 hour ago");
    expect(at("2026-10-18T12:00:00Z", "greenhouse")).toBe("Last seen on the company's job board 3 days ago");
    expect(at("2026-10-18T12:00:00Z", "adzuna")).toBe("Last seen in job-site listings 3 days ago");
  });

  it("does not go negative if the clock is behind", () => {
    expect(at("2026-10-21T13:00:00Z", "greenhouse")).toBe("Seen on the company's job board just now");
  });
});
