import { beforeEach, describe, expect, it, vi } from "vitest";

// Erasing an account is irreversible, so a form on another site must not be able to trigger it.

const deleteUser = vi.fn(async () => ({ error: null }));
const remove = vi.fn(async () => ({}));
const signOut = vi.fn(async () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  getUser: async () => ({ supabase: { auth: { signOut } }, user: { id: "user-1" } }),
  createServiceClient: () => ({
    storage: { from: () => ({ list: async () => ({ data: [{ name: "cv.pdf" }] }), remove }) },
    auth: { admin: { deleteUser } },
  }),
}));

import { POST } from "./route";

const post = (headers: Record<string, string>, confirm = "DELETE") => {
  const body = new FormData();
  body.set("confirm", confirm);
  return POST(new Request("https://findseek.example/api/account/delete", { method: "POST", body, headers }) as never);
};

beforeEach(() => vi.clearAllMocks());

describe("POST /api/account/delete", () => {
  it("erases the account for a form submitted from our own site", async () => {
    const res = await post({ "sec-fetch-site": "same-origin" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/?deleted=1");
    expect(deleteUser).toHaveBeenCalledWith("user-1");
    expect(remove).toHaveBeenCalled();
  });

  it.each([
    ["a form on another site", { "sec-fetch-site": "cross-site", origin: "https://evil.example" }],
    ["a browser that names another origin", { origin: "https://evil.example", host: "findseek.example" }],
    ["a request that says where it came from nowhere", {}],
  ])("erases nothing for %s", async (_name, headers) => {
    const res = await post(headers);
    expect(res.status).toBe(403);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("still needs the typed confirmation", async () => {
    const res = await post({ "sec-fetch-site": "same-origin" }, "delete");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/settings?error=confirm");
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
