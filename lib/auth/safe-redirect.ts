export function safeInternalPath(value: string | null | undefined, fallback = "/workspace"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, "https://maxcalc.invalid");
    return parsed.origin === "https://maxcalc.invalid" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch { return fallback; }
}

