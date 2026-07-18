import { ENGINE_VERSION } from "@max-stoich/chemistry-engine";
import { DATABASE_VERSION } from "../persistence/database";
import { LOCAL_SCHEMA_VERSION } from "../persistence/entities";
import { CLOUD_SYNC_SCHEMA_VERSION } from "../cloud/sync-types";
import { LAB_SCHEMA_VERSION } from "../labs/types";

export const RELEASE_CANDIDATE_ID = "v1.0.0-rc.1" as const;
export const SUPABASE_MIGRATION_VERSION = "202607170004" as const;
export const PRODUCTION_URL = "https://maxcalc.vercel.app" as const;

export function releaseBaseline(environment: Readonly<Record<string, string | undefined>> = process.env) {
  return Object.freeze({
    releaseCandidate: RELEASE_CANDIDATE_ID,
    applicationVersion: "1.0.0-rc.1",
    gitCommit: environment.VERCEL_GIT_COMMIT_SHA ?? environment.GIT_COMMIT ?? "unrecorded",
    chemistryEngineVersion: ENGINE_VERSION,
    scientificSchemaVersion: "1.0.0",
    indexedDbVersion: DATABASE_VERSION,
    localRecordSchemaVersion: LOCAL_SCHEMA_VERSION,
    cloudSyncSchemaVersion: CLOUD_SYNC_SCHEMA_VERSION,
    labSchemaVersion: LAB_SCHEMA_VERSION,
    supabaseMigrationVersion: SUPABASE_MIGRATION_VERSION,
    atomicWeightDatasetVersion: "2024.2.0",
    atomicRadiusDatasetVersions: Object.freeze({
      teatumMetallicCn12: "1.0.0",
      corderoCovalent: "1.0.0",
      rahmNeutralIsodensity: "1.0.0",
    }),
    productionUrl: PRODUCTION_URL,
    previewUrl: environment.VERCEL_URL ? `https://${environment.VERCEL_URL}` : "not-recorded",
  });
}
