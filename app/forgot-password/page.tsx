import { AuthPageShell, CloudUnavailable } from "@/components/auth/auth-page-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export default function ForgotPasswordPage() {
  const cloud = getSupabasePublicConfig();
  return <AuthPageShell title="Reset your password">{cloud.configured ? <ForgotPasswordForm /> : <CloudUnavailable message={cloud.message} />}</AuthPageShell>;
}

