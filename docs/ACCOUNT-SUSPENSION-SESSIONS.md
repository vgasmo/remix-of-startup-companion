# Server-side account suspension

Verified 14 November 2026 against the official Auth documentation, SDK source and Auth server source.

## Supported implementation

`set-account-status` requires a server-verified approved administrator and `denyIfAccountInactive`. It refuses self-suspension and suspension of other administrators. Suspension first persists `profiles.account_status = 'suspended'`, activating existing restrictive RLS and account guards, then calls the server-only `auth.admin.updateUserById(userId, { ban_duration: '876000h' })`. A failed Auth call returns an error but leaves the restrictive profile status in place; retrying the same command is safe. Reactivation retains the existing `ban_duration: 'none'` workflow.

## What this does and does not revoke

- A ban blocks new sign-ins and refresh-token grants while it remains active, on every device.
- The Auth server's `User.Ban` updates `banned_until`; it does not delete sessions or refresh tokens. A ban is therefore not permanent session revocation. Retained refresh tokens could become usable after unbanning, subject to session validity and Auth configuration.
- The supported `auth.admin.signOut(targetAccessJwt, 'global')` deletes the target user's sessions/refresh tokens, but requires a valid target-user access JWT, not a user ID. The administrator's JWT would revoke the administrator's sessions instead.
- This workflow has no target JWT, and does not acquire it, mint a replacement identity, reset passwords or directly mutate managed `auth.sessions`/`auth.refresh_tokens`. Consequently permanent global session deletion is not implemented or claimed.
- Previously issued access JWTs retain their cryptographic validity until their `exp`, even after global sign-out. Immediate operational denial relies on the existing account-status RLS and server account guards, not JWT validation alone. No hosted JWT lifetime is assumed or changed. Data already downloaded cannot be recalled.
- `ProtectedRoute` and browser storage are unchanged. No frontend publication or P05 migration is needed; the backup table remains intact.

## Sources

- https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid
- https://supabase.com/docs/guides/auth/signout
- https://supabase.com/docs/guides/auth/sessions
- https://github.com/supabase/auth-js/blob/master/src/GoTrueAdminApi.ts (`signOut(jwt, scope)`)
- https://github.com/supabase/auth/blob/master/internal/api/admin.go (`adminUserUpdate`)
- https://github.com/supabase/auth/blob/master/internal/models/user.go (`User.Ban`)
- https://github.com/supabase/auth/blob/master/internal/api/logout.go (`Logout`)
- https://github.com/supabase/auth/blob/master/internal/tokens/service.go (`RefreshTokenGrant`: rejects banned users)

## Verification limits

Handler tests exercise the actual handler with mocked Auth/database boundaries, including administrator authorization, ban/unban values, operation order and failures. They do not certify hosted Auth session deletion or a real multi-device suspension. No real account was suspended during this verification.