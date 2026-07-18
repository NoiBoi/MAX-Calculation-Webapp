export type TestTargetEnvironment = "local" | "preview" | "production";

export interface TestTarget {
  readonly environment: TestTargetEnvironment;
  readonly baseUrl: string;
  readonly destructiveTestsAllowed: boolean;
}

function environmentFromUrl(baseUrl: string): TestTargetEnvironment {
  const hostname = new URL(baseUrl).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return "local";
  if (hostname === "maxcalc.vercel.app") return "production";
  return "preview";
}

export function resolveTestTarget(environment: Readonly<Record<string, string | undefined>>): TestTarget {
  const baseUrl = (environment.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
  const inferred = environmentFromUrl(baseUrl);
  const requested = environment.TEST_TARGET;
  if (requested && !["local", "preview", "production"].includes(requested)) {
    throw new Error("TEST_TARGET must be local, preview, or production.");
  }
  const target = (requested ?? inferred) as TestTargetEnvironment;
  if (target !== inferred) {
    throw new Error(`TEST_TARGET=${target} does not match PLAYWRIGHT_BASE_URL (${inferred}).`);
  }
  const destructiveTestsAllowed = environment.ALLOW_PRODUCTION_DESTRUCTIVE_TESTS === "true";
  if (target === "production" && destructiveTestsAllowed && environment.CONFIRM_PRODUCTION_TEST_RUN !== "MAXCALC_DISPOSABLE_DATA_ONLY") {
    throw new Error("Production destructive tests require CONFIRM_PRODUCTION_TEST_RUN=MAXCALC_DISPOSABLE_DATA_ONLY.");
  }
  return Object.freeze({ environment: target, baseUrl, destructiveTestsAllowed });
}
