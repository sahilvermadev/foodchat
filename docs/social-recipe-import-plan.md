# Social Recipe Import Plan

Status: Backend and web inbox implemented with optional cache-first YouTube transcript adapter; native mobile share extensions, field-level provenance UI, creator policy, and full media transcription remain future work
Date: June 25, 2026
Product: Rekky cooking assistant
Primary concern: helping users save social cooking videos as usable recipe cards without creating a fragile or non-compliant scraping product

## Problem Statement

Many users discover food through YouTube Shorts, Instagram Reels, and TikTok. They save videos because the food looks good, but those saved videos rarely become cookable. The recipe may be scattered across spoken narration, on-screen text, pinned comments, captions, creator bios, linked blog posts, and visual technique cues. When the user later wants to cook, they must rewatch, pause, transcribe, guess quantities, and reconstruct the method.

Rekky can become the place where social food inspiration turns into practical cooking. The product promise should be simple:

> Share a cooking video to Rekky, and Rekky will save the source, extract what it can, ask only when needed, and produce a trustworthy recipe draft you can cook, edit, and keep.

The important constraint is that the product must not rely on brittle or prohibited access to social platform media. The experience should be excellent even when full video extraction is unavailable.

## Goals

1. Let users save social cooking videos to Rekky from native share flows.
2. Convert usable source signals into structured recipe drafts.
3. Preserve attribution and a path back to the original creator.
4. Make uncertainty visible without making the experience feel broken.
5. Avoid prohibited scraping or misuse of platform metadata.
6. Make import failures still valuable by saving the source and offering graceful next steps.
7. Build an extensible pipeline that can later support creator partnerships and direct creator publishing.

## Non-Goals

- Do not build an unofficial downloader for TikTok, Instagram, or YouTube videos.
- Do not promise exact recipes when quantities or steps are inferred.
- Do not hide uncertainty in generated recipe cards.
- Do not use Instagram oEmbed metadata or content for extraction or persistence beyond allowed embedding/display use.
- Do not treat every shared video as a complete recipe. Some are inspiration, ads, restaurant clips, reactions, or incomplete demos.

## Platform Reality

### YouTube

YouTube Data API `videos.list` can retrieve video metadata such as title, description, channel, and other snippet fields. Captions APIs exist, but caption access is permissioned and not a general-purpose way to download captions for arbitrary public videos.

Official references:

- https://developers.google.com/youtube/v3/docs/videos/list
- https://developers.google.com/youtube/v3/docs/captions/list
- https://developers.google.com/youtube/terms/developer-policies

### Instagram

Instagram oEmbed supports public photo, video, Reel, and Feed posts for embedding and basic display metadata. Meta explicitly limits oEmbed use to embedding and prohibits consuming, manipulating, extracting, or persisting metadata/content or derivatives for other purposes.

Official reference:

- https://developers.facebook.com/docs/instagram-platform/oembed

### TikTok

TikTok oEmbed can turn a video URL into embed HTML and basic information such as title, author, thumbnail, provider, and link attribution. It does not provide a full transcript or recipe extraction API.

Official reference:

- https://developers.tiktok.com/doc/embed-videos/

### Native Sharing

iOS Share Extensions and Android share intents can receive shared URLs or text from other apps. This is the strongest entry point for the product because it gives users the familiar "Share to Rekky" behavior.

Official references:

- https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Share.html
- https://developer.android.com/training/sharing/receive

## Experience Principles

- Save first, extract second.
- Never make a user lose the link because extraction failed.
- Show progress in human terms, not technical stages.
- Be honest about what came from the source and what Rekky inferred.
- Prefer one-tap import, but offer a useful review screen when confidence is low.
- Preserve creator attribution on every imported recipe.
- Keep the original video attached to the recipe card.
- Optimize for "I want to cook this later" and "I want to cook this now" as different modes.
- Let the user correct the recipe quickly.
- Do not require the user to understand platform limitations.

## Product Decisions For Known Gaps

### Mobile Surface Rollout

The share-sheet experience is the long-term magic, but it should not block the first version. Build the feature in phases:

1. Manual URL import in the web app.
2. PWA Web Share Target support where feasible, especially for Android users.
3. Native Android share intent once the backend pipeline is proven.
4. Native iOS Share Extension once the mobile shell supports it.
5. Full native polish with import progress, notifications, and offline-safe handoff.

This order proves the backend, extraction quality, and review UX before committing to the highest mobile integration cost. It also gives users a usable import path immediately.

### Import Inbox

Social imports should land in a dedicated import inbox, not directly in the recipe library. The recipe library should contain accepted, cookable recipes. The import inbox can contain messy, partial, pending, duplicated, failed, or inspiration-only saves.

Import states:

- `saved`: source captured, no extraction has started or no recipe is available yet.
- `processing`: Rekky is analyzing source signals.
- `draft_ready`: enough eligible text or user-supplied details exist to start a Rekky draft.
- `needs_review`: the draft has missing quantities, unclear steps, low confidence, or safety concerns.
- `saved_recipe`: the user accepted the draft into the recipe library.
- `inspiration`: the user intentionally kept the source without converting it to a recipe.
- `failed`: processing failed, but the source remains saved.

UX rules:

- Create the import inbox item synchronously.
- Never delete or hide the original source because processing failed.
- Keep unreviewed drafts out of the main recipe library.
- Let users filter by status, platform, creator, dish type, and readiness.
- Let users promote a draft to the recipe library only after accepting it.
- Run extraction through durable import jobs rather than blocking source save requests.
- When the user pastes caption/details for a social source, move the import to `draft_ready` so the next action is obvious.
- If those details are cleared, return the import to the provider's default review state.
- When a cooking draft created from an import is saved to the recipe library, mark the import `saved_recipe` and store the saved recipe id.
- Show saved-recipe imports as their own filter and provide direct actions to reopen the draft or saved recipe.

### Trust And Provenance Language

Every generated recipe should track field-level provenance so the UI can be honest without overwhelming the user.

Internal provenance values:

- `source_exact`: explicitly found in eligible source text.
- `creator_verified`: provided or approved by the creator.
- `rekky_estimated`: inferred by Rekky from incomplete signals.
- `user_edited`: corrected or supplied by the user.
- `unknown`: unresolved or too ambiguous.

User-facing labels:

- "From source"
- "Creator verified"
- "Estimated by Rekky"
- "Edited by you"
- "Needs check"

Avoid saying "exact recipe" unless every material ingredient and step came from source-exact or creator-verified information. Safer user-facing copy:

- "Draft recipe from this source"
- "Cookable version"
- "Inspired by this video"
- "Some amounts estimated"

Recommended draft banner:

> Draft ready. Some quantities were estimated because the video did not include exact amounts.

Show field-level labels only where they help the user make a cooking decision, such as uncertain quantities, missing temperatures, or inferred timings.

## User Flow

### 1. Share From Social App

The user taps Share in YouTube, TikTok, Instagram, or a browser and selects Rekky.

The Rekky share target should accept:

- URL text.
- Shared plain text containing a URL.
- Webpage URLs from browser shares.
- Optional media attachments only when the sending app provides them through the OS share payload.

### 2. Instant Saved State

Rekky immediately creates a saved import card:

- Source platform.
- Original URL.
- Creator attribution when available.
- Thumbnail or embed preview when allowed.
- Import status.
- User-visible label such as "Finding recipe details."

This prevents the experience from feeling like the link disappeared into a black box.

### 3. Background Import Job

The backend starts an `ImportJob` and advances through source-specific stages:

1. Normalize URL.
2. Fetch allowed metadata.
3. Read source text available through approved APIs or normal web pages.
4. Expand links found in descriptions/captions when allowed.
5. Extract recipe candidates.
6. Validate and score confidence.
7. Produce a draft recipe or a guided recovery prompt.

### 4. Review And Save

When extraction succeeds, the user sees a draft card:

- Title.
- Creator/source.
- Ingredients.
- Steps.
- Technique notes.
- Confidence indicators.
- "Needs your check" fields.
- Original video preview/link.

The user can:

- Save as-is.
- Edit.
- Ask Rekky to fill gaps.
- Mark it as inspiration only.
- Start cook mode.

## Import Modes

### Quick Save

Always available. This mode saves the source, attribution, and preview. It should succeed even when no recipe can be extracted.

Use cases:

- User is browsing and wants to save quickly.
- Platform gives only a URL.
- Recipe extraction is delayed or unavailable.
- User wants a playlist of inspiration.

### Recipe From Text

Primary MVP mode. Uses source text such as:

- YouTube title and description.
- Public web recipe pages linked from descriptions.
- User-provided captions or pasted text.
- Accessible webpage content.
- Creator-provided recipe text where permitted.

This mode is likely to produce the best ratio of quality to compliance risk.

### Recipe From Media

Only available when Rekky has a compliant media source:

- User uploads a video file directly.
- The OS share payload includes media that Rekky is allowed to process.
- A creator connects their account and grants access.
- A creator publishes directly to Rekky.
- A platform or creator partnership provides transcript/media rights.

This mode can use speech transcription, visual analysis, and OCR.

### Creator Verified Recipe

Long-term mode. A creator claims or connects a profile and maps social videos to Rekky-native recipe cards. When users save the social video, Rekky can attach the verified recipe.

This is the strongest long-term moat because it avoids guessing and gives creators a reason to participate.

## Technical Architecture

### Data Model

`SocialImport`

- `id`
- `userId`
- `sourceUrl`
- `canonicalUrl`
- `provider`
- `providerContentId`
- `creatorName`
- `creatorUrl`
- `title`
- `thumbnailUrl`
- `userSuppliedText`
- `extractedText`
- `extractedAt`
- `draftId`
- `draftConversationId`
- `embedHtmlAllowed`
- `status`
- `createdAt`
- `updatedAt`

`ImportJob`

- `id`
- `socialImportId`
- `status`
- `stage`
- `attemptCount`
- `lastErrorCode`
- `lastErrorMessage`
- `startedAt`
- `completedAt`

`SourceSignal`

- `id`
- `socialImportId`
- `kind`
- `source`
- `text`
- `url`
- `confidence`
- `permissionsBasis`

Signal kinds:

- `title`
- `description`
- `caption`
- `linked_page`
- `transcript`
- `ocr`
- `user_supplied_text`
- `creator_verified_recipe`

`RecipeDraft`

- `id`
- `socialImportId`
- `status`
- `recipeJson`
- `overallConfidence`
- `missingFields`
- `sourceAttribution`
- `createdAt`
- `updatedAt`

### Pipeline Components

`UrlNormalizer`

- Detect provider.
- Resolve short links.
- Strip tracking parameters.
- Extract provider content IDs when possible.

`ProviderMetadataFetcher`

- Fetch only allowed metadata.
- Store permissions basis for every field.
- Separate display-only embed metadata from extraction-eligible text.

`SourceExpander`

- Find recipe links in allowed text.
- Resolve recipe blogs, creator websites, and link hubs where permitted.
- Avoid private, login-gated, or blocked content.

`SignalCollector`

- Normalize all eligible source text into structured signals.
- Preserve source attribution.
- Mark signals by reliability.

`RecipeExtractor`

- Generate a strict recipe schema from eligible signals.
- Require field-level confidence.
- Separate exact source facts from inferred values.

`RecipeVerifier`

- Detect missing quantities.
- Detect unsafe temperatures or vague doneness.
- Detect impossible timings.
- Flag ingredient-step mismatches.
- Flag ungrounded claims.

`UserRecoveryPlanner`

- If confidence is low, ask for the smallest useful user input.
- Examples:
  - "I found the dish, but not quantities. Want me to estimate or add them manually?"
  - "This looks like a technique demo, not a full recipe. Save as inspiration?"
  - "Paste the caption and I can finish the card."

## AI Output Schema

Every recipe draft should include:

- `title`
- `description`
- `servings`
- `prepTimeMinutes`
- `cookTimeMinutes`
- `ingredients`
- `steps`
- `techniques`
- `equipment`
- `substitutions`
- `safetyNotes`
- `creatorAttribution`
- `sourceUrl`
- `sourceConfidence`
- `fieldConfidence`
- `assumptions`
- `needsReview`

Ingredient fields:

- `name`
- `quantity`
- `unit`
- `preparation`
- `optional`
- `confidence`
- `source`

Step fields:

- `order`
- `instruction`
- `timeEstimate`
- `sensoryCue`
- `technique`
- `confidence`
- `source`

## MVP

Build a lean version around share-to-save plus text-based extraction.

## Current Implementation

The implemented production slice is intentionally compliant and text-first:

1. Web import inbox at `/imports` with manual URL paste and PWA share-target support at `/imports/share`.
2. Authenticated `/api/social-imports` API for create, list, update, delete, draft creation, job listing, and retry.
3. Durable `SocialImport` and `SocialImportJob` records with canonical URL deduplication.
4. Background extraction jobs for eligible web recipe pages using JSON-LD `Recipe` data.
5. Optional YouTube metadata ingestion through the official YouTube Data API when `YOUTUBE_API_KEY` is configured.
6. Optional YouTube transcript adapter behind `YOUTUBE_TRANSCRIPT_ADAPTER=enabled`, with global cache, negative cache, per-user daily caps, global daily caps, cooldowns, and a kill switch.
7. Instagram and TikTok quick-save without unofficial scraping or prohibited metadata persistence.
8. User-supplied caption/details capture so users can make social imports draft-ready when platforms do not expose recipe text.
9. Draft creation into Rekky cooking documents with source attribution and draft notes.
10. Saved recipe linkage back to the originating social import.
11. Per-user rate limits for import and draft endpoints.
12. Failed-job retry from the web import inbox.
13. YouTube playlist subscriptions: a user can paste a playlist URL, Rekky imports new playlist videos, and due subscriptions are checked by a lightweight backend scheduler.

Operational controls:

- Set `YOUTUBE_API_KEY` to enable official YouTube snippet ingestion.
- Set `YOUTUBE_TRANSCRIPT_ADAPTER=enabled` to enable the experimental YouTube transcript adapter.
- Set `YOUTUBE_TRANSCRIPT_YTDLP_PATH` if `yt-dlp` is not on the runtime path.
- Set `YOUTUBE_TRANSCRIPT_PER_USER_DAILY_LIMIT` to cap unique-video transcript jobs per user; default is 6.
- Set `YOUTUBE_TRANSCRIPT_GLOBAL_DAILY_LIMIT` to cap global unique-video transcript attempts; default is 100.
- Set `YOUTUBE_TRANSCRIPT_LANGS` to tune caption language preference; default is `en.*,en`.
- Set `SOCIAL_IMPORT_WEB_EXTRACTION=false` to disable web page extraction.
- Set `SOCIAL_IMPORT_JOBS=false` to disable automated import jobs.
- Set `SOCIAL_IMPORT_RATE_LIMIT_MAX` and `SOCIAL_IMPORT_DRAFT_RATE_LIMIT_MAX` to tune per-user request limits.
- Set `SOCIAL_PLAYLIST_SYNC_MAX_ITEMS` to control how many playlist videos are scanned per sync; default is 200, capped at 500.
- Set `SOCIAL_PLAYLIST_SYNC_INTERVAL_HOURS` to control each playlist's next scheduled sync; default is 12.
- Set `SOCIAL_PLAYLIST_SCHEDULER_INTERVAL_MS` to control how often the backend checks due playlists; default is 15 minutes.
- Set `SOCIAL_PLAYLIST_SYNC_SCHEDULER=false` to disable the in-process playlist scheduler.

Important current limits:

- The app does not download social videos.
- The app does not transcribe arbitrary YouTube, Instagram, or TikTok media.
- The optional YouTube transcript adapter is best-effort and disabled by default; it is not a guarantee that every YouTube video can be processed.
- The transcript adapter does not implement proxy rotation, account cycling, CAPTCHA avoidance, or IP-ban evasion.
- Instagram and TikTok imports require pasted creator details, linked recipe text, or future official/partner integrations before a reliable recipe draft can be created.
- Provenance is tracked at import level today; field-level labels inside the structured recipe editor still need a separate recipe schema/UI pass.
- Native iOS and Android share extensions are not implemented in this web repo slice.

### YouTube Playlist Sync

Playlist sync is designed to keep the user flow simple:

1. The user pastes or shares a YouTube playlist URL.
2. Rekky creates a playlist subscription and immediately scans the playlist.
3. Each new playlist video becomes a normal YouTube social import.
4. Existing video imports are skipped to avoid duplicate cards.
5. The regular extraction pipeline handles metadata, transcript cache, web links, draft creation, and review states.
6. The backend scheduler periodically checks active subscriptions and imports newly added playlist videos.
7. Pausing or removing a playlist subscription does not delete imports or recipes already saved from that playlist.

This keeps the product behavior clean: playlist sync is just a way to feed new sources into the same import inbox.

### YouTube Transcript Architecture

The YouTube transcript path keeps the one-tap share experience while reducing operational risk:

1. The user shares a YouTube URL to Rekky.
2. Rekky saves the import immediately.
3. Rekky checks for a cached transcript by YouTube video id.
4. If a cached transcript exists, the import job uses it without another YouTube request.
5. If no cached transcript exists, Rekky checks the user's daily YouTube transcript job cap.
6. If the user is under the cap and the global cap has room, Rekky attempts the optional transcript adapter.
7. A found transcript is cached globally and reused for later imports of the same video.
8. A missing or failed transcript is negative-cached with a cooldown, so repeated shares do not hammer the source.
9. If transcript extraction fails, Rekky falls back to YouTube metadata, linked recipe pages, or user-supplied details.

This preserves the low-friction mobile product shape while avoiding a centralized "every share always hits YouTube right now" design.

### MVP Scope

1. Native share target for URL/text on mobile.
2. Manual URL import in the web app.
3. Social import cards in Rekky.
4. YouTube metadata ingestion through official APIs.
5. Generic webpage and linked recipe page extraction.
6. TikTok and Instagram quick-save with allowed preview/attribution only.
7. Recipe draft generation from eligible text sources.
8. Confidence and missing-field review UI.
9. Save final draft to the user's recipe library.

### MVP Success Criteria

- A user can share a YouTube Short to Rekky and see a saved import immediately.
- If the YouTube description or linked page contains recipe text, Rekky drafts a usable recipe.
- If the source is Instagram or TikTok and only embed metadata is available, Rekky saves the source and clearly explains what input is needed to create the recipe.
- A failed import still leaves a useful saved item.
- Every generated recipe keeps source attribution.

## Later Enhancements

- User-uploaded video processing.
- Audio transcription for user-provided media.
- OCR for user-provided screenshots or videos.
- Creator claim flow.
- Creator-verified recipe publishing.
- Browser extension for desktop saves.
- Import inbox with batch processing.
- Cook mode from imported recipes.
- Shopping list generation.
- Source comparison when multiple users import the same video.
- Community corrections for common viral recipes.

## User-Perspective Review

### Core User Insight

The user is not primarily buying extraction. The user is buying relief from losing food inspiration across scattered social feeds. Extraction is the premium outcome, but reliable saving, retrieval, attribution, and later conversion are the foundation.

This changes the product priority:

1. Save every shared food link reliably.
2. Organize it well enough to find later.
3. Convert it to a recipe when source signals are strong.
4. Ask for help only when the missing information matters.
5. Let the user cook, edit, or keep the import as inspiration.

If Rekky succeeds at saving but sometimes cannot extract, the product can still feel useful. If Rekky promises extraction and loses or mangles the source, the product will feel untrustworthy.

### What Will Make This Feel Great

The strongest experience is not "AI magically understands every social video." That promise will fail too often. The strongest experience is "Rekky never loses my inspiration and usually turns it into something useful."

The product should feel great in these moments:

- The user shares a video and instantly sees it saved.
- The user can return later and find the original video, not just the generated recipe.
- Rekky tells the user what it found in plain language.
- Rekky distinguishes exact source facts from estimates.
- The user can fix missing fields quickly.
- The recipe is cookable, not just summarized.
- Rekky remembers that this came from a creator and preserves credit.
- Low-confidence imports are still organized and useful.

### User Jobs

Users are not only asking "extract a recipe." They may be trying to:

- Save inspiration before they forget it.
- Build a cooking queue for the week.
- Compare several versions of the same viral dish.
- Recreate a creator's exact result.
- Adapt a viral dish to their diet or pantry.
- Cook from a short video without rewatching it repeatedly.
- Share a recipe with a partner or household.
- Avoid losing recipes across TikTok, Instagram, YouTube, and browser bookmarks.

The product should support these jobs separately. A single "import recipe" button is too narrow.

### Hidden User Needs

#### Trust

If Rekky guesses quantities without saying so, users may cook bad food and lose trust. Imported recipes need confidence indicators, but those indicators should be subtle and useful. Avoid a scary technical score. Prefer labels:

- "From creator"
- "Found in caption"
- "Estimated by Rekky"
- "Needs your check"

#### Speed

Users sharing from social apps are often browsing, not planning a cook. The share extension must be fast. It should not require a full account flow, long loading screen, or multi-step recipe review before the source is saved.

#### Retrieval

The real pain is not only extraction. It is finding the thing again. Social imports need filters:

- Platform.
- Creator.
- Dish type.
- Saved but not processed.
- Ready to cook.
- Needs review.
- Cooked.

#### Cooking Usability

A recipe card generated from a video must be better than a transcript. It needs:

- Consolidated ingredients.
- Ordered method.
- Timings.
- Sensory cues.
- Equipment.
- Make-ahead and storage notes when inferable.
- Source video attached for visual reference.

#### Editing

The import will often be 80 percent right. Editing must be lightweight. Users should be able to tap an ingredient amount, serving count, or step and correct it without entering a full document editor.

#### Attribution

Users may care about the creator. Creators definitely will. Attribution should be visible and respectful:

- Creator name.
- Original platform.
- Original link.
- "Generated by Rekky from available source text and user edits."

#### Privacy

Saved food videos can reveal diet, culture, health needs, religion, pregnancy, budget, or location. Imports should be private by default. Sharing or community features should be explicit.

## Weaknesses And Mitigations

### Weakness: Platform Access Is Worse Than The User Expects

Users will assume "I shared a video, so Rekky can watch it." Often Rekky will only have a URL and limited metadata.

Mitigation:

- Design the product around saving first.
- Use clear statuses:
  - "Saved"
  - "Looking for recipe text"
  - "Draft ready"
  - "Needs caption or details"
- Avoid promising full video analysis unless media access is actually available.

### Weakness: Low-Quality Viral Videos Are Often Not Real Recipes

Many clips omit quantities, hide failed steps, exaggerate timing, or are optimized for views rather than cooking success.

Mitigation:

- Add a verifier that checks ingredient-step consistency and cooking plausibility.
- Label viral shortcuts as assumptions.
- Add "Make this actually cookable" as a Rekky transformation.
- Use culinary judgment to repair gaps, but mark repairs as estimates.

### Weakness: The Recipe May Not Be The Creator's Actual Recipe

If Rekky infers too much, users may think the result is creator-authored.

Mitigation:

- Use wording like "Draft inspired by this source" unless the recipe text is explicitly found.
- Reserve "Creator recipe" or "Verified" for creator-provided or source-exact recipes.
- Keep source citations per field.

### Weakness: Import Latency Could Feel Broken

Some imports will take seconds, others minutes. Users may leave the app.

Mitigation:

- Create the saved card synchronously.
- Use background jobs.
- Send push/in-app notifications when drafts are ready.
- Show useful partial states rather than one spinner.

### Weakness: Review UI Could Become Work

If every import requires the user to review a complex form, the feature stops feeling magical.

Mitigation:

- Only ask about missing high-impact fields.
- Allow "Save draft anyway."
- Allow "Estimate for me."
- Allow "Keep as inspiration."
- Use inline chips for corrections instead of long forms.

### Weakness: Users May Import Non-Recipe Food Videos

Restaurant clips, mukbangs, grocery hauls, and food memes may not contain cookable recipes.

Mitigation:

- Classify imported content:
  - recipe
  - technique
  - restaurant dish
  - ingredient idea
  - inspiration
  - non-cooking
- Offer the right next action. For a restaurant dish, route to recipe recreation. For a technique, save as a technique note.

### Weakness: Duplicate Saves Will Pile Up

Users may share the same viral recipe from multiple platforms or save the same URL twice.

Mitigation:

- Deduplicate by canonical URL and provider content ID.
- Detect similar drafts by title, creator, and ingredients.
- Let users merge imports into one recipe.

### Weakness: Copyright And Creator Trust

Creators may object if Rekky appears to copy their recipes without attribution or permission.

Mitigation:

- Preserve prominent source attribution.
- Link back to the original.
- Distinguish source-exact from inferred recipes.
- Give creators a claim flow.
- Support takedown and opt-out policies.
- Prefer creator partnerships for verified recipes.

### Weakness: The Best Experience Requires Mobile App Work

Native share extensions are essential, but the current app may be web-first.

Mitigation:

- Ship manual URL import on web first.
- Add Android share intent next if Android is the fastest mobile path.
- Add iOS Share Extension when native shell exists.
- Keep the backend pipeline platform-agnostic.

### Weakness: User Expectations Around "Exact Ingredients"

The user asked for exact ingredients, but social videos often do not provide them. Overclaiming exactness is dangerous.

Mitigation:

- Use "exact" only when the source states exact quantities.
- Otherwise say "estimated" or "inferred."
- Provide an "accuracy mode" toggle:
  - Fast draft.
  - Careful recreation.
  - Ask me to confirm missing details.

### Weakness: International And Multilingual Content

Food videos often mix languages, regional ingredient names, slang, and local measures.

Mitigation:

- Preserve original ingredient names alongside translated names.
- Normalize units but keep source units visible.
- Use locale-aware substitutions.
- Ask clarification for culturally specific ingredients rather than replacing them with generic guesses.

### Weakness: Safety

Short videos often omit safe internal temperatures, storage rules, allergen risks, or pressure-cooking details.

Mitigation:

- Add safety checks for meat, seafood, eggs, canning, fermentation, deep frying, pressure cooking, and allergens.
- Add safety notes only when relevant.
- Do not infer unsafe shortcuts.

## Open Questions

1. What is the first mobile surface: native Android, native iOS, React Native shell, PWA share target, or manual URL import?
2. Should social imports live in the recipe library immediately, or in an import inbox until reviewed?
3. What confidence threshold makes a recipe "ready to cook"?
4. How should Rekky price or rate-limit expensive media analysis?
5. What creator attribution language is legally and socially safest?
6. Should users be allowed to share imported/generated recipes publicly?
7. How should takedown and creator opt-out work?
8. Should imported recipes train future personalization, or only after the user cooks/saves them?
9. How should household and dietary constraints be applied to imported recipes?
10. Which provider should be the first official API integration?

## Recommended First Milestone

Build "Social Save + Text Recipe Draft."

Scope:

1. Manual URL import in the web app.
2. Backend `SocialImport` and `ImportJob`.
3. YouTube metadata ingestion.
4. Generic linked recipe page extraction.
5. Recipe draft generation from eligible text.
6. Import inbox with statuses.
7. Save draft to recipe library.
8. TikTok and Instagram quick-save with attribution and no extraction beyond permitted use.

This gives users immediate value, creates the core data model, avoids the highest platform-risk behavior, and sets up the later native share extension and media-processing work.
