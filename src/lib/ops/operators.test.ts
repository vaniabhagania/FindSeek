import { describe, expect, it } from "vitest";
import { isOperatorEmail, parseOperators } from "./operators";

describe("operator list", () => {
  it("reads a comma-separated setting", () => {
    expect(parseOperators("Vania@Example.com, ops@findseek.in ,")).toEqual(["vania@example.com", "ops@findseek.in"]);
  });

  it("drops anything that isn't an email address", () => {
    expect(parseOperators("everyone, *, @x.com, a b@c.com, ok@x.in")).toEqual(["ok@x.in"]);
    expect(parseOperators("")).toEqual([]);
    expect(parseOperators(undefined)).toEqual([]);
  });

  it("matches the whole address and nothing else", () => {
    const ops = parseOperators("vania@example.com");
    expect(isOperatorEmail("Vania@Example.com", ops)).toBe(true);
    expect(isOperatorEmail(" vania@example.com ", ops)).toBe(true);
    expect(isOperatorEmail("vania@example.com.evil.io", ops)).toBe(false);
    expect(isOperatorEmail("xvania@example.com", ops)).toBe(false);
    expect(isOperatorEmail("evil+vania@example.com", ops)).toBe(false);
    expect(isOperatorEmail("", ops)).toBe(false);
    expect(isOperatorEmail(null, ops)).toBe(false);
  });

  it("lets nobody in when no one is listed", () => {
    expect(isOperatorEmail("vania@example.com", [])).toBe(false);
  });
});
