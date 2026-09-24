import Link from "next/link";
import type { ReactNode } from "react";
import { AccountControl } from "@/components/auth/account-control";
import { ThemeControl } from "@/components/theme/theme-control";
import { SiteBrand } from "./site-brand";
import { WorkspaceSwitcher, type WorkspaceId } from "./workspace-switcher";

export type AppSection = WorkspaceId | "settings" | "account" | "labs" | "other";

interface AppHeaderProps {
  readonly activeSection: AppSection;
  readonly title: string;
  readonly status?: ReactNode;
  readonly contextualActions?: ReactNode;
  readonly moreActions?: ReactNode;
  readonly testId?: string;
}

/**
 * Shared route banner that keeps product identity, route context, account
 * controls, and appearance controls in a stable accessible order.
 */
export function AppHeader({
  activeSection,
  title,
  status,
  contextualActions,
  moreActions,
  testId = "app-header",
}: AppHeaderProps) {
  return <header className="app-header" data-active-section={activeSection} data-component="app-header" data-testid={testId} role="banner">
    <div className="app-header-inner">
      <Link aria-label="MAXCalc calculator" className="app-header-brand" href="/workspace">
        <SiteBrand />
      </Link>
      <WorkspaceSwitcher activeWorkspace={(["calculator", "comparison", "emi", "xrd"] as const).includes(activeSection as WorkspaceId) ? activeSection as WorkspaceId : undefined} />
      <div className="app-header-context">
        <h1 title={title}>{title}</h1>
        <p aria-live="polite">{status ?? <span aria-hidden="true">&nbsp;</span>}</p>
      </div>
      {contextualActions && <div className="app-header-actions">{contextualActions}</div>}
      <div className="app-header-global-actions">
        <AccountControl />
        {moreActions}
        <ThemeControl />
      </div>
    </div>
  </header>;
}

/**
 * Applies the route-specific maximum-width contract without adding page
 * semantics or changing the order of its children.
 */
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
