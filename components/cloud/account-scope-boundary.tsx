"use client";

import { Fragment, type ReactNode } from "react";
import { useAuth } from "../auth/auth-provider";

/** Remounts local-data consumers when account ownership changes. */
export function AccountScopeBoundary({ children }: Readonly<{ children: ReactNode }>) {
  const { user } = useAuth();
  return <Fragment key={user?.id ?? "anonymous"}>{children}</Fragment>;
}
