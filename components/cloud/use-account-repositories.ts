"use client";

import { useMemo } from "react";
import { useAuth } from "../auth/auth-provider";
import { databaseNameForOwner, getOrCreateInstallationId } from "@/lib/cloud/local-data-owner";
import { MaxStoichDatabase } from "@/lib/persistence/database";
import { LocalDataRepositories } from "@/lib/persistence/repositories";

export function useAccountRepositories(): LocalDataRepositories {
  const { user } = useAuth();
  const ownerId = user?.id;
  return useMemo(
    () => new LocalDataRepositories(new MaxStoichDatabase(databaseNameForOwner(ownerId)), ownerId, ownerId ? getOrCreateInstallationId() : undefined),
    [ownerId],
  );
}
