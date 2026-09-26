import { matchingRequestSchema } from "@/lib/xrd/stage4";
import { invalidRequest, scientificServiceRequest } from "@/lib/xrd/server";

export async function POST(request: Request) {
  const parsed = matchingRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidRequest(parsed.error.issues[0]?.message);
  return scientificServiceRequest("/v1/xrd/reference/match", { method: "POST", body: JSON.stringify(parsed.data) });
}
