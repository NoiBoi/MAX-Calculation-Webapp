export {};

import {
  evaluateAuthProviderPolicy,
  type SupabasePublicAuthSettings,
} from "./auth-provider-policy";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const expectedSignupEnabled = process.env.NEXT_PUBLIC_AUTH_SIGNUPS_ENABLED === "true";
if (!url || !anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");

const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } });
if (!response.ok) throw new Error(`Supabase Auth settings returned HTTP ${response.status}.`);
const settings = await response.json() as SupabasePublicAuthSettings;
const policy = evaluateAuthProviderPolicy(settings, expectedSignupEnabled);
process.stdout.write(`${JSON.stringify(policy, null, 2)}\n`);
if (!policy.consistent) {
  process.stderr.write(
    "Release blocker: application/provider signup policies differ or email/password login is disabled.\n",
  );
  process.exitCode = 1;
}
