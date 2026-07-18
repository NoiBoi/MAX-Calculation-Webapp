export type RequestGuardFailure =
  | Readonly<{ status: 413; code: "REQUEST_TOO_LARGE"; message: string }>
  | Readonly<{ status: 415; code: "UNSUPPORTED_CONTENT_TYPE"; message: string }>;

export function validateJsonRequestHeaders(
  headers: Pick<Headers, "get">,
  maximumBytes: number,
): RequestGuardFailure | null {
  const contentType = headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return { status: 415, code: "UNSUPPORTED_CONTENT_TYPE", message: "This endpoint accepts application/json requests only." };
  }
  const rawLength = headers.get("content-length");
  if (rawLength !== null) {
    const length = Number(rawLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > maximumBytes) {
      return { status: 413, code: "REQUEST_TOO_LARGE", message: `The request exceeds the ${maximumBytes}-byte limit.` };
    }
  }
  return null;
}
