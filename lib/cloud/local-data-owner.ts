export type LocalDataOwner =
  | Readonly<{ kind: "anonymous"; installationId: string }>
  | Readonly<{ kind: "account"; userId: string }>;

export const INSTALLATION_ID_KEY = "max-stoich-installation-id";
export const ANONYMOUS_DATABASE_NAME = "max-stoich-local";
export const ACCOUNT_DATABASE_PREFIX = "max-stoich-local-account-";

export function getOrCreateInstallationId(storage?: Pick<Storage, "getItem" | "setItem">): string {
  const resolvedStorage = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!resolvedStorage) throw new Error("An installation ID can be created only in a browser storage context.");
  const existing = resolvedStorage.getItem(INSTALLATION_ID_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  resolvedStorage.setItem(INSTALLATION_ID_KEY, created);
  return created;
}

export function resolveLocalDataOwner(userId?: string, storage?: Pick<Storage, "getItem" | "setItem">): LocalDataOwner {
  return userId ? { kind: "account", userId } : { kind: "anonymous", installationId: getOrCreateInstallationId(storage) };
}

export function databaseNameForOwner(userId?: string): string {
  return userId ? `${ACCOUNT_DATABASE_PREFIX}${userId}` : ANONYMOUS_DATABASE_NAME;
}
