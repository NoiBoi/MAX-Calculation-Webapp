import { NextResponse } from "next/server";

const ERROR_HEADERS = { "cache-control": "no-store", "content-type": "application/json" };

export async function scientificServiceRequest(path: string, init: RequestInit): Promise<NextResponse> {
  const baseUrl = process.env.XRD_SCIENCE_SERVICE_URL?.replace(/\/$/, "");
  if (!baseUrl) return NextResponse.json({ error: { code: "XRD_SERVICE_UNCONFIGURED", message: "XRD calculation service is not configured." } }, { status: 503, headers: ERROR_HEADERS });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (!(init.body instanceof FormData)) headers.set("content-type", "application/json");
    const token = process.env.XRD_SCIENCE_SERVICE_TOKEN;
    if (token) headers.set("x-service-token", token);
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers, cache: "no-store", signal: controller.signal });
    const body = await response.text();
    return new NextResponse(body, { status: response.status, headers: ERROR_HEADERS });
  } catch {
    return NextResponse.json({ error: { code: "XRD_SERVICE_UNAVAILABLE", message: "XRD calculation service is unavailable. Try again later." } }, { status: 503, headers: ERROR_HEADERS });
  } finally {
    clearTimeout(timeout);
  }
}

export function invalidRequest(message = "Invalid XRD request."): NextResponse {
  return NextResponse.json({ error: { code: "INVALID_REQUEST", message } }, { status: 400, headers: ERROR_HEADERS });
}
