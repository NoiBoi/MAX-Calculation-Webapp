import { codSearchRequestSchema } from "@/lib/xrd/schemas";
import { invalidRequest, scientificServiceRequest } from "@/lib/xrd/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = codSearchRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidRequest(parsed.error.issues[0]?.message);
  return scientificServiceRequest("/v1/xrd/references/search", { method: "POST", body: JSON.stringify(parsed.data) });
}

