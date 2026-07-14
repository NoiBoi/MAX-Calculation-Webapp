import { writeRadiusDataset } from "./radius-ingest";

export const CORDERO_METADATA = {
  datasetId: "cordero-covalent-2008", datasetVersion: "2008.1.0", name: "Cordero et al. covalent radii", definition: "covalent" as const,
  definitionDetail: "Covalent radii derived from crystallographic bond distances; Table 2 values in angstroms normalized to pm.",
  source: { sourceId: "cordero-2008", title: "Covalent radii revisited", primarySource: "Dalton Transactions 2008, 2832–2838, Table 2", editionOrVersion: "2008 article", publicationYear: "2008", url: "https://doi.org/10.1039/B801115J", doi: "10.1039/B801115J", accessedAt: "2026-07-14" },
  coordinationPolicy: "Source Table 2 conventions apply; carbon defaults to sp3 and listed transition-metal defaults are explicitly identified.", oxidationStatePolicy: "Not selected by oxidation state.", spinStatePolicy: "High-spin default and low-spin alternatives are retained for Mn, Fe, and Co.",
  approval: { status: "source-verified" as const, sourceVerified: true, labApproval: "not-reviewed" as const }, parsingWarnings: ["Reviewed structured transcription used; the publisher article is not redistributed.", "Source-estimated or extrapolated values are marked."],
};
await writeRadiusDataset("scripts/data-ingest/fixtures/cordero-covalent-2008.tsv", "data/radius-sets/cordero-covalent-2008.json", CORDERO_METADATA);
