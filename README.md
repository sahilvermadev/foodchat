<p align="center">
  <img src="apps/mobile/assets/images/rekky-icon.png" width="128" alt="Rekky logo">
</p>

<h1 align="center">Rekky</h1>

<p align="center">
  <strong>An AI cooking assistant for practical answers, durable recipes, and hands-free kitchen guidance.</strong>
</p>

<p align="center">
  <a href="https://rekky.ai">Web app</a> ·
  <a href="DEPLOYMENT.md">Deployment</a> ·
  <a href="services/voice/README.md">Voice service</a> ·
  <a href="DESIGN.md">Product design</a>
</p>

## Overview

Rekky helps people decide what to cook, adapt recipes to real constraints, plan preparation, and stay guided while their hands are busy.

Rekky is the product. Samwise is the cooking assistant users meet inside conversations.

This repository began as a product-specific fork of LibreChat. It now includes Rekky's cooking runtime, native mobile app, recipe workspace, and real-time voice service.

## Features

- **Cooking-first conversations:** answers shaped around ingredients, equipment, skill level, dietary needs, and household preferences.
- **Recipe workspace:** structured recipes, guides, and prep plans that can be refined in chat and saved for later.
- **Source-aware import:** turn recipe URLs and images into usable cooking documents while preserving provenance.
- **Personal context:** remember relevant taste, kitchen, household, location, cultural, and safety preferences.
- **Optional web research:** use Tavily when current or source-backed information is needed.
- **Native mobile app:** an Expo and React Native client for Android and iOS.
- **Real-time voice:** streamed speech recognition, response generation, and speech synthesis through an authenticated Modal worker.
- **Multi-user foundation:** authentication, persistence, and conversation infrastructure inherited from LibreChat.

## Architecture

| Area | Location | Responsibility |
| --- | --- | --- |
| Web client | `client/` | React browser experience |
| Mobile client | `apps/mobile/` | Expo and React Native app |
| API server | `api/` | Express routes, auth, and service boundary |
| Cooking runtime | `packages/api/` | Agent orchestration, tools, and recipe behavior |
| Shared contracts | `packages/data-provider/` | Shared types and client services |
| Voice worker | `services/voice/` | Authenticated speech-to-speech gateway on Modal |
| Persistence | MongoDB | Users, conversations, recipes, and app state |

```text
Web / Mobile
      │
      ▼
Express API ──► Cooking runtime ──► OpenRouter
      │                 ├─────────► Tavily
      │                 └─────────► Epicure MCP
      ├────────► MongoDB
      └────────► Modal voice worker
```

The default cooking model is `google/gemini-3.1-flash-lite` through OpenRouter. The voice worker uses Hugging Face `speech-to-speech` with Parakeet TDT, Silero VAD, Qwen3-TTS, and the configured OpenRouter model.

## Prerequisites

- Node.js `20.19+`, `22.12+`, or `23+`
- npm
- Docker, for the simplest local MongoDB setup
- An OpenRouter API key
- Android Studio and ADB for Android development, or Xcode for iOS development
- A Modal account only if you are deploying the voice worker
- A Tavily API key only if you want web search and scraping

## Local setup

```bash
git clone https://github.com/sahilvermadev/foodchat.git
cd foodchat
cp .env.example .env
npm ci
docker compose up -d mongodb
```

Set the required variables described below in `.env`, then start the application:

```bash
npm run dev:app -- --build
```

The development launcher builds shared packages, then starts the API at `http://localhost:3080` and the web client at `http://localhost:3090`.

On later runs, use `npm run dev:app` to skip the package build.

## Configuration

At minimum, configure MongoDB and OpenRouter in the root `.env` file.

| Variable | Purpose |
| --- | --- |
| `MONGO_URI` | MongoDB connection string |
| `OPENROUTER_KEY` | Main cooking-agent provider credential |
| `COOKING_AGENT_BASE_URL` | OpenAI-compatible provider endpoint |
| `COOKING_AGENT_MODEL` | Main cooking model |
| `TAVILY_API_KEY` | Optional search and scraping |
| `JWT_SECRET` | Access-token signing secret |
| `JWT_REFRESH_SECRET` | Refresh-token signing secret |
| `CREDS_KEY` / `CREDS_IV` | Encryption material for stored credentials |
| `REKKY_VOICE_URL` | Deployed Modal voice endpoint |
| `REKKY_VOICE_TOKEN_SECRET` | Shared signing secret for short-lived voice grants |
| `REKKY_VOICE_SESSION_TTL_SECONDS` | Voice-grant lifetime |
| `REKKY_VOICE_SHARE_RECIPE_CONTEXT` | Whether recipe context is sent into voice sessions |

Generate strong secrets before using a shared or production environment:

```bash
openssl rand -hex 32
```

The values in `.env.example` are development placeholders. Replace them, keep `.env` out of version control, and never expose provider keys in a client application.

## Running the apps

Run the backend and web client separately when you need independent logs:

```bash
npm run backend:dev
npm run frontend:dev
```

Start the mobile bundler and create a native development build:

```bash
cp apps/mobile/.env.example apps/mobile/.env.local
npm run mobile
npm run mobile:android
# or
npm run mobile:ios
```

The mobile app targets `https://rekky.ai` by default. To use the local API, set `EXPO_PUBLIC_API_URL=http://127.0.0.1:3080` in `apps/mobile/.env.local`.

For a USB-connected Android device, expose the local API and Metro through ADB:

```bash
adb reverse tcp:3080 tcp:3080
adb reverse tcp:8081 tcp:8081
```

Voice and other native features require a development build; they do not run fully in Expo Go. See [the mobile guide](apps/mobile/README.md) and [mobile architecture](docs/mobile/ARCHITECTURE.md).

## Voice mode

The voice path is hosted rather than fully on-device:

```text
Mobile ── short-lived grant ──► Rekky API
Mobile ── authenticated WebSocket ──► Modal GPU worker
```

The API signs a short-lived session grant. The mobile app uses it to open a WebSocket without receiving a reusable Modal or OpenRouter credential.

Deploy the worker from the repository root:

```bash
python -m pip install modal
modal setup
openssl rand -hex 32

modal secret create rekky-voice-auth \
  VOICE_TOKEN_SECRET='<shared secret>'

modal secret create rekky-voice-provider \
  OPENROUTER_API_KEY='<OpenRouter key>' \
  VOICE_LLM_MODEL='google/gemini-3.1-flash-lite'

modal deploy services/voice/modal_app.py
```

Then set `REKKY_VOICE_URL` and the matching `REKKY_VOICE_TOKEN_SECRET` on the Rekky API. The current worker scales from zero to two L4 GPU containers and keeps a container warm for ten minutes.

For security, health checks, cold-start behavior, and scaling controls, read [the voice service guide](services/voice/README.md).

## Testing

Run the main repository checks:

```bash
npm run lint
npm run test:all
npm run build:safe
```

Run the mobile checks:

```bash
npm run typecheck --workspace=@rekky/mobile
npm run lint --workspace=@rekky/mobile
npm test --workspace=@rekky/mobile
npx expo-doctor@latest apps/mobile
```

Run the voice gateway tests:

```bash
python -m unittest discover -s services/voice -p 'test_*.py'
```

End-to-end browser tests are available through `npm run e2e` after the local application is running.

## Deployment

The production topology uses Vercel for the web client, Railway for the API and MongoDB, and Modal for GPU-backed voice inference.

The public app is [rekky.ai](https://rekky.ai), and the API health endpoint is [rekky.ai/health](https://rekky.ai/health).

See [DEPLOYMENT.md](DEPLOYMENT.md) for environment variables, service configuration, CORS rules, domains, and deployment checks.

## Project documentation

- [Product and interaction design](DESIGN.md)
- [Deployment guide](DEPLOYMENT.md)
- [Cooking-assistant runtime design](docs/cooking-assistant-runtime-design.md)
- [Mobile architecture](docs/mobile/ARCHITECTURE.md)
- [Mobile backend readiness](docs/mobile/BACKEND_READINESS.md)
- [Voice service operations](services/voice/README.md)
- [Repository development guide](CLAUDE.md)

## LibreChat attribution and license

Rekky is derived from [LibreChat](https://github.com/danny-avila/LibreChat) and retains substantial upstream infrastructure. We are grateful to LibreChat's maintainers and contributors.

This repository is distributed under the [MIT License](LICENSE). Existing copyright and license notices are preserved.
