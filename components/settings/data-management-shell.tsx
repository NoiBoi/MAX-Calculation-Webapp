"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  downloadText,
  safeExportFilename,
} from "@/lib/export/laboratory-export";
import {
  createLocalBackup,
  importApplicationCalculation,
  importOwnedRecord,
  previewApplicationCalculation,
  previewBackup,
  previewOwnedRecord,
  restoreBackup,
  serializeBackup,
  type BackupPreview,
  type CalculationImportPreview,
  type ConflictResolution,
  type MaxStoichBackup,
  type OwnedRecordImportPreview,
} from "@/lib/persistence/backup";
import type {
  IntegrityResult,
  WorkspaceLayout,
} from "@/lib/persistence/entities";
import { useAccountRepositories } from "@/components/cloud/use-account-repositories";
import {
  DEFAULT_ATOMIC_RADIUS_REGISTRY,
  RADIUS_DESCRIPTOR_DISCLAIMER,
} from "@max-stoich/chemistry-engine";
import { UserSettingsPanel } from "./user-settings-panel";
import { writeAppearanceBootstrap } from "@/lib/theme/theme";
import { AppHeader, PageContainer } from "@/components/site/app-header";

export function DataManagementShell() {
  const repositories = useAccountRepositories();
  const [layouts, setLayouts] = useState<readonly WorkspaceLayout[]>([]);
  const [backup, setBackup] = useState<MaxStoichBackup>();
  const [backupPreview, setBackupPreview] = useState<BackupPreview>();
  const [calculationPreview, setCalculationPreview] =
    useState<CalculationImportPreview>();
  const [recordPreview, setRecordPreview] =
    useState<OwnedRecordImportPreview>();
  const [storage, setStorage] = useState<
    Readonly<{ usage?: number; quota?: number }>
  >({});
  const [importText, setImportText] = useState("");
  const [resolution, setResolution] =
    useState<ConflictResolution>("keep-local");
  const [integrity, setIntegrity] = useState<IntegrityResult>();
  const [status, setStatus] = useState("Opening local data management…");
  const refresh = useCallback(async () => {
    setLayouts(await repositories.listLayouts());
    setIntegrity(await repositories.checkIntegrity());
  }, [repositories]);
  useEffect(() => {
    let active = true;
    void repositories.database
      .open()
      .then(refresh)
      .then(async () => {
        if (navigator.storage?.estimate)
          setStorage(await navigator.storage.estimate());
        if (active) setStatus("Local data ready");
      })
      .catch(
        (error) =>
          active &&
          setStatus(
            `Data management blocked: ${error instanceof Error ? error.message : "database error"}`,
          ),
      );
    return () => {
      active = false;
    };
  }, [refresh, repositories]);
  const createBackup = async () => {
    const created = await createLocalBackup(repositories.database);
    setBackup(created);
    setStatus(
      `Backup ready · ${created.manifest.counts.snapshots} snapshots · digest ${created.manifest.manifestDigest.slice(0, 12)}…`,
    );
  };
  const readFile = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    setImportText(text);
    setBackupPreview(undefined);
    setCalculationPreview(undefined);
    setRecordPreview(undefined);
    try {
      const parsed = JSON.parse(text) as { recordType?: string };
      if (parsed.recordType === "max-stoich-local-backup")
        setBackupPreview(await previewBackup(text, repositories.database));
      else if (
        [
          "max-stoich-saved-recipe",
          "max-stoich-saved-route",
          "max-stoich-comparison-workspace",
        ].includes(parsed.recordType ?? "")
      )
        setRecordPreview(await previewOwnedRecord(text, repositories.database));
      else setCalculationPreview(await previewApplicationCalculation(text));
    } catch {
      setCalculationPreview(await previewApplicationCalculation(text));
    }
    setStatus("Import preview complete; no local records were changed.");
  };
  const restore = async (mode: "merge" | "replace") => {
    if (!backupPreview?.valid) return;
    if (
      mode === "replace" &&
      !window.confirm(
        "Replace every local MAXCalc record with this verified backup? A safety backup will be created first.",
      )
    )
      return;
    const outcome = await restoreBackup(
      importText,
      repositories.database,
      mode,
      resolution,
    );
    const restoredLocalOnly =
      (await repositories.sync?.markUntrackedRecordsLocalOnly("restored")) ?? 0;
    writeAppearanceBootstrap((await repositories.getSettings()).appearance);
    await refresh();
    setStatus(
      `${mode === "replace" ? "Replace" : "Merge"} restore complete · ${restoredLocalOnly} restored record(s) remain local-only for sync review · safety backup digest ${outcome.safetyBackup?.manifest.manifestDigest.slice(0, 12)}…`,
    );
  };
  const saveLayout = async (source: WorkspaceLayout) => {
    const now = new Date().toISOString();
    await repositories.saveLayout({
      ...source,
      id: `layout-${crypto.randomUUID()}`,
      name: `Copy of ${source.name}`,
      builtIn: false,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });
    await refresh();
    setStatus("Saved a bounded user layout; scientific inputs were unchanged.");
  };
  const makeDefault = async (layout: WorkspaceLayout) => {
    const now = new Date().toISOString();
    const value = layout.builtIn
      ? {
          ...layout,
          id: `layout-${crypto.randomUUID()}`,
          name: `My layout · ${layout.name}`,
          builtIn: false,
          createdAt: now,
        }
      : layout;
    await repositories.saveLayout({
      ...value,
      isDefault: true,
      updatedAt: now,
    });
    await refresh();
    setStatus(`${layout.name} is the default local layout.`);
  };
  const renameLayout = async (layout: WorkspaceLayout, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || layout.builtIn || trimmed === layout.name) return;
    await repositories.saveLayout({
      ...layout,
      name: trimmed,
      updatedAt: new Date().toISOString(),
    });
    await refresh();
    setStatus(`Renamed layout to ${trimmed}.`);
  };
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <AppHeader
        activeSection="settings"
        status={status}
        title="Settings, layouts, and local data"
        contextualActions={
          <>
            <Link className="ui-button" href="/workspace">
              Workspace
            </Link>
            <Link className="ui-button" href="/compare">
              Comparison
            </Link>
          </>
        }
      />
      <PageContainer className="grid gap-4 lg:grid-cols-2" width="settings">
        <UserSettingsPanel onStatus={setStatus} repositories={repositories} />
        <section
          className="rounded border bg-white p-4"
          aria-labelledby="layouts-heading"
        >
          <h2 className="text-lg font-semibold" id="layouts-heading">
            Saved workspace layouts
          </h2>
          <p className="mt-1 text-sm">
            Layouts store bounded presentation preferences only. Target,
            precursor, batch, and results regions always remain available.
          </p>
          <button
            className="mt-2 rounded border px-2 py-1 text-sm"
            onClick={() =>
              void repositories.resetDefaultLayout().then(async () => {
                await refresh();
                setStatus("Restored the tested Simple Calculator default.");
              })
            }
          >
            Reset tested default
          </button>
          <div className="mt-3 space-y-2">
            {layouts.map((layout) => (
              <article className="rounded border p-3" key={layout.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    {layout.builtIn ? (
                      <h3 className="font-semibold">
                        {layout.name}{" "}
                        <span className="text-xs">· built in</span>
                      </h3>
                    ) : (
                      <input
                        aria-label={`Layout name for ${layout.name}`}
                        className="rounded border px-2 py-1 font-semibold"
                        defaultValue={layout.name}
                        onBlur={(event) =>
                          void renameLayout(layout, event.target.value)
                        }
                      />
                    )}
                    <p className="text-xs">
                      {layout.kind} · {layout.density} · input width{" "}
                      {layout.inputWidthPercent}% ·{" "}
                      {layout.isDefault ? "default" : "available"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded border px-2 py-1 text-sm"
                      onClick={() => void saveLayout(layout)}
                    >
                      Duplicate
                    </button>
                    <button
                      className="rounded border px-2 py-1 text-sm"
                      onClick={() => void makeDefault(layout)}
                    >
                      Set default
                    </button>
                    {!layout.builtIn && (
                      <button
                        className="rounded border border-red-300 px-2 py-1 text-sm"
                        onClick={() =>
                          void repositories
                            .deleteLayout(layout.id)
                            .then(refresh)
                        }
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section
          className="rounded border bg-white p-4"
          aria-labelledby="backup-heading"
        >
          <h2 className="text-lg font-semibold" id="backup-heading">
            Full local backup
          </h2>
          <p className="mt-1 text-sm">
            Backups include recipes, immutable revisions and snapshots, routes,
            comparisons, layouts, exact rationals, dataset versions, and a
            verified manifest. Recovery drafts are excluded.
          </p>
          <button
            className="mt-3 rounded bg-teal-800 px-3 py-2 font-semibold text-white"
            onClick={() => void createBackup()}
          >
            Create verified backup
          </button>
          {backup && (
            <div className="mt-3 rounded bg-slate-50 p-3 text-sm">
              <p>
                Schema {backup.backupSchemaVersion} · database{" "}
                {backup.databaseVersion}
              </p>
              <p>
                Recipes {backup.manifest.counts.recipes} · snapshots{" "}
                {backup.manifest.counts.snapshots} · routes{" "}
                {backup.manifest.counts.routes} · comparisons{" "}
                {backup.manifest.counts.comparisons}
              </p>
              <p className="break-all font-mono text-xs">
                Digest {backup.manifest.manifestDigest}
              </p>
              <button
                className="mt-2 rounded border px-3 py-1"
                onClick={() =>
                  downloadText(
                    safeExportFilename(
                      `max-stoich-backup-${backup.createdAt.slice(0, 10)}`,
                      "json",
                    ),
                    serializeBackup(backup),
                    "application/json;charset=utf-8",
                  )
                }
              >
                Download backup JSON
              </button>
            </div>
          )}
        </section>
        <section
          className="rounded border bg-white p-4 lg:col-span-2"
          aria-labelledby="restore-heading"
        >
          <h2 className="text-lg font-semibold" id="restore-heading">
            Preview restore or application JSON import
          </h2>
          <p className="mt-1 text-sm">
            Accepted formats: MAXCalc full backup, complete saved
            calculation, saved recipe, saved route, and comparison JSON.
            Arbitrary JSON, CSV, spreadsheets, code, and HTML are rejected.
          </p>
          <input
            accept="application/json,.json"
            aria-label="Choose MAXCalc JSON file"
            className="mt-3 block w-full rounded border p-2"
            onChange={(event) => void readFile(event.target.files?.[0])}
            type="file"
          />
          {backupPreview && (
            <div
              className={`mt-3 rounded border p-3 ${backupPreview.valid ? "border-teal-400 bg-teal-50" : "border-red-400 bg-red-50"}`}
            >
              <h3 className="font-semibold">
                Backup preview · {backupPreview.valid ? "verified" : "blocked"}
              </h3>
              <p className="text-sm">
                Records:{" "}
                {Object.values(backupPreview.counts).reduce(
                  (sum, value) => sum + (value ?? 0),
                  0,
                )}{" "}
                · conflicts {backupPreview.conflicts.length}
              </p>
              {backupPreview.diagnostics.map((item) => (
                <p className="text-sm" key={`${item.code}-${item.path}`}>
                  {item.code}: {item.message}
                </p>
              ))}
              {backupPreview.conflicts.map((item) => (
                <p className="text-xs" key={`${item.table}-${item.id}`}>
                  {item.table}/{item.id}: {item.kind} · {item.proposedAction}
                </p>
              ))}
              {backupPreview.valid && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="text-sm">
                    Merge conflicts{" "}
                    <select
                      className="rounded border px-2 py-1"
                      onChange={(event) =>
                        setResolution(event.target.value as ConflictResolution)
                      }
                      value={resolution}
                    >
                      <option value="keep-local">Keep local</option>
                      <option value="import-as-new">
                        Import under new identity
                      </option>
                    </select>
                  </label>
                  <button
                    className="rounded border px-3 py-1"
                    onClick={() => void restore("merge")}
                  >
                    Merge verified backup
                  </button>
                  <button
                    className="rounded border border-red-400 px-3 py-1 text-red-900"
                    onClick={() => void restore("replace")}
                  >
                    Replace local data…
                  </button>
                </div>
              )}
            </div>
          )}
          {calculationPreview && (
            <div
              className={`mt-3 rounded border p-3 ${calculationPreview.valid ? "border-teal-400 bg-teal-50" : "border-red-400 bg-red-50"}`}
            >
              <h3 className="font-semibold">
                Calculation import preview ·{" "}
                {calculationPreview.valid ? "verified" : "blocked"}
              </h3>
              <p className="text-sm">
                {calculationPreview.name} · target{" "}
                {calculationPreview.targetFormula} · engine{" "}
                {calculationPreview.engineVersion} · dataset{" "}
                {calculationPreview.datasetVersion} · warnings{" "}
                {calculationPreview.warningCount}
              </p>
              {calculationPreview.diagnostics.map((item) => (
                <p className="text-sm" key={`${item.code}-${item.path}`}>
                  {item.code}: {item.message}
                </p>
              ))}
              {calculationPreview.valid && (
                <button
                  className="mt-2 rounded bg-teal-800 px-3 py-2 text-white"
                  onClick={() =>
                    void importApplicationCalculation(
                      importText,
                      repositories,
                    ).then(async () => {
                      await refresh();
                      setStatus(
                        "Imported historical calculation as a new immutable recipe without recalculation.",
                      );
                    })
                  }
                >
                  Import as new recipe
                </button>
              )}
            </div>
          )}
          {recordPreview && (
            <div
              className={`mt-3 rounded border p-3 ${recordPreview.valid ? "border-teal-400 bg-teal-50" : "border-red-400 bg-red-50"}`}
            >
              <h3 className="font-semibold">
                Application record preview ·{" "}
                {recordPreview.valid ? "verified" : "blocked"}
              </h3>
              <p className="text-sm">
                {recordPreview.recordType} · {recordPreview.name} · target{" "}
                {recordPreview.targetFormula ?? "not applicable"} · revision{" "}
                {recordPreview.revision ?? "not applicable"} · engine{" "}
                {recordPreview.engineVersion ?? "record dependent"} · dataset{" "}
                {recordPreview.datasetVersion ?? "record dependent"} ·
                validation {recordPreview.validationStatus} · warnings{" "}
                {recordPreview.warningCount ?? 0} · digest verified · conflict{" "}
                {recordPreview.conflictStatus} · action{" "}
                {recordPreview.proposedAction}
              </p>
              {recordPreview.diagnostics.map((item) => (
                <p className="text-sm" key={`${item.code}-${item.path}`}>
                  {item.code}: {item.message}
                </p>
              ))}
              {recordPreview.valid &&
                recordPreview.proposedAction !== "skip" && (
                  <button
                    className="mt-2 rounded bg-teal-800 px-3 py-2 text-white"
                    onClick={() =>
                      void importOwnedRecord(importText, repositories).then(
                        async () => {
                          await refresh();
                          setStatus(
                            "Imported verified application record under a new identity; historical content was preserved.",
                          );
                        },
                      )
                    }
                  >
                    Import verified record
                  </button>
                )}
            </div>
          )}
        </section>
        <section className="rounded border bg-white p-4">
          <h2 className="text-lg font-semibold">Integrity and diagnostics</h2>
          <p className="mt-1 text-sm">
            Startup and full scan:{" "}
            {integrity?.valid
              ? "valid"
              : `${integrity?.diagnostics.length ?? 0} diagnostic(s)`}
          </p>
          <p className="mt-1 text-sm">
            Browser storage:{" "}
            {storage.usage === undefined
              ? "estimate unavailable"
              : `${(storage.usage / 1_048_576).toFixed(1)} MB used of ${((storage.quota ?? 0) / 1_048_576).toFixed(0)} MB`}
            . IndexedDB and secure digest support are required.
          </p>
          {storage.quota &&
            storage.usage &&
            storage.usage / storage.quota > 0.8 && (
              <p className="mt-1 font-semibold text-amber-900">
                Storage is over 80% full. Create a backup and free browser
                storage before adding records.
              </p>
            )}
          <button
            className="mt-2 rounded border px-3 py-1"
            onClick={() =>
              downloadText(
                "max-stoich-diagnostics.json",
                JSON.stringify(
                  {
                    generatedAt: new Date().toISOString(),
                    integrity,
                    storage,
                    browser: navigator.userAgent,
                  },
                  null,
                  2,
                ),
                "application/json",
              )
            }
          >
            Export diagnostic log
          </button>
          <button
            className="ml-2 mt-2 rounded border border-red-400 px-3 py-1 text-red-900"
            onClick={() => {
              if (
                window.confirm(
                  "Clear all local MAXCalc data? Create and download a backup first. This cannot be undone.",
                )
              )
                void repositories
                  .deleteDatabase()
                  .then(() =>
                    setStatus(
                      "Local database cleared. Reload to start with an empty database.",
                    ),
                  );
            }}
          >
            Clear local data…
          </button>
        </section>
        <section className="rounded border bg-white p-4">
          <h2 className="text-lg font-semibold">Atomic-radius datasets</h2>
          <p className="mt-1 text-sm">
            Installed datasets: {DEFAULT_ATOMIC_RADIUS_REGISTRY.datasets.length}
            . Source-verified for screening:{" "}
            {DEFAULT_ATOMIC_RADIUS_REGISTRY.usableDatasets.length}.
            Lab-approved:{" "}
            {DEFAULT_ATOMIC_RADIUS_REGISTRY.approvedDatasets.length}.
          </p>
          <div className="mt-3 space-y-2">
            {DEFAULT_ATOMIC_RADIUS_REGISTRY.datasets.map((dataset) => (
              <article className="rounded border p-3" key={dataset.datasetId}>
                <h3 className="font-semibold">{dataset.name}</h3>
                <p className="text-xs">
                  {dataset.definition} · version {dataset.datasetVersion} ·{" "}
                  {dataset.coverage.elements.length} elements ·{" "}
                  {dataset.approval.status} · laboratory approval{" "}
                  {dataset.approval.labApproval}
                </p>
                <p className="mt-1 text-xs">{dataset.definitionDetail}</p>
                <a
                  className="text-xs underline"
                  href={dataset.source.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Primary source
                  {dataset.source.doi ? ` · DOI ${dataset.source.doi}` : ""}
                </a>
                {dataset.parsingWarnings.map((warning) => (
                  <p className="mt-1 text-xs text-slate-600" key={warning}>
                    {warning}
                  </p>
                ))}
              </article>
            ))}
          </div>
          <p className="mt-3 text-sm font-semibold">
            {RADIUS_DESCRIPTOR_DISCLAIMER}
          </p>
        </section>
      </PageContainer>
    </main>
  );
}
