import { describe, expect, it } from "vitest";
import { isAppearancePreference, resolveTheme } from "../../lib/theme/theme";

describe("appearance resolution", () => {
  it("resolves System without changing the stored preference", () => {
    const preference = "system" as const;
    expect(resolveTheme(preference, false)).toBe("light");
    expect(resolveTheme(preference, true)).toBe("dark");
    expect(preference).toBe("system");
  });

  it("keeps explicit Light and Dark independent of OS changes", () => {
    expect(resolveTheme("light", false)).toBe("light"); expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark"); expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("midnight", false)).toBe("midnight"); expect(resolveTheme("midnight", true)).toBe("midnight");
  });

  it("accepts only supported persisted preferences", () => {
    expect(["light", "dark", "midnight", "system"].every(isAppearancePreference)).toBe(true);
    expect(isAppearancePreference("auto")).toBe(false); expect(isAppearancePreference(undefined)).toBe(false);
  });
});
