import type {
  CloudChangeSet,
  CloudComparison,
  CloudDevice,
  CloudRecipe,
  CloudRecipeBundle,
  CloudRecipeNote,
  CloudUserSettings,
  CloudWriteOperation,
  CloudWriteResult,
  LocalRecipeBundle,
} from "./sync-types";
import { validateChangeSetEnvelope } from "./validation";

export class CloudRepositoryError extends Error {
  constructor(readonly code: string, message: string, readonly status: number, readonly retryable = false) {
    super(message);
    this.name = "CloudRepositoryError";
  }
}

export interface CloudRecipeRepository {
  listRecipes(cursor?: string): Promise<CloudChangeSet>;
  getRecipeBundle(recipeId: string): Promise<CloudRecipeBundle>;
  createRecipeBundle(bundle: LocalRecipeBundle, mappings: Extract<CloudWriteOperation, { kind: "upsert-recipe-bundle" }>["mappings"], sourceDeviceId: string): Promise<CloudWriteResult>;
  createRevision(recipeId: string, bundle: LocalRecipeBundle, mappings: Extract<CloudWriteOperation, { kind: "upsert-recipe-bundle" }>["mappings"], expectedRecipeVersion: number, sourceDeviceId: string): Promise<CloudWriteResult>;
  updateRecipeMetadata(operation: Extract<CloudWriteOperation, { kind: "upsert-recipe-bundle" }>): Promise<CloudWriteResult>;
  softDeleteRecipe(recipeId: string, cloudId: string, expectedVersion: number, sourceDeviceId: string): Promise<CloudWriteResult>;
}

export interface CloudNoteRepository {
  upsertNote(operation: Extract<CloudWriteOperation, { kind: "upsert-note" }>): Promise<CloudWriteResult>;
  softDeleteNote(operation: Extract<CloudWriteOperation, { kind: "soft-delete-note" }>): Promise<CloudWriteResult>;
}
export interface CloudComparisonRepository {
  upsertComparison(operation: Extract<CloudWriteOperation, { kind: "upsert-comparison" }>): Promise<CloudWriteResult>;
  softDeleteComparison(operation: Extract<CloudWriteOperation, { kind: "soft-delete-comparison" }>): Promise<CloudWriteResult>;
}
export interface CloudSettingsRepository {
  upsertSettings(operation: Extract<CloudWriteOperation, { kind: "upsert-settings" }>): Promise<CloudWriteResult>;
}
export interface CloudDeviceRepository {
  upsertDevice(operation: Extract<CloudWriteOperation, { kind: "upsert-device" }>): Promise<CloudWriteResult>;
}

export interface CloudSyncRepository extends CloudRecipeRepository, CloudNoteRepository, CloudComparisonRepository, CloudSettingsRepository, CloudDeviceRepository {
  readonly ownerId: string;
  pull(cursor: string): Promise<CloudChangeSet>;
  write(operations: readonly CloudWriteOperation[]): Promise<readonly CloudWriteResult[]>;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class HttpCloudSyncRepository implements CloudSyncRepository {
  constructor(readonly ownerId: string, private readonly fetcher: FetchLike = fetch) {}

  private async response<T>(response: Response): Promise<T> {
    let payload: unknown;
    try { payload = await response.json(); } catch { payload = undefined; }
    if (!response.ok) {
      const value = payload as { code?: string; message?: string } | undefined;
      throw new CloudRepositoryError(value?.code ?? "CLOUD_REQUEST_FAILED", value?.message ?? "Cloud synchronization is unavailable.", response.status, response.status >= 500 || response.status === 429);
    }
    return payload as T;
  }

  async pull(cursor: string): Promise<CloudChangeSet> {
    const response = await this.fetcher(`/api/cloud-sync?cursor=${encodeURIComponent(cursor)}`, { method: "GET", headers: { accept: "application/json" }, cache: "no-store" });
    return validateChangeSetEnvelope(await this.response(response), this.ownerId);
  }
  listRecipes(cursor = "0"): Promise<CloudChangeSet> { return this.pull(cursor); }

  async getRecipeBundle(recipeId: string): Promise<CloudRecipeBundle> {
    const response = await this.fetcher(`/api/cloud-sync?recipeId=${encodeURIComponent(recipeId)}`, { method: "GET", headers: { accept: "application/json" }, cache: "no-store" });
    return this.response(response);
  }

  async write(operations: readonly CloudWriteOperation[]): Promise<readonly CloudWriteResult[]> {
    if (!operations.length) return [];
    const response = await this.fetcher("/api/cloud-sync", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ operations }) });
    return this.response(response);
  }

  async createRecipeBundle(bundle: LocalRecipeBundle, mappings: Extract<CloudWriteOperation, { kind: "upsert-recipe-bundle" }>["mappings"], sourceDeviceId: string): Promise<CloudWriteResult> {
    return (await this.write([{ kind: "upsert-recipe-bundle", bundle, mappings, sourceDeviceId }]))[0]!;
  }
  async createRevision(_recipeId: string, bundle: LocalRecipeBundle, mappings: Extract<CloudWriteOperation, { kind: "upsert-recipe-bundle" }>["mappings"], expectedRecipeVersion: number, sourceDeviceId: string): Promise<CloudWriteResult> {
    return (await this.write([{ kind: "upsert-recipe-bundle", bundle, mappings, expectedVersion: expectedRecipeVersion, sourceDeviceId }]))[0]!;
  }
  async updateRecipeMetadata(operation: Extract<CloudWriteOperation, { kind: "upsert-recipe-bundle" }>): Promise<CloudWriteResult> { return (await this.write([operation]))[0]!; }
  async softDeleteRecipe(id: string, cloudId: string, expectedVersion: number, sourceDeviceId: string): Promise<CloudWriteResult> {
    return (await this.write([{ kind: "soft-delete-recipe", id, cloudId, expectedVersion, sourceDeviceId }]))[0]!;
  }
  async upsertNote(operation: Extract<CloudWriteOperation, { kind: "upsert-note" }>): Promise<CloudWriteResult> { return (await this.write([operation]))[0]!; }
  async softDeleteNote(operation: Extract<CloudWriteOperation, { kind: "soft-delete-note" }>): Promise<CloudWriteResult> { return (await this.write([operation]))[0]!; }
  async upsertComparison(operation: Extract<CloudWriteOperation, { kind: "upsert-comparison" }>): Promise<CloudWriteResult> { return (await this.write([operation]))[0]!; }
  async softDeleteComparison(operation: Extract<CloudWriteOperation, { kind: "soft-delete-comparison" }>): Promise<CloudWriteResult> { return (await this.write([operation]))[0]!; }
  async upsertSettings(operation: Extract<CloudWriteOperation, { kind: "upsert-settings" }>): Promise<CloudWriteResult> { return (await this.write([operation]))[0]!; }
  async upsertDevice(operation: Extract<CloudWriteOperation, { kind: "upsert-device" }>): Promise<CloudWriteResult> { return (await this.write([operation]))[0]!; }
}

export type CloudMutableRecord = CloudRecipe | CloudRecipeNote | CloudComparison | CloudUserSettings | CloudDevice;
