import { AuthPageShell, CloudUnavailable } from "@/components/auth/auth-page-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export default function ResetPasswordPage() {
  const cloud = getSupabasePublicConfig();
  return <AuthPageShell title="Choose a new password" description="Password changes are handled by Supabase Auth and are never stored in the MAXCalc application database.">{cloud.configured ? <ResetPasswordForm /> : <CloudUnavailable message={cloud.message} />}</AuthPageShell>;
}

