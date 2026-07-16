export const APPEARANCE_BOOTSTRAP_KEY = "max-stoich-appearance" as const;
export const APPEARANCE_CHANGE_EVENT = "max-stoich-appearance-change" as const;

export type AppearancePreference = "light" | "dark" | "midnight" | "system";
export type ResolvedTheme = "light" | "dark" | "midnight";

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return value === "light" || value === "dark" || value === "midnight" || value === "system";
}

export function resolveTheme(preference: AppearancePreference, systemDark: boolean): ResolvedTheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

export function writeAppearanceBootstrap(preference: AppearancePreference): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(APPEARANCE_BOOTSTRAP_KEY, preference);
  window.dispatchEvent(new CustomEvent(APPEARANCE_CHANGE_EVENT, { detail: preference }));
}

export const THEME_INITIALIZATION_SCRIPT = `(()=>{try{const k='${APPEARANCE_BOOTSTRAP_KEY}';const v=localStorage.getItem(k);const p=v==='light'||v==='dark'||v==='midnight'||v==='system'?v:'system';const t=p==='midnight'?'midnight':p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';const e=document.documentElement;e.dataset.theme=t;e.dataset.themePreference=p;e.style.colorScheme=t==='light'?'light':'dark';}catch{document.documentElement.dataset.theme='light';document.documentElement.dataset.themePreference='system';document.documentElement.style.colorScheme='light';}})();`;
