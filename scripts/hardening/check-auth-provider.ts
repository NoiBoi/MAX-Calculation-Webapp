export {};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const expectedSignupEnabled = process.env.NEXT_PUBLIC_AUTH_SIGNUPS_ENABLED === "true";
if (!url || !anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");

const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } });
if (!response.ok) throw new Error(`Supabase Auth settings returned HTTP ${response.status}.`);
const settings = await response.json() as { disable_signup?: boolean; mailer_autoconfirm?: boolean };
const providerSignupEnabled = settings.disable_signup === false;
const consistent = providerSignupEnabled === expectedSignupEnabled;
process.stdout.write(`${JSON.stringify({
  applicationSignupEnabled: expectedSignupEnabled,
  providerSignupEnabled,
  consistent,
  emailConfirmationRequired: settings.mailer_autoconfirm === false,
}, null, 2)}\n`);
if (!consistent) {
  process.stderr.write("Release blocker: application and Supabase provider signup policies differ.\n");
  process.exitCode = 1;
}
