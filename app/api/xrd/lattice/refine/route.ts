import { latticeRefinementRequestSchema } from "@/lib/xrd/stage4";
import { invalidRequest, scientificServiceRequest } from "@/lib/xrd/server";

export async function POST(request: Request) {
  const parsed = latticeRefinementRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidRequest(parsed.error.issues[0]?.message);
  return scientificServiceRequest("/v1/xrd/lattice/refine", { method: "POST", body: JSON.stringify(parsed.data) });
}
