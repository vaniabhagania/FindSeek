import { MAX_POST_CHARS } from "@/lib/limits";
import type { PayUnit } from "@/lib/admin/pay-input";

export interface PostDefaults {
  title: string;
  location: string;
  workStyle: "" | "remote" | "hybrid" | "onsite";
  payFrom: string;
  payTo: string;
  payUnit: PayUnit;
  description: string;
}

/** The boxes of an opening, shared by "New opening" and "Edit opening". */
export function PostFields({ defaults }: { defaults?: PostDefaults }) {
  return (
    <>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="title">Job title</label>
        <input id="title" name="title" required minLength={2} maxLength={160} defaultValue={defaults?.title} className="input" placeholder="Senior data engineer" />
      </div>
      <div>
        <label className="label" htmlFor="location">Location</label>
        <input id="location" name="location" defaultValue={defaults?.location} className="input" placeholder="Bengaluru" />
      </div>
      <div>
        <label className="label" htmlFor="pay_min">Pay</label>
        <div className="flex gap-2">
          <input id="pay_min" name="pay_min" type="number" min={0} step="0.1" required defaultValue={defaults?.payFrom} className="input" placeholder="From" aria-label="Pay from" />
          <input name="pay_max" type="number" min={0} step="0.1" defaultValue={defaults?.payTo} className="input" placeholder="To" aria-label="Pay to" />
          <select name="pay_unit" defaultValue={defaults?.payUnit ?? "lpa"} className="input w-auto" aria-label="Pay unit">
            <option value="lpa">LPA</option>
            <option value="month">₹ per month</option>
          </select>
        </div>
        <p className="mt-1 muted">Required. Openings without pay don&apos;t pass verification.</p>
      </div>
      <div>
        <label className="label" htmlFor="work_style">Work style</label>
        <select id="work_style" name="work_style" defaultValue={defaults?.workStyle ?? ""} className="input">
          <option value="">Not specified</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">On-site</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="description">Description</label>
        <textarea
          id="description" name="description" required minLength={40} maxLength={MAX_POST_CHARS} rows={10}
          defaultValue={defaults?.description} className="input"
          placeholder="What the role involves, the team, and what you're looking for."
        />
        <p className="mt-1 muted">
          Candidates see this text. Include a qualifications section (degree, skills, years of experience); openings without one
          don&apos;t pass verification.
        </p>
      </div>
    </>
  );
}
