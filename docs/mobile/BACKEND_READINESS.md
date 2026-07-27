# Mobile Backend Readiness

## Executive assessment

The existing backend is a strong foundation for a mobile client. Most product capabilities are
already exposed as authenticated JSON, multipart, SSE, or WebSocket interfaces and authentication
middleware accepts bearer JWTs. The mobile app should use the same domain services and records as the
web client.

Local credentials and two-factor authentication are now ready for native clients through dedicated,
installation-scoped mobile sessions. Web sessions continue to use `SameSite=strict` HTTP-only
cookies. Social login still requires PKCE and universal-link exchange before it can ship natively.

## Capability matrix

| Capability                   | Current backend                                | Mobile status | Required work                                                                  |
| ---------------------------- | ---------------------------------------------- | ------------- | ------------------------------------------------------------------------------ |
| Local login and registration | Dedicated native token contract                | Ready         | Reuse mobile login/register flow                                               |
| Access-token auth            | Passport bearer JWT                            | Ready         | Reuse existing middleware                                                      |
| Token refresh                | Cookie for web; rotating body grant for mobile | Ready         | Monitor replay revocations                                                     |
| Logout and revocation        | Device-scoped mobile session endpoints         | Ready         | Add account UI for remote-device management                                    |
| OAuth/social login           | Browser callback and cookie session            | Blocked       | Authorization Code + PKCE, one-time exchange code, app/universal link callback |
| Two-factor auth              | JSON temp-token flow                           | Ready         | Adapt screens and store temp tokens in memory only                             |
| Conversations and messages   | JSON plus SSE                                  | Ready         | Consume with `expo/fetch` streaming and cancellation                           |
| Cooking chat                 | SSE with bearer auth                           | Ready         | Reuse; test background/interruption behavior                                   |
| Recipe library               | Cursor-capable JSON endpoints                  | Ready         | Add mobile cache policies and offline snapshots                                |
| Social imports               | JSON jobs and image proxy                      | Ready         | Add OS share-sheet URL intake on client                                        |
| Files and images             | Multipart endpoints                            | Ready         | Use Expo FileSystem/File and multipart upload                                  |
| Realtime voice               | Provider session URL and WebSocket             | Partial       | Issue short-lived mobile voice grants; verify audio-session lifecycle          |
| Notifications                | No device registry                             | Missing       | Add device-token registration, preferences, dispatch, receipt cleanup          |
| Deep links                   | Web routes                                     | Partial       | Define `rekky://` and `https://rekky.ai/app/*` link contracts                  |

## Implemented authentication contract

### `POST /api/auth/mobile/login`

Accepts local credentials plus a generated installation ID and device label. Returns a short-lived
access token, rotating refresh token, access expiry, refresh expiry, mobile session ID, and sanitized
user. The refresh token is shown once and stored only in SecureStore/Keychain/Keystore.

### `POST /api/auth/mobile/refresh`

Accepts the refresh token in the JSON body, verifies the hashed session record, rotates it on every
use, and returns a new access/refresh pair. Reuse of a rotated token revokes that mobile session and
is recorded as a security event.

### `POST /api/auth/mobile/logout`

Revokes the current mobile session. A separate authenticated endpoint can list and revoke other
devices from account settings.

### Supporting endpoints

- `POST /api/auth/mobile/2fa/verify` completes a TOTP or recovery-code challenge and issues the
  same mobile token pair.
- `GET /api/auth/mobile/sessions` lists the user's active mobile installations.
- `DELETE /api/auth/mobile/sessions/:id` revokes one owned installation without affecting browser
  sessions or other devices.

### OAuth with PKCE

The app generates a verifier/challenge and opens the system authentication browser. The backend
binds provider state to the challenge, completes the provider callback, and redirects to a Rekky
universal link with a one-time exchange code. The app exchanges that code and verifier for the same
mobile token pair. Provider tokens never enter the app URL or JavaScript logs.

## Security requirements

- Access tokens should be short-lived and held in memory where practical.
- Refresh tokens must be random, hashed at rest, rotated, scoped to one installation, and revocable.
- Never store user passwords or provider tokens on device.
- Apply existing login, refresh, import, and generation rate limits to native routes.
- Add installation and app-version headers for auditability, not as authentication factors.
- Use TLS only; configure Android network security and iOS ATS without broad exceptions.
- Redact authorization, refresh, one-time exchange, and push tokens from logs and crash reports.
- Add idempotency keys to mutations that may be retried after connectivity loss.

## Recommended backend order

1. Mobile session schema and rotating local-auth endpoints with tests.
2. Mobile API integration tests covering login, refresh rotation, replay, revocation, and 2FA.
3. OAuth PKCE and universal-link exchange.
4. Device/push-token registry and notification preferences.
5. Idempotency support for cooking events, saves, imports, and message submission.
