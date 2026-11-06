import Link from "next/link";
import type { AppSection } from "./app-header";
import { WorkbenchIcon } from "./workbench-icon";

export type WorkspaceId = "calculator" | "comparison" | "emi" | "xrd";

const WORKSPACES = [
  { id: "calculator", href: "/workspace", name: "Calculator" },
  { id: "comparison", href: "/compare", name: "Comparison" },
  { id: "emi", href: "/emi", name: "EMI analysis" },
  { id: "xrd", href: "/xrd", name: "XRD analysis" },
] as const;

const UTILITIES = [
  { id: "labs", href: "/labs", name: "Lab libraries" },
  { id: "settings", href: "/settings", name: "Settings" },
] as const;

export function WorkspaceNavigation({ activeSection }: { readonly activeSection: AppSection }) {
  const links = (items: typeof WORKSPACES | typeof UTILITIES) => items.map(({ id, href, name }) => (
    <Link aria-current={id === activeSection ? "page" : undefined} href={href} key={id}>
      <WorkbenchIcon name={id} />
      <span>{name}</span>
    </Link>
  ));

  return (
    <nav aria-label="MAXCalc workspaces" className="workbench-navigation">
      <div className="workbench-nav-group">
        {links(WORKSPACES)}
      </div>
      <div className="workbench-nav-group">
        {links(UTILITIES)}
      </div>
    </nav>
  );
}
