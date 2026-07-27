# Rekky Mobile Architecture

## Product intent

Rekky Mobile is a native companion to the web application, not a web view. It exposes the same
account, conversations, recipes, imports, preferences, and voice assistant
through an interface designed for one-handed use in a kitchen.

The mobile experience should feel like an editorial cookbook crossed with a calm ambient assistant:
warm surfaces, confident typography, food-first photography, tactile controls, subtle depth, and
motion that communicates state. Native platform behavior wins over visual sameness between iOS and
Android.

## Technology decision

- Expo SDK 56, React Native 0.85, React 19.2, TypeScript 6, and the New Architecture.
- Expo Router native tabs and native stacks for platform navigation, deep links, and universal links.
- Expo UI for production SwiftUI and Jetpack Compose controls where platform-native controls improve
  the experience.
- TanStack Query 5 for server state and offline-aware invalidation.
- Zustand 5 only for small ephemeral client state such as draft composer state and onboarding.
- `expo/fetch` for WinterCG-compatible HTTP, multipart upload, and streaming SSE responses.
- Expo SecureStore for refresh credentials; access tokens remain memory-first and are restored only
  when needed.
- Reanimated 4 and Gesture Handler for interruptible, accessible interactions on the UI thread.
- FlashList 2 for conversations, imports, and large recipe libraries.
- Expo Image for memory-aware image loading and transitions.
- Skia only for branded ambient visuals, audio visualization, and progress treatments. Standard UI
  remains native views to preserve accessibility, performance, and maintainability.
- EAS Build, Submit, Update, and Workflows for signed builds, store releases, preview channels, and
  compatible over-the-air updates.

## Navigation model

The primary tabs are:

1. **Today** — contextual entry point, recent recipes, and quick prompts.
2. **Cook** — multimodal Rekky conversation with text, camera, attachments, and voice.
3. **Library** — saved recipes, guides, collections, filters, and offline availability.
4. **Imports** — social and web recipe inbox, processing state, playlists, and review.

Secondary destinations use native stacks and sheets: recipe detail, import review,
conversation history, preferences, profile, and settings.

## Package boundaries

```text
apps/mobile/
  src/app/               Expo Router routes and layouts
  src/components/        Mobile-native presentation components
  src/features/          Feature modules (auth, chat, recipes, imports, voice)
  src/lib/api/           Mobile transport and streaming adapters
  src/lib/auth/          Secure credential lifecycle
  src/locales/           Mobile copy and translations
  src/providers/         Query, auth, theme, and connectivity providers
packages/data-provider/  Shared request/response types and endpoint definitions
packages/api/            Backend domain services shared by web and mobile routes
```

The mobile app may import schema-free TypeScript contracts from `librechat-data-provider`, but it
must not import browser request singletons, Recoil stores, DOM utilities, or web components.

## Experience principles

- Design for wet hands, movement, steam, glare, and intermittent attention.
- Primary cooking controls have at least a 48-point touch target.
- Guided cooking supports wake lock, large type, timers, haptics, and voice-first progression.
- Respect Dynamic Type, reduce-motion settings, screen readers, contrast, and platform back behavior.
- Cache recipe text and active sessions for poor connectivity; never imply that a server mutation
  completed until it is acknowledged.
- Use motion to show causality and continuity, not decoration.
- Use glass and blur as platform enhancement, with opaque accessible fallbacks.

## Delivery slices

1. Foundation: navigation, visual system, auth transport, environment configuration, CI, preview builds.
2. Account and Today: sign-in, registration, profile, startup config, home queries.
3. Cook: conversations, SSE streaming, attachments, camera, message history.
4. Library: saved recipes, search/filter, recipe detail, offline cache.
5. Guided cooking: sessions, timers, screen wake, haptics, review notes.
6. Imports: URL/share-sheet intake, import status, playlists, save-to-library flow.
7. Voice and platform: realtime voice, push notifications, widgets, shortcuts, share extension.
8. Release hardening: telemetry, crash reporting, accessibility audit, store privacy manifests, beta.
