# Rekky voice worker

This service runs Hugging Face `speech-to-speech` behind an authenticated WebSocket gateway on Modal. The main Rekky API creates a short-lived grant; mobile clients never receive a reusable provider credential.

## Deploy

1. Install and authenticate the Modal CLI: `python -m pip install modal && modal setup`.
2. Create a strong shared secret: `openssl rand -hex 32`.
3. Create separate Modal secrets for the gateway and provider credentials:

   ```sh
   modal secret create rekky-voice-auth \
     VOICE_TOKEN_SECRET='<shared secret>'

   modal secret create rekky-voice-provider \
     OPENROUTER_API_KEY='<OpenRouter key>' \
     VOICE_LLM_MODEL='google/gemini-3.1-flash-lite'
   ```

4. Deploy from the repository root: `modal deploy services/voice/modal_app.py`.
5. Set these variables on the Rekky API deployment, using the URL printed by Modal:

   ```env
   REKKY_VOICE_URL=https://<workspace>--rekky-voice-serve.modal.run
   REKKY_VOICE_TOKEN_SECRET=<same shared secret>
   REKKY_VOICE_SESSION_TTL_SECONDS=180
   REKKY_VOICE_SHARE_RECIPE_CONTEXT=true
   ```

The worker uses one active WebSocket per L4 container, scales from zero to two containers, and remains warm for ten minutes. Increase `max_containers` only after adding a product-level concurrent-session budget. Model files persist in the `rekky-voice-models` Modal Volume.

The API and Modal must use the same signing secret. Grants include a non-secret signing-key ID, and the gateway logs that ID at startup so a mismatch is immediately diagnosable without exposing credentials. After rotating `rekky-voice-auth`, redeploy the Modal app so every container receives the new value.

## Operations

- `/health` reports whether the speech worker process is alive.
- Modal access logging is disabled so short-lived query grants are not written by Uvicorn.
- The grant contains only a user identifier, issue/expiry times, and a random ID. Recipe text is sent inside the authenticated WebSocket after connection.
- Cold starts include GPU allocation plus model loading. If usage becomes regular, set `min_containers=1` during the hours where latency matters and return it to zero off-hours.
