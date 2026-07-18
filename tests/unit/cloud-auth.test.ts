import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getSupabasePublicConfig, publicSignupsEnabled } from "../../lib/supabase/config";
import { safeInternalPath } from "../../lib/auth/safe-redirect";
import { databaseNameForOwner, getOrCreateInstallationId, resolveLocalDataOwner } from "../../lib/cloud/local-data-owner";

const supabaseMocks = vi.hoisted(() => ({
  createBrowserClient: vi.fn(() => ({ auth: {} })),
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => supabaseMocks);

describe("Supabase public configuration", () => {
  it("reports each missing public value without leaking any key", () => {
    const both = getSupabasePublicConfig({});
    expect(both).toMatchObject({ configured: false, missing: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] });
    expect(both.configured || both.message).not.toContain("service");

    expect(getSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key" })).toMatchObject({
      configured: false,
      missing: ["NEXT_PUBLIC_SUPABASE_URL"],
    });
    expect(getSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" })).toMatchObject({
      configured: false,
      missing: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    });
  });

  it("accepts HTTPS and local development URLs and defaults signup to disabled", () => {
    expect(getSupabasePublicConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key",
    })).toEqual({
      configured: true,
      url: "https://example.supabase.co",
      anonKey: "public-key",
      signupsEnabled: false,
    });
    expect(getSupabasePublicConfig({
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key",
      NEXT_PUBLIC_AUTH_SIGNUPS_ENABLED: "true",
    })).toMatchObject({ configured: true, signupsEnabled: true });
    expect(publicSignupsEnabled(" TRUE ")).toBe(true);
    expect(publicSignupsEnabled("yes")).toBe(false);
  });

  it("rejects insecure non-local and malformed project URLs", () => {
    expect(getSupabasePublicConfig({
      NEXT_PUBLIC_SUPABASE_URL: "http://example.com",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key",
    })).toMatchObject({ configured: false });
    expect(getSupabasePublicConfig({
      NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key",
    })).toMatchObject({ configured: false });
  });
});

describe("safe authentication redirects", () => {
  it("preserves safe internal routes and rejects external or ambiguous targets", () => {
    expect(safeInternalPath("/compare?mode=advanced#result")).toBe("/compare?mode=advanced#result");
    for (const unsafe of ["https://attacker.example", "//attacker.example", "/\\attacker.example", "workspace", "/ok\nLocation: bad"]) {
      expect(safeInternalPath(unsafe)).toBe("/workspace");
    }
  });
});

describe("local data ownership boundary", () => {
  it("creates a stable anonymous installation identity without changing it on repeat reads", () => {
    const records = new Map<string, string>();
    const storage = {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => { records.set(key, value); },
    };
    const first = getOrCreateInstallationId(storage);
    expect(getOrCreateInstallationId(storage)).toBe(first);
    expect(resolveLocalDataOwner(undefined, storage)).toEqual({ kind: "anonymous", installationId: first });
  });

  it("never treats two authenticated accounts as the same owner", () => {
    expect(resolveLocalDataOwner("user-a")).toEqual({ kind: "account", userId: "user-a" });
    expect(resolveLocalDataOwner("user-b")).toEqual({ kind: "account", userId: "user-b" });
    expect(resolveLocalDataOwner("user-a")).not.toEqual(resolveLocalDataOwner("user-b"));
    expect(databaseNameForOwner("user-a")).not.toBe(databaseNameForOwner("user-b"));
    expect(databaseNameForOwner()).toBe("max-stoich-local");
  });
});

describe("cloud sync schema security contract", () => {
  const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/202607170002_account_cloud_sync.sql"), "utf8").toLowerCase();
  it("forces owner-scoped RLS on every synchronized table without permissive policies", () => {
    for (const table of ["recipes", "recipe_revisions", "recipe_notes", "comparisons", "user_settings", "user_devices"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`alter table public.${table} force row level security`);
    }
    expect(migration).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(migration).toContain("owner_id = (select auth.uid())");
  });
  it("enforces immutable revisions, cross-owner foreign keys, and optimistic versions", () => {
    expect(migration).toContain("recipe_revisions_reject_update");
    expect(migration).not.toContain("grant update (scientific_input");
    expect(migration).toContain("foreign key (owner_id, recipe_id)");
    expect(migration).toContain("foreign key (owner_id, recipe_id, revision_id)");
    expect(migration).toContain("existing.version <> expected_version");
    expect(migration).toContain("scientific revision integrity conflict");
  });
  it("uses a server-derived monotonic cursor and soft-deletion tombstones", () => {
    expect(migration).toContain("create sequence public.maxcalc_sync_sequence");
    expect(migration).toContain("get_maxcalc_sync_high_watermark");
    expect(migration).toContain("deleted_at timestamptz null");
    expect(migration).toContain("recipes_sequence_before_insert");
    expect(migration).toContain("user_settings_sequence_before_insert");
    expect(migration).toContain("revoke all on sequence public.maxcalc_sync_sequence from public, anon, authenticated");
    expect(migration).not.toContain("grant usage on sequence public.maxcalc_sync_sequence");
  });
});

describe("browser client lifecycle and credential boundary", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    vi.resetModules();
    supabaseMocks.createBrowserClient.mockClear();
  });
  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  it("returns one shared browser client when public configuration is valid", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-key";
    const { getSupabaseBrowserClient } = await import("../../lib/supabase/browser");
    const first = getSupabaseBrowserClient();
    expect(getSupabaseBrowserClient()).toBe(first);
    expect(supabaseMocks.createBrowserClient).toHaveBeenCalledOnce();
    expect(supabaseMocks.createBrowserClient).toHaveBeenCalledWith("https://example.supabase.co", "public-key");
  });

  it("does not initialize a browser client when cloud configuration is absent", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { getSupabaseBrowserClient } = await import("../../lib/supabase/browser");
    expect(getSupabaseBrowserClient()).toBeNull();
    expect(supabaseMocks.createBrowserClient).not.toHaveBeenCalled();
  });

  it("keeps the reserved service-role variable out of client modules", () => {
    for (const file of [
      "lib/supabase/browser.ts",
      "components/auth/auth-provider.tsx",
      "components/auth/login-form.tsx",
      "components/auth/signup-form.tsx",
      "components/auth/forgot-password-form.tsx",
      "components/auth/reset-password-form.tsx",
    ]) {
      expect(readFileSync(resolve(process.cwd(), file), "utf8")).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    }
  });
});

describe("SSR proxy session refresh", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    vi.resetModules();
    supabaseMocks.createServerClient.mockReset();
  });

  it("reads request cookies, verifies claims, and returns refreshed response cookies", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-key";
    const observed: { name: string; value: string }[] = [];
    const claims = vi.fn(async () => undefined);
    supabaseMocks.createServerClient.mockImplementation((...args: unknown[]) => {
      const options = args[2] as {
        cookies: {
          getAll: () => { name: string; value: string }[];
          setAll: (values: { name: string; value: string; options: { httpOnly: boolean } }[]) => void;
        };
      };
      observed.push(...options.cookies.getAll());
      options.cookies.setAll([{ name: "sb-refreshed", value: "new-token", options: { httpOnly: true } }]);
      return { auth: { getClaims: claims } };
    });
    const { updateSupabaseSession } = await import("../../lib/supabase/proxy");
    const request = new NextRequest("https://maxcalc.example/workspace", { headers: { cookie: "sb-existing=old-token" } });
    const response = await updateSupabaseSession(request);
    expect(observed).toContainEqual({ name: "sb-existing", value: "old-token" });
    expect(claims).toHaveBeenCalledOnce();
    expect(response.cookies.get("sb-refreshed")?.value).toBe("new-token");
  });
});

describe("account schema security contract", () => {
  const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/202607170001_cloud_accounts.sql"), "utf8").toLowerCase();

  it("enables and forces RLS on every application-owned table", () => {
    for (const table of ["profiles", "labs", "lab_members"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`alter table public.${table} force row level security`);
    }
    expect(migration).not.toMatch(/using\s*\(\s*true\s*\)/);
  });

  it("binds profiles and lab visibility to the authenticated identity", () => {
    expect(migration).toContain("using (user_id = auth.uid())");
    expect(migration).toContain("with check (user_id = auth.uid())");
    expect(migration).toContain("using (public.is_lab_member(id))");
    expect(migration).toContain("using (public.is_lab_member(lab_id))");
    expect(migration).toContain("grant update (display_name)");
    expect(migration).not.toContain("grant insert on table public.labs");
    expect(migration).not.toContain("grant insert on table public.lab_members");
  });

  it("bootstraps only the current authenticated user's profile", () => {
    expect(migration).toContain("create trigger create_profile_after_auth_user");
    expect(migration).toContain("from auth.users as existing");
    expect(migration).toContain("create function public.ensure_own_profile()");
    expect(migration).toContain("values (auth.uid())");
    expect(migration).toContain("on conflict (user_id) do nothing");
  });
});

describe("automatic sync remote-hint contract", () => {
  const realtimeMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/202607170003_account_sync_realtime_hints.sql"), "utf8").toLowerCase();
  const route = readFileSync(resolve(process.cwd(), "app/api/cloud-sync/route.ts"), "utf8");

  it("publishes only existing private content tables and keeps server pull authoritative", () => {
    for (const table of ["recipes", "recipe_revisions", "recipe_notes", "comparisons", "user_settings"]) expect(realtimeMigration).toContain(`'${table}'`);
    expect(realtimeMigration).toContain("notification hints only");
    expect(realtimeMigration).not.toContain("user_devices");
  });

  it("recognizes already-applied retry results before reporting optimistic conflicts", () => {
    expect(route).toContain('status: "identical"');
    expect(route).toContain("current.data?.deleted_at");
    expect(route).toContain("current.revisions.length === operation.bundle.revisions.length");
  });
});
