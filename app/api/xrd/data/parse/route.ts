import { xrdParserOverrideSchema } from "@/lib/xrd/schemas";
import { invalidRequest, scientificServiceRequest } from "@/lib/xrd/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const maximum = Number(process.env.XRD_MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximum + 1024 * 1024) return invalidRequest(`The XRD upload exceeds the ${maximum} byte limit.`);
  const form = await request.formData().catch(() => null);
  if (!form) return invalidRequest("A multipart XRD file upload is required.");
  const file = form.get("file");
  if (!(file instanceof File)) return invalidRequest("Select an XRD text file.");
  if (file.size > maximum) return invalidRequest(`The XRD file exceeds the ${maximum} byte limit.`);
  const rawConfig = form.get("parserConfig");
  let config: unknown = {};
  try { config = typeof rawConfig === "string" ? JSON.parse(rawConfig) : {}; } catch { return invalidRequest("Parser settings must be valid JSON."); }
  const parsed = xrdParserOverrideSchema.safeParse(config);
  if (!parsed.success) return invalidRequest(parsed.error.issues[0]?.message);
  const forwarded = new FormData();
  forwarded.set("file", file, file.name);
  forwarded.set("parserConfig", JSON.stringify(parsed.data));
  return scientificServiceRequest("/v1/xrd/data/parse", { method: "POST", body: forwarded });
}
