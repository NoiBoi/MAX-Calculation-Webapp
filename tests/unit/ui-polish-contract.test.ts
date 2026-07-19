import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("MAXCalc shared UI architecture", () => {
  it("uses the authoritative header across primary application surfaces", () => {
    for (const path of [
      "components/workspace/workspace-shell.tsx",
      "components/comparison/comparison-shell.tsx",
      "components/settings/data-management-shell.tsx",
      "components/auth/auth-page-shell.tsx",
      "components/labs/lab-shell.tsx",
    ]) expect(source(path), path).toContain("AppHeader");
  });

  it("renders the target batch mass as one compound control", () => {
    const workspace = source("components/workspace/workspace-shell.tsx");
    const compoundInput = source("components/ui/input-with-suffix.tsx");
    expect(workspace).toContain("<InputWithSuffix");
    expect(compoundInput).toContain('data-component="input-with-suffix"');
    expect(compoundInput).not.toContain("border-l");
  });

  it("keeps workflow commands in dedicated responsive bars and maps neutral borders to tokens", () => {
    const workspace = source("components/workspace/workspace-shell.tsx");
    const comparison = source("components/comparison/comparison-shell.tsx");
    const styles = source("app/globals.css");
    expect(workspace).toContain('className="workspace-command-bar"');
    expect(comparison).toContain('className="comparison-command-bar"');
    expect(workspace).toContain('className="ui-button header-navigation-button" href="/compare"');
    expect(comparison).toContain('className="ui-button header-navigation-button" href="/settings"');
    expect(workspace).toContain('aria-label="Interaction mode"');
    expect(comparison).toContain('aria-label="Comparison detail mode"');
    expect(styles).toContain(":is(.border, .border-2");
    expect(styles).toContain("border-color: var(--border-default)");
  });

  it("uses MAXCalc visibly while retaining compatibility identifiers", () => {
    expect(source("components/site/site-brand.tsx")).toContain("<span>MAXCalc</span>");
    expect(source("app/layout.tsx")).toContain('title: "MAXCalc"');
    expect(JSON.parse(source("package.json")).name).toBe("max-stoich");
    expect(source("lib/persistence/database.ts")).toContain("max-stoich");
    expect(source("lib/persistence/backup.ts")).toContain("max-stoich-local-backup");
  });
});
