import { describe, expect, it } from "vitest";
import { payForForm, payFromForm } from "./pay-input";

describe("payFromForm", () => {
  it("turns LPA into annual rupees", () => {
    expect(payFromForm("12", "18", "lpa")).toEqual({ ok: true, pay: { min: 1_200_000, max: 1_800_000, period: "year" } });
    expect(payFromForm("12.5", "", "lpa")).toEqual({ ok: true, pay: { min: 1_250_000, max: 1_250_000, period: "year" } });
  });

  it("turns a monthly stipend into annual rupees and remembers it was monthly", () => {
    expect(payFromForm("15000", "20000", "month")).toEqual({ ok: true, pay: { min: 180_000, max: 240_000, period: "month" } });
  });

  it("treats an unknown unit as LPA", () => {
    expect(payFromForm("10", "", "weekly")).toEqual({ ok: true, pay: { min: 1_000_000, max: 1_000_000, period: "year" } });
  });

  it.each(["", "   ", "0", "-5", "abc", "NaN", "Infinity"])("rejects %j as the starting pay", (from) => {
    expect(payFromForm(from, "", "lpa")).toEqual({ ok: false, reason: "missing" });
  });

  it("rejects a range that runs backwards", () => {
    expect(payFromForm("18", "12", "lpa")).toEqual({ ok: false, reason: "range" });
  });

  it("ignores a top figure that is not a number", () => {
    expect(payFromForm("12", "lots", "lpa")).toEqual({ ok: true, pay: { min: 1_200_000, max: 1_200_000, period: "year" } });
  });
});

describe("payForForm", () => {
  it("shows annual pay in LPA", () => {
    expect(payForForm({ pay_min_inr: 1_200_000, pay_max_inr: 1_800_000, pay_period: "year" })).toEqual({ from: "12", to: "18", unit: "lpa" });
    expect(payForForm({ pay_min_inr: 1_250_000, pay_max_inr: 1_250_000, pay_period: "year" })).toEqual({ from: "12.5", to: "", unit: "lpa" });
  });

  it("shows a stipend per month", () => {
    expect(payForForm({ pay_min_inr: 180_000, pay_max_inr: 240_000, pay_period: "month" })).toEqual({ from: "15000", to: "20000", unit: "month" });
  });

  it("round-trips through the form", () => {
    const saved = payFromForm("22.75", "30", "lpa");
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(payForForm({ pay_min_inr: saved.pay.min, pay_max_inr: saved.pay.max, pay_period: saved.pay.period })).toEqual({ from: "22.75", to: "30", unit: "lpa" });
  });

  it("leaves the boxes empty for an opening that never had pay", () => {
    expect(payForForm({})).toEqual({ from: "", to: "", unit: "lpa" });
    expect(payForForm({ pay_min_inr: null, pay_max_inr: null, pay_period: "year" })).toEqual({ from: "", to: "", unit: "lpa" });
  });

  it("copes with numbers that arrive as strings", () => {
    expect(payForForm({ pay_min_inr: "600000", pay_max_inr: "900000", pay_period: "year" })).toEqual({ from: "6", to: "9", unit: "lpa" });
  });
});
