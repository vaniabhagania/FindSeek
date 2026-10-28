import { describe, expect, it } from "vitest";
import { fitChecks, type FitJob, type Preferences } from "./fit";

const base: FitJob = {
  cities: [], location: null, work_mode: null, job_type: "full_time", experience_min: null, experience_max: null,
  notice_max_days: null, pay_min_inr: null, pay_max_inr: null, pay_period: null, description: "", title: "Backend Engineer",
};
const prefs = (deal_breakers: string[]): Preferences => ({
  career_stage: null, experience_years: null, preferred_cities: [], open_to_relocate: false, remote_preference: "any",
  job_types: [], expected_pay_min_inr: null, notice_period_days: null, deal_breakers,
});
const hits = (breakers: string[], description: string, title = "Backend Engineer") =>
  fitChecks({ ...base, description, title }, prefs(breakers)).filter((c) => c.key === "dealbreaker").map((c) => c.text);

describe("a deal-breaker fires when the ad has the thing", () => {
  it.each([
    ["service bond", "A 2-year service bond applies after joining.", "Mentions a service bond"],
    ["service bond", "Service bond: 24 months.", "Mentions a service bond"],
    ["bond", "You will sign a bond for two years.", "Mentions a service bond"],
    ["night shifts", "This role has night shifts and weekend on-call.", "Mentions night or rotational shifts"],
    ["sales targets", "You will own monthly targets and cold calling.", "Has sales targets"],
    ["unpaid", "This is an unpaid internship.", "Unpaid"],
    ["unpaid", "Internship with no stipend for the first month.", "Unpaid"],
    ["travel", "Extensive travel across India is part of the role.", "Needs regular travel"],
    ["weekend work", "Weekend work is expected during releases.", "Six-day weeks or weekend work"],
    ["relocation", "Relocation to Pune is mandatory.", 'Mentions "relocation"'],
  ])("%s | %s", (breaker, text, expected) => {
    expect(hits([breaker], text)).toEqual([expected]);
  });
});

describe("a deal-breaker stays quiet when the ad says it does not apply", () => {
  it.each([
    ["service bond", "There is no service bond."],
    ["service bond", "No service bond or notice-period recovery."],
    ["service bond", "We do not have any service bond."],
    ["service bond", "We will not ask you to sign a service bond."],
    ["service bond", "Service bond: not applicable."],
    ["service bond", "Service bond: nil."],
    ["service bond", "A service bond is not required."],
    ["service bond", "Zero service bond, zero lock-in."],
    ["service bond", "Without any service bond, you are free to move on."],
    ["service bond", "No bond, no service agreement."],
    ["night shifts", "No night shifts. Regular day hours."],
    ["night shifts", "You will never be asked to work night shifts."],
    ["night shifts", "Night shifts are not required."],
    ["night shifts", "Rotational shifts: none."],
    ["sales targets", "This is not a sales role: no sales targets or cold calling."],
    ["unpaid", "This is not an unpaid internship; you will be paid a stipend."],
    ["travel", "No travel required."],
    ["weekend work", "5-day week, no weekend work."],
    ["weekend work", "We don't expect weekend work."],
    ["relocation", "No relocation required; fully remote."],
  ])("%s | %s", (breaker, text) => {
    expect(hits([breaker], text)).toEqual([]);
  });
});

describe("a denial of one thing does not hide another", () => {
  it.each([
    ["night shifts", "No service bond, but night shifts apply.", ["Mentions night or rotational shifts"]],
    ["service bond", "No night shifts; a 2-year service bond applies.", ["Mentions a service bond"]],
    ["service bond", "No lock-in on notice, however a service bond of 18 months is mandatory.", ["Mentions a service bond"]],
    ["service bond", "We never compromise on quality and we offer a 2-year service bond for trained hires.", ["Mentions a service bond"]],
    ["service bond", "Please do not ignore this: a service bond applies.", ["Mentions a service bond"]],
    ["night shifts", "Not for freshers. Night shifts are mandatory.", ["Mentions night or rotational shifts"]],
  ])("%s | %s", (breaker, text, expected) => {
    expect(hits([breaker], text)).toEqual(expected);
  });

  it("reports the thing when it is mentioned both ways", () => {
    expect(hits(["service bond"], "No service bond for interns. Full-time hires sign a service bond.")).toEqual(["Mentions a service bond"]);
  });

  it("reads the title too", () => {
    expect(hits(["unpaid"], "Great learning.", "Unpaid Content Intern")).toEqual(["Unpaid"]);
  });

  it("is not fooled by words that merely contain a negation", () => {
    expect(hits(["service bond"], "Notice period applies. A service bond is part of the offer.")).toEqual(["Mentions a service bond"]);
    expect(hits(["service bond"], "We know the service bond is unusual, but it applies.")).toEqual(["Mentions a service bond"]);
  });
});
