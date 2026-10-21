// Re-checks a listing at its source right before the user spends time on it (tailoring a
// CV costs an AI call and their attention). Company boards answer 404 once a job closes.

export type Liveness = "open" | "closed" | "unknown";

export function livenessUrl(job: { source: string; external_id: string }): string | null {
  const [board, id] = job.external_id.split(":");
  if (!board || !id) return null;
  if (job.source === "greenhouse") return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(id)}`;
  if (job.source === "lever") return `https://api.lever.co/v0/postings/${encodeURIComponent(board)}/${encodeURIComponent(id)}`;
  return null;
}

export async function checkStillOpen(job: { source: string; external_id: string }): Promise<Liveness> {
  const url = livenessUrl(job);
  if (!url) return "unknown";
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (res.status === 404 || res.status === 410) return "closed";
    return res.ok ? "open" : "unknown";
  } catch {
    return "unknown"; // a network blip shouldn't block the user
  }
}
