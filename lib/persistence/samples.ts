import type { MaxStoichDatabase } from "./database";

export interface LocalSample {
  readonly schemaVersion: "1.0.0";
  readonly id: string;
  readonly label: string;
  readonly recipeId: string;
  readonly recipeRevisionId: string;
  readonly createdAt: string;
}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function createLabel() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return "M-" + Array.from(bytes, (byte) => ALPHABET[byte & 31]).join("");
}

export function findSample(database: MaxStoichDatabase, input: string) {
  const compact = input.toUpperCase().replace(/[\s-]/g, "");
  const body = (compact.length === 11 && compact.startsWith("M") ? compact.slice(1) : compact)
    .replace(/O/g, "0").replace(/[IL]/g, "1");
  if (body.length !== 10 || [...body].some((character) => !ALPHABET.includes(character))) {
    throw new Error("Enter an ID in the form M- followed by 10 characters.");
  }
  return database.samples.where("label").equals(`M-${body}`).first();
}

export function registerSample(database: MaxStoichDatabase, revisionId: string) {
  return database.transaction("rw", [database.samples, database.recipeRevisions, database.recipes, database.snapshots], async () => {
    const revision = await database.recipeRevisions.get(revisionId);
    const recipe = revision && await database.recipes.get(revision.recipeId);
    const snapshot = revision && await database.snapshots.get(revision.snapshotId);
    if (!recipe || !revision || snapshot?.recipeRevisionId !== revision.id || snapshot.recipeId !== recipe.id) {
      throw new Error("The saved recipe revision or its calculation snapshot is unavailable.");
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const label = createLabel();
      if (await database.samples.where("label").equals(label).count()) continue;
      const sample: LocalSample = { schemaVersion: "1.0.0", id: crypto.randomUUID(), label, recipeId: recipe.id, recipeRevisionId: revision.id, createdAt: new Date().toISOString() };
      await database.samples.add(sample);
      return sample;
    }
    throw new Error("Could not issue an unused sample ID. Try again.");
  });
}
