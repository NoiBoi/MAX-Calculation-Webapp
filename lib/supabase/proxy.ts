import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "./config";
import type { Database } from "./types";

export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  const config = getSupabasePublicConfig();
  if (!config.configured) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const client = createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
      },
    },
  });
  try { await client.auth.getClaims(); }
  catch { /* A cloud refresh failure never blocks local-only routes. */ }
  return response;
}

