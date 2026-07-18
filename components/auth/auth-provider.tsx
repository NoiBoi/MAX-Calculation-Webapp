"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { summarizeAuthUser, type AuthUserSummary } from "@/lib/supabase/types";

interface AuthContextValue {
  readonly configured: boolean;
  readonly configurationMessage?: string;
  readonly signupsEnabled: boolean;
  readonly user: AuthUserSummary | null;
  readonly pending: boolean;
  readonly message: string;
  readonly refreshUser: () => Promise<AuthUserSummary | null>;
  readonly signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children, configured, configurationMessage, signupsEnabled, initialUser }: Readonly<{ children: ReactNode; configured: boolean; configurationMessage?: string; signupsEnabled: boolean; initialUser: AuthUserSummary | null }>) {
  const router = useRouter();
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState(initialUser);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const refreshUser = useCallback(async () => {
    if (!client) { setUser(null); return null; }
    try {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) { setUser(null); return null; }
      const summary = summarizeAuthUser(data.user);
      setUser(summary);
      return summary;
    } catch { setUser(null); return null; }
  }, [client]);

  useEffect(() => {
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => setUser(session?.user ? summarizeAuthUser(session.user) : null));
    return () => data.subscription.unsubscribe();
  }, [client]);

  const signOut = useCallback(async () => {
    if (!client || pending) return;
    setPending(true); setMessage("");
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      setUser(null);
      setMessage("Signed out. Local MAXCalc data remains on this device.");
      router.refresh();
    } catch (error) {
      setMessage(`Sign-out failed: ${error instanceof Error ? error.message : "cloud authentication is unavailable"}`);
    } finally { setPending(false); }
  }, [client, pending, router]);

  return <AuthContext.Provider value={{ configured, ...(configurationMessage ? { configurationMessage } : {}), signupsEnabled, user, pending, message, refreshUser, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}

