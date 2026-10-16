# Foodchat

**An AI cooking assistant for planning meals, saving recipes, and cooking hands-free.**

Foodchat brings conversation and a recipe workspace together on the web and in a native iOS/Android app. Ask what to cook with the ingredients you have, adapt a recipe to your needs, save it to your collection, and work through it by voice in the kitchen.

Built on [LibreChat](https://github.com/LibreChat-AI/LibreChat), with custom cooking agents, recipe tools, shopping lists, mobile features, and speech-to-speech integration.

[Engineering tour](docs/PORTFOLIO_TOUR.md) · [Product design](DESIGN.md) · [Mobile architecture](docs/mobile/ARCHITECTURE.md) · [Deployment guide](DEPLOYMENT.md)

## What it does

- **Cooking conversations:** get suggestions and adapt recipes around ingredients, equipment, dietary needs, and household preferences.
- **Recipe workspace:** create, refine, and save structured recipes and preparation plans alongside the conversation.
- **Recipe imports:** bring in recipes from URLs and images while retaining their sources.
- **Shopping lists:** carry ingredients from recipe planning into a shared shopping workflow.
- **Native mobile:** browse recipes, manage shopping lists, and reconcile locally saved changes with the server.
- **Hands-free voice:** stream speech to a separate voice service with recipe context and authenticated sessions.

## How it is built

The React web client and Expo/React Native app share domain types and API contracts. An Express API handles accounts and persistence, while TypeScript services implement cooking orchestration, recipe operations, imports, and shopping. MongoDB stores server data; SQLite supports local mobile state.

```text
React web / React Native mobile
              │
              ▼
         Express API ─────► MongoDB
              │
              ▼
      Cooking orchestration
         ├── OpenRouter: model responses
         ├── Tavily: optional web research
         └── Epicure MCP: cooking tools

Web / mobile ── authenticated WebSocket ──► AWS voice service
```

LibreChat supplies the underlying multi-user chat, authentication, conversation storage, and shared UI foundation. The [engineering tour](docs/PORTFOLIO_TOUR.md) maps the custom features to their implementation and tests.

| Area | Location |
| --- | --- |
| Web interface | [`client/`](client/) |
| Native mobile app | [`apps/mobile/`](apps/mobile/) |
| Express API and routes | [`api/`](api/) |
| Cooking and backend services | [`packages/api/`](packages/api/) |
| Shared types and API client | [`packages/data-provider/`](packages/data-provider/) |
| Database models | [`packages/data-schemas/`](packages/data-schemas/) |

## Local setup

You need Node.js `20.19+`, `22.12+`, or `23+`, npm, MongoDB, and an OpenRouter API key. Docker is optional for running MongoDB locally.

```bash
git clone https://github.com/sahilvermadev/foodchat.git
cd foodchat
cp .env.example .env
npm ci
```

If you do not already have MongoDB running, create a local instance:

```bash
docker run -d --name foodchat-mongo \
  -p 127.0.0.1:27017:27017 \
  -v foodchat-mongo-data:/data/db \
  mongo:8.0.20
```

In `.env`, set `MONGO_URI` to your database and add `OPENROUTER_KEY`. The example database URI, `mongodb://127.0.0.1:27017/rekky`, works with the container above. Replace the example values for `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CREDS_KEY`, and `CREDS_IV` with your own values, following the lengths in `.env.example`. Keep `.env` out of Git.

Then build the shared packages and start both development servers:

```bash
npm run dev:app -- --build
```

Open the web app at **http://localhost:3090**. The API runs at **http://localhost:3080**. On subsequent runs, use `npm run dev:app`; restart the database with `docker start foodchat-mongo` if needed.

Optional configuration:

| Variable | Purpose |
| --- | --- |
| `COOKING_AGENT_MODEL` | Override the cooking model |
| `COOKING_AGENT_BASE_URL` | Override the model provider endpoint |
| `TAVILY_API_KEY` | Enable web search and scraping |

### Mobile app

From the repository root:

```bash
cp apps/mobile/.env.example apps/mobile/.env.local
```

Set `EXPO_PUBLIC_API_URL` in that file to a backend your device can reach. For a USB-connected Android device, use `http://127.0.0.1:3080` with:

```bash
adb reverse tcp:3080 tcp:3080
adb reverse tcp:8081 tcp:8081
```

For an iOS simulator, use the local backend address; a physical device needs a reachable address on your network. The checked-in mobile default points to an older hosted domain, so configure this explicitly for local development.

Start Metro with `npm run mobile`. In another terminal, run `npm run mobile:android` or `npm run mobile:ios` to create a native development build. Android builds need Android Studio; iOS builds need macOS and Xcode. Voice and other native features require a development build rather than Expo Go.

### Voice service

Voice requires a separately deployed AWS speech-to-speech service. The API issues a short-lived grant, the client authenticates its WebSocket connection, and audio streaming begins after session configuration is acknowledged. Provider credentials and the voice signing secret stay on the server.

Configure `REKKY_VOICE_CONNECT_URL`, `REKKY_VOICE_JWT_SECRET`, `REKKY_VOICE_JWT_ISSUER`, `REKKY_VOICE_JWT_AUDIENCE`, and `REKKY_VOICE_JWT_KEY_ID` to match that service. See the [voice integration specification](rekky-aws-s2s-migration.md) for the protocol, token settings, and connection sequence. The files under `services/voice/` describe the earlier Modal implementation.

## Development checks

```bash
npm run lint
npm run test:all
npm run build:safe
```

Mobile checks run separately:

```bash
npm run typecheck --workspace=@rekky/mobile
npm run lint --workspace=@rekky/mobile
npm test --workspace=@rekky/mobile
```

Run `npm run e2e` with the local application running for browser tests. See the [development guide](CLAUDE.md) for workspace boundaries and per-package test commands.

## Names in the codebase

Earlier versions of this cooking project used the names **Rekky** and **Mise**, and the assistant is called **Samwise**. Those names remain in package identifiers, environment variables, assets, and older documentation. Commands such as `--workspace=@rekky/mobile` use the existing package names. This repository is separate from the Flutter/Rust recommendation app also named Rekky.

## License

Foodchat is a fork of LibreChat and retains its copyright and license notices. See [LICENSE](LICENSE) for the MIT license.
