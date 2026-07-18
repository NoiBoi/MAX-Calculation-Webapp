import Link from "next/link";
import { AuthPageShell } from "@/components/auth/auth-page-shell";

export default async function AuthErrorPage({ searchParams }: { readonly searchParams: Promise<{ reason?: string }> }) {
  const reason = (await searchParams).reason;
  return <AuthPageShell title="Authentication could not be completed" description={reason === "invalid-callback" ? "The confirmation or reset link is missing required state." : "The authentication link may be invalid, expired, or already used."}><div className="mt-5 flex flex-wrap gap-3"><Link className="rounded bg-teal-800 px-4 py-2 font-semibold text-white" href="/login">Return to sign in</Link><Link className="rounded border px-4 py-2 font-semibold" href="/forgot-password">Request password reset</Link></div></AuthPageShell>;
}

