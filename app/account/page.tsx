import Link from "next/link";
import { AccountPanel } from "@/components/auth/account-panel";
import { AuthPageShell, CloudUnavailable } from "@/components/auth/auth-page-shell";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient, getServerAuthUser } from "@/lib/supabase/server";

export default async function AccountPage() {
  const cloud = getSupabasePublicConfig();
  if (!cloud.configured) return <AuthPageShell title="MAXCalc account" description="Cloud identity is optional; local scientific work remains available."><CloudUnavailable message={cloud.message} /></AuthPageShell>;

  const user = await getServerAuthUser();
  if (!user) return <AuthPageShell title="MAXCalc account" description="Sign in to view your cloud identity and profile."><div className="mt-5 rounded border bg-slate-50 p-4"><p>You are signed out. Your local MAXCalc data remains available on this device.</p><div className="mt-4 flex flex-wrap gap-3"><Link className="rounded bg-teal-800 px-4 py-2 font-semibold text-white" href="/login?next=/account">Sign in</Link><Link className="rounded border px-4 py-2 font-semibold" href="/workspace">Open calculator</Link></div></div></AuthPageShell>;

  const client = await createSupabaseServerClient();
  let initialDisplayName = user.displayName;
  let profileError: string | undefined;
  if (client) {
    const bootstrap = await client.rpc("ensure_own_profile");
    if (bootstrap.error) {
      profileError = "Your authentication session is active, but the cloud profile could not be initialized. Local data is unaffected.";
    } else {
      const profile = bootstrap.data[0];
      if (profile?.display_name) initialDisplayName = profile.display_name;
    }
  }
  return <AuthPageShell title="MAXCalc account" description="Manage your identity, explicit cloud synchronization, and the boundary between anonymous and account-scoped device data." wide><AccountPanel initialDisplayName={initialDisplayName} profileError={profileError} user={user} /></AuthPageShell>;
}
