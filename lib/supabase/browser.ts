"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./config";
import type { Database } from "./types";

let browserClient: SupabaseClient<Database> | undefined;

export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  // Next.js exposes NEXT_PUBLIC values to browser bundles only when each
  // property access is statically visible. Passing process.env wholesale works
  // on the server but produces an empty runtime object in the browser.
  const config = getSupabasePublicConfig({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_AUTH_SIGNUPS_ENABLED: process.env.NEXT_PUBLIC_AUTH_SIGNUPS_ENABLED,
  });
  if (!config.configured) return null;
  browserClient ??= createBrowserClient<Database>(config.url, config.anonKey);
  return browserClient;
}
