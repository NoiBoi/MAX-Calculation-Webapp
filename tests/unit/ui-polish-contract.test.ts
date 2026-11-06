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
    const detailMode = source("components/site/detail-mode-control.tsx");
    const navigation = source("components/site/workspace-switcher.tsx");
    const styles = source("app/globals.css");
    const frame = source("app/workbench.css");
    expect(workspace).toContain('className="workbench-command-bar calculator-command-bar"');
    expect(comparison).toContain('className="workbench-command-bar comparison-command-bar"');
    expect(navigation).toContain('className="workbench-navigation"');
    for (const href of ["/workspace", "/compare", "/emi", "/xrd", "/labs", "/settings"]) {
      expect(navigation).toContain(`href: "${href}"`);
    }
    expect(navigation).toContain('aria-current={id === activeSection ? "page" : undefined}');
    expect(frame).toContain(".workbench-command-bar");
    expect(frame).toContain(".workbench-menu");
    expect(workspace).toContain('href="/demo">Documentation</Link>');
    expect(comparison).toContain('href="/demo">Documentation</Link>');
    expect(workspace).toContain('<DetailModeControl ariaLabel="Interaction mode"');
    expect(comparison).toContain('<DetailModeControl ariaLabel="Comparison detail mode"');
    expect(detailMode).toContain('className={`segmented-control detail-mode-control');
    expect(detailMode).toContain('aria-label={ariaLabel}');
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

  it("documents Comparison and EMI without em dashes", () => {
    const documentation = source("app/demo/page.tsx");
    const emiPage = source("app/emi/page.tsx");
    const comparison = source("components/comparison/comparison-shell.tsx");
    const emi = `${source("components/emi/emi-analyzer-shell.tsx")}\n${source("components/emi/emi-electrical-properties-editor.tsx")}`;
    expect(documentation).toContain('id="comparison"');
    expect(documentation).toContain('id="emi-analysis"');
    expect(emiPage).toContain('href="/demo#emi-analysis">Documentation</Link>');
    expect(documentation).toContain("A is calculated as 1 - R - T.");
    expect(`${documentation}\n${source("app/site-composition-demo.tsx")}\n${comparison}\n${emi}`).not.toContain("—");
  });
});
