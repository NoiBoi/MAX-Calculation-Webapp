# MAXCalc documentation

This index groups current documentation by purpose. Historical implementation reports are kept separately and are not the source of truth for current behavior.

## User guides

- [XRD analysis](XRD.md): experimental import, processing, peak fitting, references, matching, lattice refinement, and publication export
- [EMI analysis](EMI_ANALYSIS.md): S-parameter import, analysis flow, persistence, and exports
- [EMI electrical properties](EMI_ELECTRICAL_PROPERTIES.md): thickness, four-point-probe measurements, conductivity, and Simon estimates
- [EMI frequency graphs](EMI_GRAPHS.md): plotted quantities, overlays, and interpretation
- [EMI publication figures](EMI_PUBLICATION_FIGURES.md): figure specifications and export formats
- [backup and restore](BACKUP_AND_RESTORE.md): local backup, restore, and cloud-sync boundaries
- [keyboard shortcuts](KEYBOARD_SHORTCUTS.md): calculator and comparison shortcuts
- [synchronization troubleshooting](SYNC_TROUBLESHOOTING.md): account-sync recovery checks

## Scientific methods

- [chemistry rules](CHEMISTRY_RULES.md): formulas, sites, matrices, solver rules, adjustments, and warnings
- [scientific engine architecture](SCIENTIFIC_ENGINE_ARCHITECTURE.md): chemistry-engine boundaries and invariants
- [data provenance](DATA_PROVENANCE.md): atomic-weight, radius, precursor, and persisted provenance policy
- [dataset trust](DATASET_TRUST.md): review and laboratory-approval states
- [EMI scientific foundation](EMI_SCIENTIFIC_FOUNDATION.md): equations, assumptions, statistics, and interpretation limits
- [XRD analysis](XRD.md): processing, fitting, crystallographic references, matching, refinement, and scientific limits
- [scientific formatting](SCIENTIFIC_FORMATTING.md): display and export conventions
- [diagnostic presentation policy](DIAGNOSTIC_PRESENTATION_POLICY.md): how scientific warnings and diagnostics are presented

## Developer documentation

- [architecture](ARCHITECTURE.md): system layers and dependency direction
- [codebase guide](CODEBASE_GUIDE.md): repository map and common contributor tasks
- [contributing](CONTRIBUTING.md): change workflow and definition of done
- [testing](TESTING.md): verification commands and test layers
- [local persistence](LOCAL_PERSISTENCE_ARCHITECTURE.md): IndexedDB records, migrations, and recovery
- [cloud authentication](CLOUD_AUTH_ARCHITECTURE.md) and [cloud synchronization](CLOUD_SYNC_ARCHITECTURE.md)
- [database schema](DATABASE_SCHEMA.md): Supabase storage and authorization model
- [UI architecture](UI_ARCHITECTURE.md), [responsive layout](RESPONSIVE_LAYOUT.md), and [theme architecture](THEME_ARCHITECTURE.md)
- [print and summary architecture](PRINT_EXPORT_ARCHITECTURE.md)

## Operations

- [deployment](DEPLOYMENT.md): Vercel, Supabase, and XRD scientific-service setup
- [authentication operations](AUTHENTICATION_OPERATIONS.md): signup, email, and abuse controls
- [security](SECURITY.md): trust boundaries and operational requirements
- [private lab libraries](PRIVATE_LAB_LIBRARIES.md) and [retention](RETENTION.md)
- [laboratory acceptance plan](LAB_ACCEPTANCE_PLAN.md) and [results template](LAB_ACCEPTANCE_RESULTS_TEMPLATE.md)

## Historical records

- [XRD implementation history](history/xrd/README.md)
- Release, audit, baseline, and implementation-report files elsewhere in `docs/` record earlier verification work. They may contain version-specific results and are not current user guides.
