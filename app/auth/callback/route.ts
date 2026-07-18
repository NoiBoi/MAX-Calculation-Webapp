import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "@/lib/auth/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"), "/account");
  const client = await createSupabaseServerClient();
  if (!client || !code) return NextResponse.redirect(new URL("/auth/error?reason=invalid-callback", request.url));
  try {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return NextResponse.redirect(new URL(next, request.url));
  } catch {
    return NextResponse.redirect(new URL("/auth/error?reason=callback-failed", request.url));
  }
}

