"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./config";
import type { Database } from "./types";

let browserClient: SupabaseClient<Database> | undefined;

export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  const config = getSupabasePublicConfig();
  if (!config.configured) return null;
  browserClient ??= createBrowserClient<Database>(config.url, config.anonKey);
  return browserClient;
}

