"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { APPEARANCE_BOOTSTRAP_KEY, APPEARANCE_CHANGE_EVENT, isAppearancePreference, resolveTheme, writeAppearanceBootstrap, type AppearancePreference, type ResolvedTheme } from "@/lib/theme/theme";
import { useAccountRepositories } from "@/components/cloud/use-account-repositories";

type ThemeContextValue = Readonly<{ preference: AppearancePreference; resolvedTheme: ResolvedTheme; setPreference: (preference: AppearancePreference) => Promise<void> }>;
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function systemDark(): boolean { return window.matchMedia("(prefers-color-scheme: dark)").matches; }
function applyTheme(preference: AppearancePreference): ResolvedTheme {
  const resolved = resolveTheme(preference, systemDark());
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved === "light" ? "light" : "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "midnight" ? "#000000" : resolved === "dark" ? "#181a1d" : "#f4f6f7");
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The server and the first client render must be identical. The pre-hydration
  // script has already painted the stored theme on <html>; React adopts that
  // value in the layout effect instead of reading browser state during render.
  const initial: AppearancePreference = "system";
  const [preference, setPreferenceState] = useState<AppearancePreference>(initial);
  const preferenceRef = useRef<AppearancePreference>(initial);
  const userChangedRef = useRef(false);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const repositories = useAccountRepositories();

  useLayoutEffect(() => {
    let active = true;
    const bootstrapped = document.documentElement.dataset.themePreference;
    const next = isAppearancePreference(bootstrapped) ? bootstrapped : "system";
    preferenceRef.current = next;
    const resolved = applyTheme(next);
    queueMicrotask(() => { if (active) { setPreferenceState(next); setResolvedTheme(resolved); } });
    return () => { active = false; };
  }, []);

  const acceptPreference = useCallback((next: AppearancePreference) => {
    preferenceRef.current = next; setPreferenceState(next); setResolvedTheme(applyTheme(next));
  }, []);

  useEffect(() => {
    let active = true;
    void repositories.getSettings().then(async (settings) => {
      if (!active || userChangedRef.current) return;
      const bootstrapPreference = preferenceRef.current;
      if (settings.appearance !== bootstrapPreference) await repositories.saveSettings({ ...settings, appearance: bootstrapPreference });
      if (active) acceptPreference(bootstrapPreference);
    }).catch(() => { if (active) acceptPreference(preferenceRef.current); });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const mediaChanged = () => { if (preferenceRef.current === "system") setResolvedTheme(applyTheme("system")); };
    const externalChanged = (event: Event) => { const next = (event as CustomEvent<unknown>).detail; if (isAppearancePreference(next)) acceptPreference(next); };
    const storageChanged = (event: StorageEvent) => { if (event.key === APPEARANCE_BOOTSTRAP_KEY && isAppearancePreference(event.newValue)) acceptPreference(event.newValue); };
    media.addEventListener("change", mediaChanged); window.addEventListener(APPEARANCE_CHANGE_EVENT, externalChanged); window.addEventListener("storage", storageChanged);
    return () => { active = false; media.removeEventListener("change", mediaChanged); window.removeEventListener(APPEARANCE_CHANGE_EVENT, externalChanged); window.removeEventListener("storage", storageChanged); repositories.close(); };
  }, [acceptPreference, repositories]);

  const setPreference = useCallback(async (next: AppearancePreference) => {
    userChangedRef.current = true;
    acceptPreference(next); writeAppearanceBootstrap(next);
    try { const settings = await repositories.getSettings(); if (settings.appearance !== next) await repositories.saveSettings({ ...settings, appearance: next }); } catch { /* Appearance remains usable even when local settings storage is damaged or unavailable. */ }
  }, [acceptPreference, repositories]);

  return <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext); if (!value) throw new Error("useTheme must be used within ThemeProvider."); return value;
}
