# Rekky migration to AWS speech-to-speech

Give the following instructions to the coding agent in the Rekky repository.

---

Change Cooking Voice Mode from the previous Modal gateway architecture to a
direct AWS speech-to-speech architecture. Preserve existing uncommitted work,
inspect the worktree before editing, and do not discard unrelated changes.

## New architecture

```text
Rekky browser/mobile
    → requests a short-lived JWT from the Rekky API
    → connects directly to wss://voice.rekky.ai/v1/realtime
    → sends rekky.authenticate
    → speech-to-speech on the AWS GPU validates the JWT
    → audio streams directly between the client and AWS
```

Modal is no longer part of the active Cooking Voice Mode path.
Speech-to-speech is installed, deployed, and updated separately on AWS. Rekky
communicates with it over WSS and must not install it as a package or Git
dependency.

## Remove Modal from the active path

Remove or disable:

- Modal voice-session allocation requests.
- Load-balancer or compute-node discovery.
- Connected/disconnected gateway callbacks.
- Modal-specific `connect_url` construction.
- Modal deployment requirements for Cooking Voice Mode.
- Runtime installation or Git commit pinning of speech-to-speech inside Rekky.

Do not delete legacy Modal files unless clearly safe. They may remain as unused
legacy code until the AWS migration is verified, but no production request
should pass through them.

## Voice session API

`POST /api/cooking/voice/session` must return:

```json
{
  "connect_url": "wss://voice.rekky.ai/v1/realtime",
  "expires_at": "...",
  "token": "<signed JWT>"
}
```

Use `token`, never `session_token`. Load the URL from a server-side setting:

```text
REKKY_VOICE_CONNECT_URL=wss://voice.rekky.ai/v1/realtime
```

Do not accept the connection URL from the browser.

## JWT signing

Keep JWT signing in the Rekky API. Sign short-lived HS256 tokens containing:

```json
{
  "sub": "<authenticated user ID>",
  "iss": "rekky-api",
  "aud": "rekky-voice",
  "iat": 1730000000,
  "exp": 1730000060,
  "jti": "<cryptographically random unique ID>"
}
```

Use this JWT header:

```json
{"alg":"HS256","typ":"JWT","kid":"<configured key ID>"}
```

Required Rekky API environment variables:

```text
REKKY_VOICE_CONNECT_URL
REKKY_VOICE_JWT_SECRET
REKKY_VOICE_JWT_ISSUER
REKKY_VOICE_JWT_AUDIENCE
REKKY_VOICE_JWT_KEY_ID
```

The secret must not have a code default. Use a 60-second default token lifetime
and enforce a maximum of 300 seconds. The values must exactly match the AWS
speech-to-speech service. Never expose the secret to the browser or logs.

The AWS service now validates the algorithm, signature, key ID, issuer,
audience, timestamps, maximum lifetime, user identity, `jti`, and process-local
one-time use. Rekky signs the grant but no longer needs an active gateway to
validate it.

Every connection and reconnect must request a new token. Never retry a used
token. Document that replay protection is process-local; a future multi-worker
deployment will need sticky routing or shared atomic replay storage.

## Client connection sequence

Web and mobile must follow this order:

1. Call `POST /api/cooking/voice/session`.
2. Read `connect_url` and `token`.
3. Open the returned WebSocket.
4. Immediately after `open`, send:

```json
{"type":"rekky.authenticate","token":"<token>"}
```

5. Wait for `session.created`.
6. Send `session.update` with recipe/workspace context.
7. Wait for `session.updated`.
8. Begin microphone streaming.

Do not wait for `session.created` before authentication. Do not stream audio
before `session.updated`. A reconnect must return to grant creation first.

## Session context

Preserve the existing work that sends:

- General Cooking Voice Mode instructions.
- Current recipe markdown.
- Recipe revision.
- Serving count.
- Unit mode.
- Checked ingredients.
- Server VAD configuration.
- `interrupt_response` enabled.

Continue debouncing material canvas changes and sending another
`session.update` during active sessions. Do not put recipe or workspace state
inside the JWT.

## Audio and barge-in

Keep the existing mono PCM16, 16 kHz, approximately 40 ms audio chunks sent as
base64 `input_audio_buffer.append` events. Retain echo cancellation, noise
suppression, automatic gain control, resampling, and the local noise gate.

Confirm the actual server output sample rate rather than assuming it matches
the input rate.

When user speech begins during assistant output:

1. Clear queued playback immediately.
2. Stop the current audio source.
3. Send `response.cancel` when a response is active or pending.
4. Continue streaming the new user speech.
5. Ignore late audio/transcript deltas from the cancelled response.

## Realtime events

Ensure the shared event normalizer handles:

- `session.created`, `session.updated`, and `error`.
- Speech-started and speech-stopped events.
- Partial input transcripts.
- `conversation.item.input_audio_transcription.completed`.
- `response.audio.delta` and `response.output_audio.delta`.
- Both assistant audio-transcript delta/done naming variants.
- `response.done` and cancellation states.
- Function/tool-call events if tools are enabled.

Associate output with response/item IDs so stale packets cannot be played or
persisted as part of a newer response.

## Transcript persistence

Continue persisting completed turns through:

```text
POST /api/cooking/voice/turns
```

```json
{
  "conversationId": "...",
  "turnId": "...",
  "userText": "...",
  "assistantText": "..."
}
```

Use completed input transcription for user text, accumulate assistant deltas,
prefer the final assistant transcript, and persist only terminal turns. Keep
ownership validation, deterministic IDs, idempotent retries, and the Cooking
Voice Mode marker. Persistence failures must retry independently without
ending the voice connection. Do not send or store raw audio.

## Documentation and configuration

Update Rekky documentation to show:

```text
Browser/mobile
    → Rekky API for a short-lived token
    → direct WSS connection to AWS
    → speech-to-speech on the AWS GPU
    → OpenRouter for text reasoning
    → completed transcript persistence through Rekky API
```

Remove statements saying Modal hosts the active worker. Remove instructions
that make Rekky install or pin a speech-to-speech commit. The AWS repository is
maintained separately.

## Tests

Add or update tests proving:

- `/voice/session` returns `wss://voice.rekky.ai/v1/realtime` from
  `REKKY_VOICE_CONNECT_URL`.
- The response uses `token`, not `session_token`.
- JWT claims and `kid` are correct and every `jti` is unique.
- Web and mobile authenticate immediately after socket open.
- Neither waits for `session.created` before authenticating.
- Neither streams audio before `session.updated`.
- Reconnect obtains a fresh token.
- No Modal allocation or callback occurs.
- Recipe/workspace changes still produce debounced session updates.
- Barge-in clears playback, sends cancellation, and ignores stale output.
- Completed turns remain idempotently persisted.

Run all relevant voice grant, cooking route, web voice, and mobile voice tests,
plus web/mobile TypeScript checks, targeted lint, Python checks for retained
legacy code, the production frontend build, and `git diff --check`.

## Safety and handoff

- Do not deploy or change external secrets yet.
- Do not commit generated build artifacts, local environment files, or secrets.
- Do not discard existing uncommitted changes.
- Do not commit, push, or deploy unless explicitly authorized.

Report the files changed, Modal behavior removed/disabled, required environment
variables, verification results, and any remaining deployment steps.

The repository-side migration is complete when the active path contains no
Modal allocation, clients connect directly to the AWS URL, AWS validates the
grant, all context/barge-in/persistence behavior remains intact, and all tests
and builds pass.
