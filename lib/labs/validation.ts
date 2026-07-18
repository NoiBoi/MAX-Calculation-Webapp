import { parseFormula } from "@max-stoich/chemistry-engine";
import { z } from "zod";
import { validateRevisionAndSnapshot, validateRecipeNoteForCloud } from "../cloud/validation";
import type { CalculationSnapshot, RecipeNote, RecipeRevision, SavedRecipe } from "../persistence/entities";
import type { PublishLabRequest } from "./types";

export const labRoleSchema = z.enum(["admin", "member", "viewer"]);
export const retentionDaysSchema = z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]);
export const publishLabRequestSchema = z.object({
  labId: z.string().uuid(),
  entryId: z.string().uuid().optional(),
  expectedEntryVersion: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(240),
  description: z.string().max(4_000),
  recipeId: z.string().min(1),
  revisionId: z.string().min(1),
  publicationNote: z.string().max(4_000),
  selectedNoteIds: z.array(z.string().min(1)).max(50),
  acknowledgeTargetChange: z.boolean().optional(),
  sourceDeviceId: z.string().min(1).max(200),
  requestId: z.string().min(8).max(240),
});

export async function validatePublicationSource(
  request: PublishLabRequest,
  recipe: SavedRecipe,
  revision: RecipeRevision,
  snapshot: CalculationSnapshot,
  notes: readonly RecipeNote[],
): Promise<void> {
  publishLabRequestSchema.parse(request);
  if (recipe.id !== request.recipeId || revision.id !== request.revisionId || revision.recipeId !== recipe.id) throw new Error("The selected personal recipe revision is unavailable.");
  if (snapshot.recipeRevisionId !== revision.id || snapshot.recipeId !== recipe.id) throw new Error("The selected revision has no matching immutable calculation snapshot.");
  if (!parseFormula(revision.inputState.targetFormula).success) throw new Error("The publication target formula is invalid.");
  await validateRevisionAndSnapshot(revision, snapshot);
  if (snapshot.result.status !== "success" && snapshot.result.status !== "success-with-warnings") throw new Error("Only a valid calculated revision can be published.");
  if (snapshot.result.errors.length) throw new Error("A calculation with blocking scientific errors cannot be published.");
  const selected = new Set(request.selectedNoteIds);
  for (const note of notes) {
    if (!selected.has(note.id)) continue;
    if (note.recipeId !== recipe.id || note.archived || note.recipeRevisionId && note.recipeRevisionId !== revision.id) throw new Error("A selected note is archived or belongs to another recipe revision.");
    validateRecipeNoteForCloud(note);
  }
  if (selected.size !== notes.filter((note) => selected.has(note.id)).length) throw new Error("One or more selected notes no longer exist.");
}
