import { patternSettingsSchema } from "@/lib/xrd/schemas";
import { invalidRequest, scientificServiceRequest } from "@/lib/xrd/server";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ codId: string }> }) {
  const { codId } = await context.params;
  if (!/^\d{7}$/.test(codId)) return invalidRequest("A valid seven-digit COD ID is required.");
  const parsed = patternSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidRequest(parsed.error.issues[0]?.message);
  return scientificServiceRequest(`/v1/xrd/references/cod/${codId}/pattern`, { method: "POST", body: JSON.stringify(parsed.data) });
}

