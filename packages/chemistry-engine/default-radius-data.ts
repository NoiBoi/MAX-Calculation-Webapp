import teatum from "../../data/radius-sets/teatum-metallic-cn12.json";
import cordero from "../../data/radius-sets/cordero-covalent-2008.json";
import rahm from "../../data/radius-sets/rahm-atomic-2016.json";
import registry from "../../data/radius-sets/registry.json";
import { createAtomicRadiusRegistry } from "./radius-data";

export const DEFAULT_ATOMIC_RADIUS_REGISTRY = createAtomicRadiusRegistry(
  [teatum, cordero, rahm],
  Object.fromEntries(registry.datasets.map((item) => [item.datasetId, item.digest])),
  registry.defaultDatasetId,
);
