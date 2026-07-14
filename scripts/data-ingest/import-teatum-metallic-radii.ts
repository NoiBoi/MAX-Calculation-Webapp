import { writeRadiusDataset } from "./radius-ingest";

export const TEATUM_METADATA = {
  datasetId: "teatum-metallic-cn12", datasetVersion: "1968.1.0", name: "Teatum–Gschneidner–Waber calculated metallic radii (CN=12)", definition: "metallic" as const,
  definitionDetail: "Calculated metallic atomic radius in angstroms for coordination number 12, transcribed from Table I and normalized to pm.",
  source: { sourceId: "teatum-la4003", title: "Compilation of Calculated Data Useful in Predicting Metallurgical Behavior of the Elements in Binary Alloy Systems", primarySource: "Los Alamos Scientific Laboratory report LA-4003 (revised compilation superseding LA-2345)", editionOrVersion: "LA-4003", publicationYear: "1968", url: "https://www.osti.gov/servlets/purl/4789465", doi: "10.2172/4789465", reportIdentifier: "LA-4003", accessedAt: "2026-07-14", sourceDigest: "a7f1140615a237ecc34a662f4e230ee3add414dfd6afa5ef25d2e93a84e96e2c" },
  coordinationPolicy: "Every installed value uses the source's CN=12 convention.", oxidationStatePolicy: "Source valence variants are retained; an explicitly declared default is used where present.", spinStatePolicy: "Not represented by the source.",
  approval: { status: "source-verified" as const, sourceVerified: true, labApproval: "not-reviewed" as const }, parsingWarnings: ["Reviewed structured transcription used because PDF text extraction is not a reliable canonical input.", "Estimated markers for C and N are preserved."],
};
await writeRadiusDataset("scripts/data-ingest/fixtures/teatum-metallic-cn12.tsv", "data/radius-sets/teatum-metallic-cn12.json", TEATUM_METADATA);
