import Link from "next/link";
import type { ReactNode } from "react";
import { AccountControl } from "@/components/auth/account-control";
import { ThemeControl } from "@/components/theme/theme-control";
import { SiteBrand } from "./site-brand";

export type AppSection = "calculator" | "comparison" | "settings" | "account" | "labs" | "other";

interface AppHeaderProps {
  readonly activeSection: AppSection;
  readonly title: string;
  readonly status?: ReactNode;
  readonly contextualActions?: ReactNode;
  readonly testId?: string;
}

export function AppHeader({
  activeSection,
  title,
  status,
  contextualActions,
  testId = "app-header",
}: AppHeaderProps) {
  return <header className="app-header" data-active-section={activeSection} data-component="app-header" data-testid={testId} role="banner">
    <div className="app-header-inner">
      <Link aria-label="MAXCalc calculator" className="app-header-brand" href="/workspace">
        <SiteBrand />
      </Link>
      <div className="app-header-context">
        <h1 title={title}>{title}</h1>
        <p aria-live="polite">{status ?? <span aria-hidden="true">&nbsp;</span>}</p>
      </div>
      {contextualActions && <div className="app-header-actions">{contextualActions}</div>}
      <div className="app-header-global-actions">
        <AccountControl />
        <ThemeControl />
      </div>
    </div>
  </header>;
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
