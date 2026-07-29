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

1. **Cook** — contextual entry point and multimodal Rekky conversation.
2. **Cookbook** — saved recipes, guides, collections, filters, and offline availability.
3. **Shopping** — synchronized ingredients grouped by grocery category and recipe provenance.
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

## Offline data model

- Connectivity is three-state (`unknown`, `online`, `offline`). Unknown connectivity never authorizes
  credential deletion or a network-only empty state.
- SecureStore owns refresh credentials. A local session is removed only after an authenticated
  refresh endpoint explicitly rejects it.
- Per-user SQLite snapshots own recipes, imports, playlists, shopping data, opened cooking canvases,
  workspace progress, timer deadlines, synchronization checkpoints, and media availability.
- Recipe and import snapshots synchronize incrementally inside a bounded server snapshot. Deletion
  tombstones are retained server-side for 90 days so reconnecting devices can remove stale records.
- Recipe, import, and shopping mutations use durable command logs. Idempotent replay preserves order;
  permanent shopping conflicts are isolated and reconciled from the authoritative server list.
- Offline media is best-effort and budgeted separately from recipe text. Its manifest records whether
  each asset was downloaded; recipe content never depends on an image being present.
- AI generation, chat streaming, source extraction, and realtime voice remain online capabilities.
  Previously saved recipes and cooking controls remain usable without them.

## Cross-platform account contract

Web and mobile use the same saved-recipe, social-import, preference, and shopping-list APIs. A saved
recipe owns synchronized `workspaceState` containing the selected serving count, unit mode, checked
ingredient ids, and timer deadlines. Mobile SQLite is an offline cache of this state rather than a
separate source of truth: the newest timestamp wins, and newer local state is uploaded after
reconnection.

Presentation remains platform-native. Ingredient conversion, yield scaling, recipe fact derivation,
allergen evidence, equipment normalization, shopping identity, and contribution merging live in
`packages/data-provider`, keeping browser and native behavior aligned without sharing DOM and React
Native UI code.

## Delivery slices

1. Foundation: navigation, visual system, auth transport, environment configuration, CI, preview builds.
2. Account and Today: sign-in, registration, profile, startup config, home queries.
3. Cook: conversations, SSE streaming, attachments, camera, message history.
4. Library: saved recipes, search/filter, recipe detail, offline cache.
5. Guided cooking: sessions, timers, screen wake, haptics, review notes.
6. Imports: URL/share-sheet intake, import status, playlists, save-to-library flow.
7. Voice and platform: realtime voice, push notifications, widgets, shortcuts, share extension.
8. Release hardening: telemetry, crash reporting, accessibility audit, store privacy manifests, beta.
