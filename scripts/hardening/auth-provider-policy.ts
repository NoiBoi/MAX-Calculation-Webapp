export interface SupabasePublicAuthSettings {
  disable_signup?: boolean;
  mailer_autoconfirm?: boolean;
  external?: {
    email?: boolean;
  };
}

export function evaluateAuthProviderPolicy(
  settings: SupabasePublicAuthSettings,
  expectedSignupEnabled: boolean,
) {
  const providerSignupEnabled = settings.disable_signup === false;
  const emailProviderEnabled = settings.external?.email === true;

  return {
    applicationSignupEnabled: expectedSignupEnabled,
    providerSignupEnabled,
    emailProviderEnabled,
    consistent:
      providerSignupEnabled === expectedSignupEnabled && emailProviderEnabled,
    emailConfirmationRequired: settings.mailer_autoconfirm === false,
  };
}
