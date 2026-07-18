import { describe, expect, it } from "vitest";
import { evaluateAuthProviderPolicy } from "../../scripts/hardening/auth-provider-policy";

describe("production authentication provider policy", () => {
  it("allows invited users to sign in while public signup remains disabled", () => {
    expect(
      evaluateAuthProviderPolicy(
        {
          disable_signup: true,
          external: { email: true },
          mailer_autoconfirm: false,
        },
        false,
      ),
    ).toMatchObject({
      applicationSignupEnabled: false,
      providerSignupEnabled: false,
      emailProviderEnabled: true,
      consistent: true,
      emailConfirmationRequired: true,
    });
  });

  it("rejects a disabled email provider even when the signup policy matches", () => {
    expect(
      evaluateAuthProviderPolicy(
        {
          disable_signup: true,
          external: { email: false },
          mailer_autoconfirm: false,
        },
        false,
      ).consistent,
    ).toBe(false);
  });
});
