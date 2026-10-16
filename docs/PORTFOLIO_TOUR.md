# Foodchat engineering tour

Foodchat is a product-specific [LibreChat](https://github.com/LibreChat-AI/LibreChat) fork. The core multi-user chat, authentication, persistence and much of the shared frontend originated upstream. This repository adds a cooking product called Rekky in its code and historical documentation; it is not the standalone Flutter/Rust recommendation app of the same name.

## Custom work to inspect

| Feature | Implementation | Tests |
| --- | --- | --- |
| Cooking orchestration and document changes | [Cooking service](../packages/api/src/cooking/service.ts), [planner](../packages/api/src/cooking/planner.ts), [canvas](../packages/api/src/cooking/canvas.ts) | [Service](../packages/api/src/cooking/service.spec.ts), [planner](../packages/api/src/cooking/planner.spec.ts), [canvas](../packages/api/src/cooking/canvas.spec.ts) |
| Recipe workspace in the browser | [Workspace](../client/src/components/Cooking/Workspace.tsx), [workspace hook](../client/src/components/Cooking/useRecipeWorkspace.ts) | [Workspace behavior](../client/src/components/Cooking/Workspace.test.tsx), [hook tests](../client/src/components/Cooking/useRecipeWorkspace.test.tsx) |
| Native mobile persistence and reconciliation | [SQLite storage](../apps/mobile/src/features/offline/database.ts), [recipe sync](../apps/mobile/src/features/offline/recipes.ts), [conflict handling](../apps/mobile/src/features/offline/conflict.ts) | [Recipe sync](../apps/mobile/src/features/offline/recipes.spec.ts), [conflicts](../apps/mobile/src/features/offline/conflict.spec.ts), [session boundaries](../apps/mobile/src/features/offline/session.spec.ts) |
| Shared shopping semantics | [Shared shopping model](../packages/data-provider/src/shopping.ts), [backend service](../packages/api/src/shopping/service.ts) | [Shared model](../packages/data-provider/src/shopping.spec.ts), [service tests](../packages/api/src/shopping/service.spec.ts) |
| Mobile voice connection lifecycle | [Native voice client](../apps/mobile/src/features/voice/client.ts), [server grant creation](../packages/api/src/cooking/voice.ts) | [Authentication/session sequencing](../apps/mobile/src/features/voice/client.spec.ts), [grant tests](../packages/api/src/cooking/voice.spec.ts) |
| Recipe imports | [Mobile import library](../apps/mobile/src/features/imports/library.ts), [share intake](../apps/mobile/src/features/imports/share.ts) | [Library](../apps/mobile/src/features/imports/library.spec.ts), [share cases](../apps/mobile/src/features/imports/share.spec.ts) |

## Decisions worth discussing

**Native UI, shared domain contracts.** The Expo app is a native client rather than a wrapper around the browser. Domain types and shopping/recipe rules can be shared without importing DOM components. [Mobile architecture](mobile/ARCHITECTURE.md) describes these boundaries.

**Offline state and acknowledgement.** Account-scoped SQLite snapshots and command logs have different responsibilities from TanStack Query's live server cache. Network uncertainty must not become credential deletion, an empty result or a successful mutation. Reconciliation tests are useful evidence; they are not proof of every physical-device interruption scenario.

**Voice as a separate service.** The API issues a short-lived grant; clients authenticate the WebSocket before configuration, wait for acknowledgement, and then stream audio. The current AWS speech service is maintained outside this repository. The checked-in Modal worker is a legacy reference. Read the [migration/protocol](../rekky-aws-s2s-migration.md) alongside the native client tests.

**Provider and deployment boundaries.** Provider credentials remain backend configuration. The repository includes workflows that can deploy on a push to main; a documentation change must not be confused with an approved production rollout. For this portfolio update, deployment workflows are skipped and no production services are changed.

## Inspect and run locally

Follow the [root setup](../README.md#local-setup), using a fresh local environment and your own provider configuration. Set `EXPO_PUBLIC_API_URL` to your local backend for mobile review. Existing domain defaults and deployment notes are historical references, not a current hosted-demo claim.

The repository's checks include:

```bash
npm run typecheck --workspace=@rekky/mobile
npm run lint --workspace=@rekky/mobile
npm test --workspace=@rekky/mobile
npm run test:all
npm run build:safe
```

These are entry points from the checked-in package scripts, not a claim that the whole monorepo was installed or rerun for this documentation pass. Native voice requires a development build, compatible audio devices and the separately configured service; store delivery and physical-device behavior are separate evidence.

## Provenance and limits

The fork retains LibreChat's MIT license and notices. Its custom history includes cooking preferences, recipe workspace, source imports, native offline/shopping flows and the AWS voice migration. The upstream comparison is historical and changes as upstream evolves; commit counts and inherited tests do not establish individual authorship of every line or production readiness. This review updates navigation and attribution, without changing application behavior or hosted infrastructure.
