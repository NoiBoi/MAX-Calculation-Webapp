import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { ThemeControl } from "@/components/theme/theme-control";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { THEME_INITIALIZATION_SCRIPT } from "@/lib/theme/theme";
import { CreatorCredit } from "@/components/site/creator-credit";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAX Stoich",
  description: "Local-first MAX-phase precursor stoichiometry workspace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><meta content="#f4f6f7" name="theme-color" /><script dangerouslySetInnerHTML={{ __html: THEME_INITIALIZATION_SCRIPT }} /></head>
      <body>
        <ThemeProvider>{children}<CreatorCredit /><ThemeControl /></ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
