import { AuthPageShell, CloudUnavailable } from "@/components/auth/auth-page-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export default function ResetPasswordPage() {
  const cloud = getSupabasePublicConfig();
  return <AuthPageShell title="Choose a new password">{cloud.configured ? <ResetPasswordForm /> : <CloudUnavailable message={cloud.message} />}</AuthPageShell>;
}

