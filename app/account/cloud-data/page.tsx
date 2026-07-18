import Link from "next/link";
import { CloudDataPanel } from "@/components/cloud/cloud-data-panel";
import { AuthPageShell, CloudUnavailable } from "@/components/auth/auth-page-shell";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { getServerAuthUser } from "@/lib/supabase/server";

export default async function CloudDataPage() {
  const cloud = getSupabasePublicConfig();
  if (!cloud.configured) return <AuthPageShell title="Cloud data" description="Local MAXCalc remains available."><CloudUnavailable message={cloud.message} /></AuthPageShell>;
  const user = await getServerAuthUser();
  if (!user) return <AuthPageShell title="Cloud data" description="Sign in before synchronizing account-scoped data."><div className="mt-5 flex gap-3"><Link className="rounded bg-teal-800 px-4 py-2 font-semibold text-white" href="/login?next=/account/cloud-data">Sign in</Link><Link className="rounded border px-4 py-2" href="/workspace">Open calculator</Link></div></AuthPageShell>;
  return <CloudDataPanel />;
}
