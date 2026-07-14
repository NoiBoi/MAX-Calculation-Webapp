import seedElementData from "../../data/elements.json";
import { ElementDataSetSchema } from "./element-data-schema";

export const DEFAULT_ELEMENT_DATA = Object.freeze(ElementDataSetSchema.parse(seedElementData));
