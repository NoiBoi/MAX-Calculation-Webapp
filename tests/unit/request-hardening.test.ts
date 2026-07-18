import { describe, expect, it } from "vitest";
import { validateJsonRequestHeaders } from "../../lib/security/request-guards";

const headers = (values: Record<string, string>) => new Headers(values);

describe("cloud request hardening", () => {
  it("requires JSON content types", () => {
    expect(validateJsonRequestHeaders(headers({ "content-type": "text/plain" }), 100)).toMatchObject({ status: 415, code: "UNSUPPORTED_CONTENT_TYPE" });
    expect(validateJsonRequestHeaders(headers({ "content-type": "application/json; charset=utf-8" }), 100)).toBeNull();
  });

  it("rejects oversized or malformed content lengths before parsing a body", () => {
    expect(validateJsonRequestHeaders(headers({ "content-type": "application/json", "content-length": "101" }), 100)).toMatchObject({ status: 413 });
    expect(validateJsonRequestHeaders(headers({ "content-type": "application/json", "content-length": "not-a-number" }), 100)).toMatchObject({ status: 413 });
    expect(validateJsonRequestHeaders(headers({ "content-type": "application/json", "content-length": "100" }), 100)).toBeNull();
  });
});
