import data from "@/data/default-precursors.json";
import type { RegisteredPrecursorDefinition } from "@max-stoich/chemistry-engine";

export const DEFAULT_PRECURSOR_REGISTRY: readonly RegisteredPrecursorDefinition[] = Object.freeze(
  data.precursors.map((item) => Object.freeze({ ...item })) as RegisteredPrecursorDefinition[],
);
