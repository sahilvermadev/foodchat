# Rekky Mobile

Native iOS and Android companion for Rekky, built with Expo SDK 56 and React Native's New
Architecture.

## Run locally

```bash
npm install
npm run mobile
```

Use a development build for voice, push notifications, and production-grade native testing. The app
defaults to `https://rekky.ai`; copy `.env.example` to `.env.local` to target another API.

## Checks

```bash
npm run typecheck --workspace=@rekky/mobile
npm run lint --workspace=@rekky/mobile
npx expo-doctor@latest apps/mobile
```

Architecture and backend requirements live in `docs/mobile/`.
