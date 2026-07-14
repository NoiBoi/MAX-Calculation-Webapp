import { writeRadiusDataset } from "./radius-ingest";

export const RAHM_METADATA = {
  datasetId: "rahm-neutral-isodensity-2016", datasetVersion: "2016.1.0", name: "Rahm–Hoffmann–Ashcroft neutral-atom radii", definition: "neutral-isodensity" as const,
  definitionDetail: "Radius of an isolated neutral atom at electron density 0.001 e/bohr³ from relativistic all-electron DFT; angstrom values normalized to pm.",
  source: { sourceId: "rahm-2016", title: "Atomic and Ionic Radii of Elements 1–96", primarySource: "Chemistry – A European Journal 2016 and Supporting Information Table S1", editionOrVersion: "2016 article", publicationYear: "2016", url: "https://doi.org/10.1002/chem.201602949", doi: "10.1002/chem.201602949", accessedAt: "2026-07-14", sourceDigest: "b59a4176174662f1e5541c2c3abe365266a653f4e3a8868b3ca038ebccca46db" },
  coordinationPolicy: "Isolated neutral atoms; coordination is not applicable.", oxidationStatePolicy: "Neutral atoms only.", spinStatePolicy: "Electronic-structure method follows the primary article and SI.",
  approval: { status: "provisional" as const, sourceVerified: false, labApproval: "not-reviewed" as const }, parsingWarnings: ["Primary article retrieved and definition verified.", "Wiley blocked retrieval of the full Supporting Information during this build; values were cross-checked against a provenance-rich Table S1 transcription and therefore remain provisional."],
};
await writeRadiusDataset("scripts/data-ingest/fixtures/rahm-atomic-2016.tsv", "data/radius-sets/rahm-atomic-2016.json", RAHM_METADATA);
