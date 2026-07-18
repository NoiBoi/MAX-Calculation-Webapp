import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { ThemeControl } from "@/components/theme/theme-control";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { THEME_INITIALIZATION_SCRIPT } from "@/lib/theme/theme";
import { CreatorCredit } from "@/components/site/creator-credit";
import { AuthProvider } from "@/components/auth/auth-provider";
import { AccountControl } from "@/components/auth/account-control";
import { AccountScopeBoundary } from "@/components/cloud/account-scope-boundary";
import { CloudSyncProvider } from "@/components/cloud/cloud-sync-provider";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { getServerAuthUser } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAX Stoich",
  description: "Local-first MAX-phase precursor stoichiometry workspace",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cloud = getSupabasePublicConfig();
  const initialUser = cloud.configured ? await getServerAuthUser() : null;
  return (
    <html lang="en" suppressHydrationWarning>
      <head><meta content="#f4f6f7" name="theme-color" /><script dangerouslySetInnerHTML={{ __html: THEME_INITIALIZATION_SCRIPT }} /></head>
      <body>
        <AuthProvider configured={cloud.configured} configurationMessage={cloud.configured ? undefined : cloud.message} initialUser={initialUser} signupsEnabled={cloud.signupsEnabled}>
          <AccountScopeBoundary><ThemeProvider><CloudSyncProvider>{children}<CreatorCredit /><ThemeControl /><AccountControl /></CloudSyncProvider></ThemeProvider></AccountScopeBoundary>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
