import type { Metadata } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { THEME_INITIALIZATION_SCRIPT } from "@/lib/theme/theme";
import { CreatorCredit } from "@/components/site/creator-credit";
import { AuthProvider } from "@/components/auth/auth-provider";
import { AccountScopeBoundary } from "@/components/cloud/account-scope-boundary";
import { CloudSyncProvider } from "@/components/cloud/cloud-sync-provider";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { getServerAuthUser } from "@/lib/supabase/server";
import "./globals.css";
import "./workbench.css";
import "./analysis.css";
import "./calculator.css";
import "./workspace-layouts.css";
import "./print.css";

const plexSans = localFont({
  src: "./fonts/ibm-plex-sans-latin-wght-normal.woff2",
  variable: "--plex-sans",
  weight: "100 700",
  display: "swap",
});
const plexMono = localFont({
  src: "./fonts/ibm-plex-mono-latin-400-normal.woff2",
  variable: "--plex-mono",
  weight: "400",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "MAXCalc",
  description: "Local-first MAX-phase precursor stoichiometry workspace",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cloud = getSupabasePublicConfig();
  const initialUser = cloud.configured ? await getServerAuthUser() : null;
  return (
    <html className={[plexSans.variable, plexMono.variable].join(" ")} lang="en" suppressHydrationWarning>
      <head><meta content="#f4f6f7" name="theme-color" /><script dangerouslySetInnerHTML={{ __html: THEME_INITIALIZATION_SCRIPT }} /></head>
      <body>
        <AuthProvider configured={cloud.configured} configurationMessage={cloud.configured ? undefined : cloud.message} initialUser={initialUser} signupsEnabled={cloud.signupsEnabled}>
          <AccountScopeBoundary><ThemeProvider><CloudSyncProvider>{children}<CreatorCredit /></CloudSyncProvider></ThemeProvider></AccountScopeBoundary>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
