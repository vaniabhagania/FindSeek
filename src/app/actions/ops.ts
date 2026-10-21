"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getOperator } from "@/lib/ops/session";

const REASONS = ["closed", "fake", "wrong_pay", "not_india"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Settles every open report for one listing and reason. "confirm" pulls the listing and credits the
 * reporters; "dismiss" puts it back and lowers their weight. The database function does the work
 * (migration 0005); this only checks who is asking and what they asked.
 */
export async function resolveReports(jobId: string, reason: string, formData: FormData) {
  const operator = await getOperator();
  if (!operator) notFound();

  const decision = String(formData.get("decision") ?? "");
  if (!UUID.test(jobId) || !REASONS.includes(reason) || (decision !== "confirm" && decision !== "dismiss")) {
    redirect("/ops/reports?error=ops_failed");
  }
  const { data, error } = await operator.admin.rpc("resolve_job_reports", {
    p_job: jobId, p_reason: reason, p_decision: decision,
  });
  if (error) redirect("/ops/reports?error=ops_failed");

  revalidatePath("/ops/reports");
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/ops/reports?done=${data === "pulled" ? "pulled" : "restored"}`);
}
