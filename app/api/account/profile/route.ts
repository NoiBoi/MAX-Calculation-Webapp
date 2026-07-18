import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateJsonRequestHeaders } from "@/lib/security/request-guards";

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  const headerFailure = validateJsonRequestHeaders(request.headers, 16 * 1024);
  if (headerFailure) return NextResponse.json({ message: headerFailure.message, code: headerFailure.code }, { status: headerFailure.status });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Cross-origin profile updates are not allowed." }, { status: 403 });
  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ message: "Cloud accounts are not configured." }, { status: 503 });

  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ message: "Sign in again before updating your profile." }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ message: "The profile request is not valid JSON." }, { status: 400 }); }
  const displayName = typeof (body as { displayName?: unknown })?.displayName === "string"
    ? (body as { displayName: string }).displayName.trim()
    : "";
  if (displayName.length > 120) return NextResponse.json({ message: "Display name must be 120 characters or fewer." }, { status: 400 });

  const bootstrap = await client.rpc("ensure_own_profile");
  if (bootstrap.error) return NextResponse.json({ message: "The cloud profile could not be initialized. Local data is unaffected." }, { status: 503 });
  const profileUpdate = await client.from("profiles").update({ display_name: displayName || null }).eq("user_id", auth.user.id).select("display_name").single();
  if (profileUpdate.error) return NextResponse.json({ message: "The display name update was denied or unavailable." }, { status: 403 });

  const metadataUpdate = await client.auth.updateUser({ data: { display_name: displayName || null } });
  if (metadataUpdate.error) {
    return NextResponse.json({ displayName, message: "Display name saved to your profile. The account-menu label will update after your next sign-in." });
  }
  return NextResponse.json({ displayName, message: "Display name updated." });
}
