import { describe, expect, it } from "vitest";
import { releaseBaseline } from "../../lib/release/baseline";
import { resolveTestTarget } from "../../lib/release/test-target";

describe("Milestone 5A release hardening", () => {
  it("records a versioned release-candidate baseline", () => {
    const baseline = releaseBaseline({ GIT_COMMIT: "abc123", VERCEL_URL: "preview.example" });
    expect(baseline.releaseCandidate).toBe("v1.0.0-rc.1");
    expect(baseline.gitCommit).toBe("abc123");
    expect(baseline.indexedDbVersion).toBe(11);
    expect(baseline.supabaseMigrationVersion).toBe("202607170004");
  });

  it("infers deployed targets and refuses mismatched environment labels", () => {
    expect(resolveTestTarget({ PLAYWRIGHT_BASE_URL: "https://maxcalc.vercel.app" }).environment).toBe("production");
    expect(() => resolveTestTarget({ PLAYWRIGHT_BASE_URL: "https://maxcalc.vercel.app", TEST_TARGET: "preview" })).toThrow(/does not match/);
  });

  it("requires an explicit second confirmation for destructive production tests", () => {
    expect(() => resolveTestTarget({
      PLAYWRIGHT_BASE_URL: "https://maxcalc.vercel.app",
      TEST_TARGET: "production",
      ALLOW_PRODUCTION_DESTRUCTIVE_TESTS: "true",
    })).toThrow(/CONFIRM_PRODUCTION_TEST_RUN/);
    expect(resolveTestTarget({
      PLAYWRIGHT_BASE_URL: "https://maxcalc.vercel.app",
      TEST_TARGET: "production",
      ALLOW_PRODUCTION_DESTRUCTIVE_TESTS: "true",
      CONFIRM_PRODUCTION_TEST_RUN: "MAXCALC_DISPOSABLE_DATA_ONLY",
    }).destructiveTestsAllowed).toBe(true);
  });
});
