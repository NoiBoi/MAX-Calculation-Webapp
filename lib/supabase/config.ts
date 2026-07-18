export type SupabasePublicConfig =
  | Readonly<{ configured: true; url: string; anonKey: string; signupsEnabled: boolean }>
  | Readonly<{ configured: false; missing: readonly ("NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY")[]; message: string; signupsEnabled: boolean }>;

function validUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname));
  } catch { return false; }
}

export function publicSignupsEnabled(value = process.env.NEXT_PUBLIC_AUTH_SIGNUPS_ENABLED): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function getSupabasePublicConfig(environment: Readonly<Record<string, string | undefined>> = process.env): SupabasePublicConfig {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  const missing: ("NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY")[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const signupsEnabled = publicSignupsEnabled(environment.NEXT_PUBLIC_AUTH_SIGNUPS_ENABLED);
  if (missing.length) return { configured: false, missing, signupsEnabled, message: `Cloud accounts are not configured. Missing ${missing.join(" and ")}. Local calculations and saved browser data remain available.` };
  if (!validUrl(url)) return { configured: false, missing: [], signupsEnabled, message: "Cloud accounts are not configured because NEXT_PUBLIC_SUPABASE_URL is not a valid HTTPS URL. Local calculations remain available." };
  return { configured: true, url, anonKey, signupsEnabled };
}

