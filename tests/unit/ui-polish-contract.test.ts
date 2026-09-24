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
    const switcher = source("components/site/workspace-switcher.tsx");
    const styles = source("app/globals.css");
    expect(workspace).toContain('className="workspace-command-bar"');
    expect(comparison).toContain('className="comparison-command-bar"');
    expect(workspace).not.toContain('className="ui-button header-navigation-button" href="/compare"');
    expect(comparison).not.toContain('className="ui-button header-navigation-button" href="/settings"');
    expect(switcher).toContain('aria-haspopup="menu"');
    expect(switcher).toContain('href: "/xrd"');
    expect(switcher).toContain('className="workspace-menu-utility" href="/settings"');
    expect(switcher).toContain('event.key === "Escape"');
    expect(switcher).toContain('className="workspace-switcher-chevron"');
    expect(switcher).toContain('<svg aria-hidden="true"');
    expect(source("components/site/app-header.tsx")).not.toContain('className="app-header-divider"');
    expect(source("components/site/app-header.tsx")).not.toContain('app-header-documentation-link');
    expect(workspace).toContain('href="/demo">Documentation</Link>');
    expect(workspace).not.toContain('>New recipe <span className="text-xs">');
    expect(workspace).not.toContain('>Open recipe library</button>');
    expect(workspace).not.toContain('>Publish saved revision to lab</button>');
    expect(workspace).toContain('onClick={duplicateCurrent}>Duplicate</button>');
    expect(source("components/site/app-header.tsx")).toMatch(/\{moreActions\}\s*<ThemeControl \/>/);
    expect(comparison).toContain('More <span aria-hidden="true">•••</span>');
    expect(comparison).toContain('href="/demo">Documentation</Link>');
    expect(styles).toContain('.workspace-command-bar-inner { width: min(calc(100% - (2 * var(--page-gutter))), var(--workspace-max-width)); }');
    expect(styles).toContain('font-size: 1.08rem;');
    expect(styles).toContain('.detail-mode-control button { padding-inline: .42rem; font-size: .78rem;');
    expect(styles).toContain('.action-menu-panel *,\n.workspace-command-layer * { font-weight: 400 !important; }');
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
    expect(emiPage).toContain('More <span aria-hidden="true">•••</span>');
    expect(emiPage).toContain('href="/demo#emi-analysis">Documentation</Link>');
    expect(documentation).toContain("A is calculated as 1 - R - T.");
    expect(`${documentation}\n${source("app/site-composition-demo.tsx")}\n${comparison}\n${emi}`).not.toContain("—");
  });
});
