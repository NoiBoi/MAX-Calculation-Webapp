import Link from "next/link";
import { AuthPageShell, CloudUnavailable } from "@/components/auth/auth-page-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export default function SignupPage() {
  const cloud = getSupabasePublicConfig();
  return <AuthPageShell title="Create a MAXCalc account" description="Accounts add an authenticated cloud identity. Recipe synchronization is not included in this milestone.">{!cloud.configured ? <CloudUnavailable message={cloud.message} /> : cloud.signupsEnabled ? <SignupForm /> : <div className="mt-5 rounded border bg-slate-50 p-4"><p className="font-semibold">MAXCalc accounts are currently invitation-only.</p><p className="mt-2 text-sm">Ask a project administrator for an invitation, then use the confirmation email to establish your account.</p><Link className="mt-3 inline-block underline" href="/login">Return to sign in</Link></div>}</AuthPageShell>;
}

