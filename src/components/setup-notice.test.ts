import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupNotice } from "./setup-notice";

// The list of missing environment variables is for the people running the site, not for visitors.

afterEach(() => vi.unstubAllEnvs());

describe("SetupNotice", () => {
  it("shows what is missing while building", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(SetupNotice({})).not.toBeNull();
  });

  it("shows nothing to visitors in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(SetupNotice({})).toBeNull();
  });

  it("still shows operators in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(SetupNotice({ operator: true })).not.toBeNull();
  });
});
