# Rekky Cooking Voice Mode → speech-to-speech integration

> Superseded by [rekky-aws-s2s-migration.md](./rekky-aws-s2s-migration.md). The Modal architecture below is retained only as historical context and is not an active deployment path.

This handoff covers Rekky's full-duplex Cooking Voice Mode only. It does not
apply to ordinary chat microphone or read-aloud features.

## Source requirement

The required authentication support currently exists in the modified
`speech-to-speech` working tree. Deploy a commit/source checkout containing:

- `src/speech_to_speech/api/openai_realtime/jwt_auth.py`
- Rekky handshake support in `api/openai_realtime/websocket_router.py`
- JWT environment wiring in `s2s_pipeline.py`

Do not assume the current PyPI release contains these changes until they are
committed and released.

## Architecture and ownership

```text
Browser/mobile
    │ GET /api/cooking/voice/config
    │ POST /api/cooking/voice/session
    ▼
Rekky API (authenticates user and signs a short-lived grant)
    ▼
Browser/mobile ── direct WebSocket ──► Modal speech-to-speech worker
                                      ├── Silero VAD
                                      ├── Parakeet TDT
                                      ├── OpenRouter Responses API / Gemini
                                      └── Qwen3-TTS
```

Live audio travels directly between the client and Modal. Rekky owns user
authentication, grants, recipe/workspace state, MongoDB persistence, cooking
tools, deployment/routing, global quotas, and product cost policy.
Speech-to-speech owns the realtime protocol, VAD, STT, LLM/TTS streaming,
partial transcripts, barge-in, tool-call transport, GPU scheduling,
backpressure, and per-connection history.

Do not add MongoDB credentials or Rekky cooking mutations to the generic voice
worker.

## Worker configuration

Configure matching values on the Modal worker:

```bash
export REKKY_VOICE_JWT_SECRET='<same HS256 secret as Rekky API>'
export REKKY_VOICE_JWT_ISSUER='rekky-api'
export REKKY_VOICE_JWT_AUDIENCE='rekky-voice'
export REKKY_VOICE_JWT_KEY_ID='current-key-id'
```

The key ID is optional in speech-to-speech but recommended. Never put the
signing secret in browser configuration, a URL, CLI arguments, logs, or a
public build environment.

A representative worker command is:

```bash
speech-to-speech \
  --mode realtime \
  --stt parakeet-tdt \
  --llm_backend responses-api \
  --model_name google/gemini-3.1-flash-lite \
  --responses_api_base_url https://openrouter.ai/api/v1 \
  --responses_api_api_key "$OPENROUTER_API_KEY" \
  --responses_api_stream \
  --tts qwen3 \
  --enable_live_transcription \
  --num_pipelines 1 \
  --max_realtime_sessions 1
```

Use the exact OpenRouter model identifier enabled for Rekky. Increase session
concurrency only after benchmarking the target L4.

## Voice grant contract

The Rekky API should return one canonical shape:

```json
{
  "connect_url": "wss://voice.example.com/v1/realtime",
  "expires_at": "2026-08-03T12:34:56.000Z",
  "token": "<signed JWT>"
}
```

Fix the web client to read `token`, not `session_token`. Never return the
permanent shared secret.

The HS256 JWT should contain:

```json
{
  "sub": "authenticated-user-id",
  "iss": "rekky-api",
  "aud": "rekky-voice",
  "iat": 1730000000,
  "exp": 1730000060,
  "jti": "unique-one-time-grant-id"
}
```

Recommended header:

```json
{"alg":"HS256","typ":"JWT","kid":"current-key-id"}
```

The worker enforces:

- Exactly HS256.
- Matching issuer, audience, and configured key ID.
- Numeric `iat` and `exp`, with a five-second clock-skew allowance.
- `exp > iat` and a maximum lifetime of 300 seconds.
- A non-empty `jti` and user identity.
- One-time `jti` consumption within each worker process.

Use `sub` for identity. `user_id` and `userId` are accepted for compatibility.
Keep Rekky's 15–300-second restriction; approximately 60 seconds is preferred.
Generate cryptographically random `jti` values.

Replay tracking is process-local. If the same grant can reach multiple Modal
replicas, enforce global one-time use with sticky routing, an atomic shared
store such as Redis, or gateway-level grant consumption.

## Required WebSocket sequence

The exact order is:

```text
1. Request a fresh grant.
2. Open connect_url.
3. On the WebSocket open event, immediately send rekky.authenticate.
4. Wait for session.created.
5. Send session.update with cooking instructions and audio settings.
6. Start microphone streaming.
```

Authentication must be the first application message:

```json
{"type":"rekky.authenticate","token":"<token from voice/session>"}
```

Do not wait for `session.created` before authenticating. The server intentionally
waits for authentication before sending it.

On failure, the worker sends an `authentication_failed` error and closes with
WebSocket code `1008`. Never retry the same token; request a new grant for every
reconnect or failed attempt.

Minimal web behavior:

```typescript
const { connect_url, token } = await createVoiceSession();
const socket = new WebSocket(connect_url);

socket.addEventListener("open", () => {
  socket.send(JSON.stringify({ type: "rekky.authenticate", token }));
});

socket.addEventListener("message", handleRealtimeEvent);
```

Do not stream microphone data until `session.created` is received and the
initial session configuration has been sent.

## Recipe and workspace context

After `session.created`, send:

```json
{
  "type": "session.update",
  "session": {
    "type": "realtime",
    "instructions": "GENERAL COOKING INSTRUCTIONS\n\nCurrent recipe:\n...",
    "audio": {
      "input": {
        "turn_detection": {
          "type": "server_vad",
          "interrupt_response": true
        }
      }
    }
  }
}
```

Do not put recipe markdown in the JWT. Later `session.update` events are
supported. Debounce and resend instructions when material recipe/workspace
state changes. Include a revision number when possible.

Recipe markdown alone is insufficient. Include a concise stable snapshot:

```text
Recipe revision: 17
Servings: 4
Unit mode: metric
Current step: 5
Checked ingredients: onion, garlic
```

Use tools—not static instructions—for mutable or time-sensitive state such as
timers.

Recommended initial tools:

- `get_cooking_state`
- `set_current_step`
- `check_ingredient` / `uncheck_ingredient`
- `start_timer` / `pause_timer` / `resume_timer` / `cancel_timer`
- `change_servings`
- `change_unit_mode`

The model emits a tool call; the client forwards it to an authenticated Rekky
API; the API validates ownership and arguments and performs the mutation; the
client returns the function result to the realtime conversation. Do not let a
model request directly perform privileged browser-side mutations. Require
confirmation for destructive or disruptive operations.

## Reconnection and history

Conversation history lasts only for the WebSocket connection. On reconnect,
send a bounded context containing:

- Current recipe and workspace snapshot.
- A concise prior-conversation summary.
- The latest relevant cooking voice turns.
- Unresolved timers/tool state.

Use `conversation.item.create` or a bounded summary in instructions. Do not
replay unlimited MongoDB history.

## Audio and realtime events

The existing capture design is compatible:

- Mono, signed little-endian PCM16.
- 16 kHz input.
- Approximately 40 ms chunks.
- Base64 in `input_audio_buffer.append`.
- Browser echo cancellation, noise suppression, AGC, resampling, and local
  noise gate.

```json
{"type":"input_audio_buffer.append","audio":"<base64 PCM16>"}
```

Confirm the actual Qwen output sample rate during integration; do not hard-code
playback based only on the input rate.

Handle at least:

- `session.created`, `session.updated`, and `error`.
- `input_audio_buffer.speech_started` and `.speech_stopped`.
- Partial input transcripts.
- `conversation.item.input_audio_transcription.completed`.
- `response.audio.delta` and `response.output_audio.delta`.
- `response.audio_transcript.delta` and
  `response.output_audio_transcript.delta`.
- Corresponding transcript `done` events.
- Tool-call events and function-call conversation items.
- `response.done` and cancellation states.

Normalize event aliases centrally rather than throughout React components.
Associate deltas with response/item IDs so late packets from cancelled
responses are ignored.

## Barge-in

When user speech starts during assistant playback:

1. Immediately clear queued local playback.
2. Stop the current browser/mobile audio source.
3. Send `response.cancel` if a response remains active.
4. Continue sending the user's new audio.
5. Ignore late deltas from the cancelled response.

The worker also cancels server work and filters stale generations. Client-side
playback cancellation remains necessary for immediate UX.

## Transcript persistence

Continue persisting completed turns through Rekky:

```http
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

- Use the completed input transcription for user text.
- Accumulate assistant transcript deltas and prefer the final transcript.
- Persist only terminal turns, not partial transcript updates.
- Keep deterministic message IDs and idempotent retries.
- Validate conversation ownership in the Rekky API.
- Mark messages as Cooking Voice Mode turns.
- Decide explicitly whether cancelled partial answers are stored or omitted.
- Retry persistence independently; a MongoDB/API failure should not terminate
  the voice connection.
- Do not store raw audio without a separately approved requirement.

## Client state and errors

Use an explicit state machine:

```text
disabled → requesting_grant → connecting → authenticating
         → configuring_session → ready
         → user_speaking → awaiting_response → assistant_speaking → ready

Any active state → reconnecting with a NEW grant → connecting
Any active state → stopped
```

Distinguish grant failure, network failure, `authentication_failed`,
`session_limit_reached`, `input_audio_buffer_overflow`, inference timeout,
provider timeout/rate-limit, response timeout, abnormal close, and persistence
failure.

- Authentication failure: fetch a new grant.
- Capacity rejection: exponential backoff with jitter and a clear busy state.
- Input overflow: pause/slow capture briefly rather than reconnecting.
- Persistence failure: retry separately.
- Repeated failure: exit Voice Mode into a stable UI state.

Never log JWTs, authorization headers, raw audio, or full recipe context.

## Modal capacity and observability

One active input per container and at most two containers means approximately
two concurrent voice sessions, regardless of internal server capacity.

Before increasing per-container concurrency, benchmark 1, 2, 4, and 8 sessions
on the actual L4. Measure first-audio p50/p95/p99, final-STT latency, inference
queue waits, deadline misses, failures, GPU memory/utilization, cold starts, and
cost per successful turn/audio minute. Compare Qwen3-TTS with Kokoro if Qwen is
the bottleneck. Decide explicitly whether `min_containers=0` cold-start latency
is acceptable.

Worker telemetry endpoints are:

```text
GET /v1/pool
GET /v1/inference
GET /v1/usage
```

Keep these private or protect them at the gateway. They expose capacity,
queues, inference usage, errors, turns, token usage, and audio duration.

The benchmark supports one Rekky grant:

```bash
export REKKY_VOICE_TOKEN='<fresh one-time token>'
python scripts/benchmark_realtime_concurrency.py prompt.wav \
  --url wss://VOICE-ENDPOINT/v1/realtime \
  --rekky-token "$REKKY_VOICE_TOKEN" \
  --concurrency 1 \
  --turns 1 \
  --output rekky-voice-smoke.json
```

One JWT cannot authenticate multiple benchmark clients. A concurrency run
needs a grant-provider integration that fetches a fresh token per connection.

## Required Rekky tests

API tests:

- Authentication is required to issue a grant.
- Claims and `kid` are correct and lifetime is 15–300 seconds.
- Every grant has a unique `jti`.
- Response property is `token`, not `session_token`.
- The shared secret is never returned or logged.
- Turn persistence validates ownership and is idempotent.

Web and mobile tests:

- Send `rekky.authenticate` immediately after socket open.
- Do not wait for `session.created` before authentication.
- Do not stream audio before authentication/configuration.
- Request a fresh token on every reconnect.
- Correctly handle authentication, capacity, overflow, and provider errors.
- Clear playback and ignore stale audio on barge-in.
- Assemble final transcripts and persist one completed turn.
- Send updated context when recipe state changes.

End-to-end staging test:

```text
1. Authenticate to Rekky.
2. POST /api/cooking/voice/session.
3. Open connect_url.
4. Send rekky.authenticate with token.
5. Receive session.created.
6. Send recipe-aware session.update.
7. Stream known PCM audio.
8. Receive completed user transcription.
9. Receive assistant text/audio deltas.
10. Receive response.done.
11. Persist the turn.
12. Confirm exactly two idempotent MongoDB messages.
```

Also test invalid/expired/replayed grants, wrong issuer/audience/key ID, wrong
first message, disconnect during authentication, capacity exhaustion, barge-in,
recipe updates, history preload, OpenRouter failures, and MongoDB outages.

## Definition of done

Controlled staging is ready when:

- Web and mobile use the same `token` contract.
- Both authenticate before waiting for `session.created`.
- Worker environment matches the Rekky signer.
- A known PCM fixture completes a full voice exchange.
- Barge-in stops local playback and server generation.
- Completed turns persist exactly once.
- Active sessions receive material recipe/workspace changes.
- Reconnects use new grants and bounded prior context.
- Telemetry endpoints are private.
- An L4 benchmark establishes the deployed concurrency limit.
- Logs contain no grants or raw audio.

Production additionally requires cross-replica replay protection, tenant/global
quotas, provider-spend limits, cold-start and sustained capacity validation,
and operational dashboards/alerts.
