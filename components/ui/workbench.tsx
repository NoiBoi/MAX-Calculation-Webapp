import type { ReactNode } from "react";
import { WorkbenchIcon } from "@/components/site/workbench-icon";

export function PaneHeading({ id, title, actions }: {
  readonly id: string;
  readonly title: string;
  readonly actions?: ReactNode;
}) {
  return (
    <div className="pane-heading">
      <h2 id={id} tabIndex={-1}>{title}</h2>
      {actions && <div className="pane-actions">{actions}</div>}
    </div>
  );
}

export function EmptyPane({ title, children, actions }: {
  readonly title: string;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
}) {
  return (
    <div className="empty-pane">
      <span className="empty-pane-icon"><WorkbenchIcon name="empty" /></span>
      <div><h3>{title}</h3>{children && <p>{children}</p>}{actions}</div>
    </div>
  );
}

export function SectionIndex({ label, items }: {
  readonly label: string;
  readonly items: readonly { id: string; name: string }[];
}) {
  return (
    <nav aria-label={label} className="section-index">
      {items.map(({ id, name }) => <a href={`#${id}`} key={id}>{name}</a>)}
    </nav>
  );
}
