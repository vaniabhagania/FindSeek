import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { failedCheckHints, failedCheckLabels, noticeMessage, noticeUrl, NOTICES } from "./notices";

describe("alert box messages", () => {
  it("shows nothing for text that came from a link", () => {
    const spoof = "Your FindSeek account is suspended. Pay ₹499 on UPI to rescue@upi to restore it.";
    expect(noticeMessage(spoof)).toBeNull();
    expect(noticeMessage(encodeURIComponent(spoof))).toBeNull();
    expect(noticeMessage("<script>alert(1)</script>")).toBeNull();
  });

  it("ignores names that exist on every JavaScript object", () => {
    for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      expect(noticeMessage(key)).toBeNull();
    }
  });

  it("ignores missing and non-text values", () => {
    expect(noticeMessage(undefined)).toBeNull();
    expect(noticeMessage(["consent"])).toBeNull();
    expect(noticeMessage(42)).toBeNull();
    expect(noticeMessage("")).toBeNull();
  });

  it("returns the fixed message for a known code", () => {
    expect(noticeMessage("consent")).toMatch(/AI processing/);
    expect(noticeMessage("criterion_0")).toMatch(/age/);
  });

  it("only lists failed checks from the fixed set", () => {
    expect(failedCheckLabels("source,pay")).toEqual(["A real hiring source", "Pay stated"]);
    expect(failedCheckLabels("pay,constructor,<b>x</b>,__proto__")).toEqual(["Pay stated"]);
    expect(failedCheckLabels(undefined)).toEqual([]);
  });

  it("explains how to fix a failed source check, from fixed text only", () => {
    expect(failedCheckHints("source")[0]).toMatch(/company's own domain/);
    expect(failedCheckHints("pay,india")).toEqual([]);
    expect(failedCheckHints("constructor,__proto__,<b>x</b>")).toEqual([]);
    expect(failedCheckHints(undefined)).toEqual([]);
  });

  it("builds links that carry a code, never prose", () => {
    expect(noticeUrl("/jobs/abc", "held")).toBe("/jobs/abc?error=held");
    expect(noticeUrl("/admin/posts/1", "unpublishable", { checks: "pay" })).toBe("/admin/posts/1?error=unpublishable&checks=pay");
  });
});

/** Every code a server action can send must exist, or the user sees a blank page with no explanation. */
describe("codes used in the app", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) && !p.endsWith(".test.ts") ? [p] : [];
    });
  const files = walk(join(process.cwd(), "src/app"));
  const used = new Set<string>();
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/[?&]error=([a-z_]+)/g)) used.add(m[1]);
    for (const m of src.matchAll(/\b(?:fail|back|stop)\((?:path, )?"([a-z_]+)"/g)) used.add(m[1]);
  }

  it("finds the codes in the source", () => {
    expect(used.size).toBeGreaterThan(20);
  });

  it.each([...used].sort())("%s has a message", (code) => {
    expect(Object.hasOwn(NOTICES, code)).toBe(true);
  });
});
