import Link from "next/link";
import type { ReactNode } from "react";
import { AccountControl } from "@/components/auth/account-control";
import { ThemeControl } from "@/components/theme/theme-control";
import { SiteBrand } from "./site-brand";
import { WorkspaceNavigation, type WorkspaceId } from "./workspace-switcher";

export type AppSection = WorkspaceId | "settings" | "account" | "labs" | "other";

const sectionNames: Record<AppSection, string> = {
  calculator: "Calculator",
  comparison: "Comparison",
  emi: "Electromagnetic interference",
  xrd: "X-ray diffraction",
  settings: "Preferences & data",
  account: "Account",
  labs: "Laboratory",
  other: "Resources",
};

interface AppHeaderProps {
  readonly activeSection: AppSection;
  readonly title: string;
  readonly status?: ReactNode;
  readonly contextualActions?: ReactNode;
  readonly moreActions?: ReactNode;
  readonly testId?: string;
}

export function AppHeader({
  activeSection,
  title,
  status,
  contextualActions,
  moreActions,
  testId = "app-header",
}: AppHeaderProps) {
  return (
    <header className="app-header" data-active-section={activeSection} data-component="app-header" data-testid={testId} role="banner">
      <div className="workbench-masthead">
        <Link aria-label="MAXCalc calculator" className="app-header-brand" href="/workspace"><SiteBrand /></Link>
        <span className="workbench-masthead-label">Research workbench</span>
        <div className="app-header-global-actions">
          <ThemeControl />
          <AccountControl />
        </div>
      </div>
      <WorkspaceNavigation activeSection={activeSection} />
      <div className="app-header-inner">
        <div className="app-header-context">
          <p className="ui-eyebrow">{sectionNames[activeSection]}</p>
          <h1>{title}</h1>
          {status && <p aria-live="polite" className="workspace-status">{status}</p>}
        </div>
        {(contextualActions || moreActions) && <div className="app-header-actions">{contextualActions}{moreActions}</div>}
      </div>
    </header>
  );
}

export function PageContainer({
  children,
  className = "",
  width = "readable",
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly width?: "workspace" | "comparison" | "settings" | "readable";
}) {
  return <div className={`page-container page-container-${width} ${className}`.trim()}>{children}</div>;
}
