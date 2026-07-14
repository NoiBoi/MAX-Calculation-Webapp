import { z } from "zod";
import {
  ElementSymbolSchema,
  IsoTimestampSchema,
  PositiveDecimalStringSchema,
} from "./schemas";

export const DataSourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  organization: z.string().min(1),
  url: z.url(),
  doi: z.string().optional(),
  accessedAt: IsoTimestampSchema,
});

const AtomicWeightPointSchema = z.object({
  kind: z.literal("point"),
  value: PositiveDecimalStringSchema,
  uncertainty: PositiveDecimalStringSchema.optional(),
});

const AtomicWeightIntervalSchema = z.object({
  kind: z.literal("interval"),
  lower: PositiveDecimalStringSchema,
  upper: PositiveDecimalStringSchema,
});

export const AtomicWeightSchema = z.discriminatedUnion("kind", [
  AtomicWeightPointSchema,
  AtomicWeightIntervalSchema,
]);

export const ElementRecordSchema = z.object({
  atomicNumber: z.number().int().min(1).max(118),
  symbol: ElementSymbolSchema,
  name: z.string().min(1),
  standardAtomicWeight: AtomicWeightSchema,
  calculationValue: PositiveDecimalStringSchema,
  calculationValuePolicy: z.enum([
    "point-value",
    "abridged-standard-value",
    "interval-midpoint",
    "user-specified",
  ]),
  sourceIds: z.array(z.string().min(1)).min(1),
  notes: z.string().optional(),
});

export const ElementDataSetSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  dataVersion: z.string().regex(/^\d{4}\.\d+\.\d+$/),
  title: z.string().min(1),
  effectiveDate: z.iso.date(),
  unit: z.literal("g/mol"),
  sources: z.array(DataSourceSchema).min(1),
  elements: z.array(ElementRecordSchema).min(1),
});

export type ElementDataSet = z.infer<typeof ElementDataSetSchema>;
// Compatibility names now route through the approval-gated registry schema.
export { ApprovedAtomicRadiusRecordSchema as AtomicRadiusRecordSchema, ApprovedAtomicRadiusDatasetSchema as AtomicRadiusDataSetSchema } from "./radius-data";
export type { AtomicRadiusDataset as AtomicRadiusDataSet } from "./radius-data";
