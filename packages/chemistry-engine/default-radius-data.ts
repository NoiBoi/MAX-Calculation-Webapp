import radiusSets from "../../data/radius-sets.json";
import { createAtomicRadiusRegistry } from "./radius-data";

export const DEFAULT_ATOMIC_RADIUS_REGISTRY = createAtomicRadiusRegistry(radiusSets.sets);
