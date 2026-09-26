import { processRequestSchema } from "@/lib/xrd/stage3";
import { invalidRequest, scientificServiceRequest } from "@/lib/xrd/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = processRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidRequest(parsed.error.issues[0]?.message);
  return scientificServiceRequest("/v1/xrd/data/process", { method: "POST", body: JSON.stringify(parsed.data) });
}
