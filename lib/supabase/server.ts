import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./config";
import type { AuthUserSummary, Database } from "./types";
import { summarizeAuthUser } from "./types";

export async function createSupabaseServerClient(): Promise<SupabaseClient<Database> | null> {
  const config = getSupabasePublicConfig();
  if (!config.configured) return null;
  const cookieStore = await cookies();
  return createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        try { for (const { name, value, options } of values) cookieStore.set(name, value, options); }
        catch { /* Server Components cannot write cookies; Proxy performs session refresh. */ }
      },
    },
  });
}

export async function getServerAuthUser(): Promise<AuthUserSummary | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    return summarizeAuthUser(data.user);
  } catch { return null; }
}

