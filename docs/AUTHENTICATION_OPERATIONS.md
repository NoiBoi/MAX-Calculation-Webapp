# Authentication operations

## Production policy

MAXCalc production is invitation-only. Both controls are required:

- `NEXT_PUBLIC_AUTH_SIGNUPS_ENABLED=false` hides application signup affordances.
- Supabase Auth `enable_signup=false` and `auth.email.enable_signup=false` reject direct provider signup.

Run `npm run security:auth-provider` with `.env.local` configured before each release. The command reads the public Supabase Auth settings endpoint, transmits no credentials beyond the public anon key, creates no user, and fails when application and provider policies differ.

Production uses `https://maxcalc.vercel.app` as Site URL. Allowed callbacks are the production callback and explicit localhost development callbacks. Preview authentication is disabled unless an exact preview callback is deliberately added.

## Email operations

Supabase Auth owns confirmation and password-reset email. Private-lab invitation records currently return a one-time secure link for deliberate delivery; the application does not claim automated lab-invitation email delivery.

Before declaring email ready:

1. Configure custom SMTP in the Supabase dashboard or project configuration using provider secrets stored outside source control.
2. Use a verified sender such as `MAXCalc <no-reply@approved-domain>`.
3. Set reply-to to the supported lab contact mailbox.
4. Keep email confirmation enabled, minimum resend frequency at least one minute, and OTP expiry at one hour or less.
5. Test receipt, rendering, expiry, revocation, reuse, unsafe redirects, password reset, and password change with disposable accounts.
6. Record sender, recipient test domain, timestamps, delivery result, and Supabase log correlation without recording tokens.

Required template content: MAXCalc identity, purpose, destination domain, expiration, security warning, inquiry contact, and no recipe/note content.

SMTP secrets must never use `NEXT_PUBLIC_`, enter Vercel preview logs, or be included in diagnostics. Until actual messages are sent and received, SMTP is **pending**, not passed.

## Abuse controls

Supabase Auth rate limits login, signup, token refresh, verification, and email delivery. MAXCalc does not implement a competing password limiter. Application routes additionally require same-origin JSON requests, enforce bounded payloads, validate schemas, and return non-enumerating authentication errors.

