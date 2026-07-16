import { LOCAL_SCHEMA_VERSION } from "./entities";
import { migrateWorkspaceAluminumInput } from "../workspace/aluminum-feed";

export interface Migration {
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate(record: unknown): unknown;
}

/** Released migration definitions are append-only. */
export const LOCAL_MIGRATIONS: readonly Migration[] = Object.freeze([
  Object.freeze({
    fromVersion: 1,
    toVersion: 2,
    migrate(record: unknown): unknown {
      if (!record || typeof record !== "object") return record;
      const value = record as Record<string, unknown>;
      return { ...value, schemaVersion: value.schemaVersion ?? LOCAL_SCHEMA_VERSION, validationStatus: value.validationStatus ?? "synthetic", archived: value.archived ?? false, ...(typeof value.currentRevisionNumber === "number" ? { targetFormula: value.targetFormula ?? "" } : {}) };
    },
  }),
  Object.freeze({
    fromVersion: 2,
    toVersion: 3,
    migrate(record: unknown): unknown {
      if (!record || typeof record !== "object") return record;
      return { ...(record as Record<string, unknown>), schemaVersion: LOCAL_SCHEMA_VERSION };
    },
  }),
  Object.freeze({
    fromVersion: 3,
    toVersion: 4,
    migrate(record: unknown): unknown {
      if (!record || typeof record !== "object") return record;
      return { ...(record as Record<string, unknown>), schemaVersion: LOCAL_SCHEMA_VERSION };
    },
  }),
  Object.freeze({
    fromVersion: 4,
    toVersion: 5,
    migrate(record: unknown): unknown {
      if (!record || typeof record !== "object") return record;
      return { ...(record as Record<string, unknown>), schemaVersion: LOCAL_SCHEMA_VERSION };
    },
  }),
  Object.freeze({
    fromVersion: 5,
    toVersion: 6,
    migrate(record: unknown): unknown {
      if (!record || typeof record !== "object") return record;
      return { ...(record as Record<string, unknown>), schemaVersion: LOCAL_SCHEMA_VERSION };
    },
  }),
  Object.freeze({
    fromVersion: 6,
    toVersion: 7,
    migrate(record: unknown): unknown {
      if (!record || typeof record !== "object") return record;
      return { ...(record as Record<string, unknown>), schemaVersion: LOCAL_SCHEMA_VERSION };
    },
  }),
  Object.freeze({
    fromVersion: 7,
    toVersion: 8,
    migrate(record: unknown): unknown {
      if (!record || typeof record !== "object") return record;
      return { ...(record as Record<string, unknown>), schemaVersion: LOCAL_SCHEMA_VERSION };
    },
  }),
]);

export function migrateEditableWorkspaceInput(record: unknown): unknown {
  if (!record || typeof record !== "object") return record;
  return migrateWorkspaceAluminumInput(record as Parameters<typeof migrateWorkspaceAluminumInput>[0]);
}

export function migrateRecord(record: unknown, fromVersion: number, toVersion: number): unknown {
  let value = record;
  let version = fromVersion;
  while (version < toVersion) {
    const migration = LOCAL_MIGRATIONS.find((item) => item.fromVersion === version);
    if (!migration) throw new Error(`No local-data migration is registered from version ${version}.`);
    value = migration.migrate(value);
    version = migration.toVersion;
  }
  return value;
}
