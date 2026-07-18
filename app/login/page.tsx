import { AuthPageShell, CloudUnavailable } from "@/components/auth/auth-page-shell";
import { LoginForm } from "@/components/auth/login-form";
import { safeInternalPath } from "@/lib/auth/safe-redirect";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export default async function LoginPage({ searchParams }: { readonly searchParams: Promise<{ next?: string }> }) {
  const cloud = getSupabasePublicConfig();
  const nextPath = safeInternalPath((await searchParams).next);
  return <AuthPageShell title="Sign in to MAXCalc" description="Connect a password-protected cloud account. Local calculations and browser data remain available without signing in.">
    {cloud.configured ? <LoginForm nextPath={nextPath} /> : <CloudUnavailable message={cloud.message} />}
  </AuthPageShell>;
}

