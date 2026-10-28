import { describe, expect, it } from "vitest";
import { openingAcceptsApplications } from "./opening";

const live = { verification_status: "verified", closed_at: null };

describe("openingAcceptsApplications", () => {
  it("accepts an open post whose verified listing is live", () => {
    expect(openingAcceptsApplications("open", live)).toBe(true);
  });

  it.each(["draft", "closed", "", null, undefined])("rejects a post that is %j", (status) => {
    expect(openingAcceptsApplications(status as string, live)).toBe(false);
  });

  it("rejects an open post once an operator has pulled the listing (closed)", () => {
    expect(openingAcceptsApplications("open", { ...live, closed_at: "2026-10-28T00:00:00Z" })).toBe(false);
  });

  it("rejects an open post whose listing is held back (reports, a failed re-check)", () => {
    expect(openingAcceptsApplications("open", { ...live, verification_status: "held" })).toBe(false);
  });

  it("rejects when the listing cannot be read at all", () => {
    expect(openingAcceptsApplications("open", null)).toBe(false);
    expect(openingAcceptsApplications("open", undefined)).toBe(false);
  });

  it("does not trust a missing verification status", () => {
    expect(openingAcceptsApplications("open", { verification_status: null, closed_at: null })).toBe(false);
  });
});
