# Cooking Assistant Runtime Design

Status: current implementation review, June 11, 2026

This document explains what the cooking chat assistant is actually told, what it can
actually do, and which parts of the runtime can affect reply quality and latency. It
describes the current code rather than an idealized product design.

## Executive Summary

The cooking chat is a dedicated agent pipeline, separate from ordinary LibreChat
conversation handling. The product is named **Rekky**, and the visible cooking
assistant is named **Samwise**. Routine response turns use
`google/gemini-3.1-flash-lite` through OpenRouter by default, with
`deepseek/deepseek-v4-pro` as a failure fallback. Configured complex and repair
models can be selected for risk-classified turns.

For each user turn, the server sends the model:

1. A JSON-only planning call with privacy-safe context facts and capability state.
2. A task-specific preference brief, never the raw full saved profile.
3. Relevant document/source context selected by the validated plan.
4. A dynamically selected set of document and web-research tools.
5. A prompt profile whose detail depends on routine, document, source/research, or
   active-canvas discussion work.
6. A deterministic delivery mode that controls chat length and shape.
7. Prior chat history and the new user message.

The model is intended to converse naturally for ordinary questions and only create or
modify a canvas when the user wants a durable recipe, guide, or prep plan. Web sources
are intended to support an answer, never replace it. Completed response text is
buffered until a quality gate accepts it or a single repair pass succeeds; rejected
first drafts are not streamed to the user. Once accepted, buffered responses are
revealed to the client in semantic blocks such as paragraphs or list items, not fake
character-level typing.

The system can be slow because a single user action may invoke multiple model calls,
web extraction calls, and a same-provider fallback retry. It can be over-directed
because planning, quality repair, or optional follow-up suggestions can add provider
calls even when response prompts are now slimmer for routine turns.

## Product Identities

| Concern                                           | Current value | Where it is set                                       |
| ------------------------------------------------- | ------------- | ----------------------------------------------------- |
| Product/app identity                              | Rekky         | application configuration and UI strings              |
| Assistant sender shown in stored cooking messages | Samwise       | `api/server/routes/cooking.js`                        |
| Persona named in the cooking system prompt        | Samwise       | `packages/api/src/cooking/agent.ts`                   |
| Configured UI endpoint label                      | OpenRouter    | `librechat.yaml`, `client/src/utils/rekkyDefaults.ts` |

The Rekky/Samwise split is intentional product language: Rekky is the app, while
Samwise is the cooking assistant persona.

### Compatibility Identifiers

Public branding does rename compatibility identifiers. The MongoDB
database is `rekky`, and specialty ingredient illustrations are keyed by
`rekky-ingredient-v1`. New user-facing product copy should use Rekky.

## Request Path

```text
User types in /cook
  -> client builds a normal chat submission marked with cookingBridge
  -> POST /api/cooking/chat (SSE)
  -> route normalizes uploaded files and restores the latest recipe image when needed
  -> route loads saved preferences and active conversation documents
  -> runCookingChat builds runtime facts and obtains a validated cooking turn plan
  -> runCookingChat selects prompt profile, tools, and response/repair model route
  -> OpenRouter model may answer or call tools
  -> document/web tools execute, then the model may run again
  -> response text is validated/repaired before it is emitted to SSE
  -> route stores user and assistant messages plus source/suggestion metadata
  -> UI shows chat text, optional source cards, optional prompt chips, and canvas
```

The bridge is selected in `packages/data-provider/src/createPayload.ts`. The Express
route in `api/server/routes/cooking.js` handles streaming, persistence, and
post-response preference curation. Agent behavior lives primarily in
`packages/api/src/cooking/agent.ts`.

Cooking-created SSE events are tagged so the client can anchor the viewport to the
assistant response start instead of following the bottom of a growing answer. Long
responses therefore preserve the readable beginning of the answer and rely on the
existing jump-to-latest control when the user wants to move to the end.

## What The Model Receives

### Prompt Assembly

The first model message is a system message assembled in this order:

| Prompt segment                     | Source                                                       | Purpose                                                                   |
| ---------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `promptPrefix`                     | client/request payload, when supplied                        | Additional caller instruction                                             |
| Task-specific preference brief     | preferences store plus validated plan                        | Exposes hard rules and selected relevant context only                     |
| Web availability note              | web context                                                  | Tells model when web credentials/tools are unavailable                    |
| Conversation document list         | cooking drafts                                               | Identifies all recipe/guide/prep documents and the selected one           |
| Selected document markdown         | selected draft, up to 18,000 chars when permitted by profile | Lets model discuss or revise the open canvas                              |
| Linked-source requirement          | latest message URL scan                                      | Requires source reading before source-driven mutations                    |
| Preloaded linked-source extraction | Tavily result, when a URL was pasted                         | Gives source content before the first provider turn                       |
| Attached-image source requirement  | current upload or restored historical recipe image           | Makes the visible image facts control source-faithful recipe work         |
| Current product/tool state         | dynamic tool selector                                        | Explains which actions are possible now                                   |
| Chat delivery rules                | deterministic planner/runtime mode                           | Keeps chat concise, action-first, and distinct from canvas content        |
| Main cooking instructions          | prompt profile                                               | Defines only the voice, document, and sourcing rules needed for this turn |

The server then appends earlier non-error, finished messages for the current
conversation and finally the latest user message.

### Behavioral Instructions

The main instruction block currently asks the model to behave as follows:

| Area                   | Instruction given to the model                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Voice                  | Be vivid, candid, practical, curious, and personable; do not imitate a real chef or presenter.                                                                                                                      |
| Chat versus canvas     | Use chat for explanation, diagnosis, comparison, reassurance, and decision support. Use document mutation only for durable cooking work the user wants to keep.                                                     |
| Existing canvas        | Do not silently alter a selected document merely because an idea was discussed. Ask before preserving ambiguous variants.                                                                                           |
| Document creation      | Create a new document for a distinct recipe, guide, prep plan, imported source recipe, or explicitly preserved variant.                                                                                             |
| Document revision      | Revise the selected document for substitutions, scaling, timing, equipment alternatives, adaptations, notes, or restructuring.                                                                                      |
| Saving                 | Never claim a recipe has been saved to the library; saving is user initiated.                                                                                                                                       |
| Preferences            | Treat Safety, Diet, and Religious & Cultural Rules as hard constraints. Treat other preferences as soft context.                                                                                                    |
| Routine cooking        | Do not browse for ordinary recipes, dish ideas, or technique guidance when culinary knowledge is sufficient.                                                                                                        |
| Research               | Browse only when the request materially needs external evidence, such as supplied URLs, verification, current availability, products, food safety, authenticity comparison, or restaurant/menu recreation.          |
| Source use             | Sources must be supporting evidence. The assistant must still answer substantively in its own voice and must not return only a bibliography or a thin source summary.                                               |
| Recipe image use       | Treat an attached recipe screenshot as a controlling source. Preserve visible quantities, groups, variants, yield, temperatures, timing, and method; ask about unreadable critical facts instead of inventing them. |
| Recipe document format | Produce structured, highly detailed markdown with orientation, ingredients, method, sensory cues, timers, troubleshooting, serving notes, and purposeful variations when applicable.                                |

### Delivery Modes

The planner does not ask the model to choose response length. Runtime derives a
`deliveryMode` from the validated intent, action, prompt profile, and current user text:

| Mode                  | When used                                                                     | Chat contract                                                                |
| --------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `glance`              | Quick recommendations, active cooking cues, clarifications, canvas follow-ups | 40-90 words where possible; answer first; at most three short bullets        |
| `standard`            | Normal cooking guidance without explicit deep explanation                     | 100-180 words where possible; clear answer before explanation                |
| `deep_dive`           | User explicitly asks why, comparison, tradeoffs, or detailed explanation      | Structured explanation is allowed, but still starts with the practical point |
| `canvas_confirmation` | Successful document creation or revision                                      | One short sentence; do not repeat the recipe or canvas content in chat       |

The quality gate can record advisory labels when a reply is too verbose, buries the
useful action, opens with excessive preamble, or repeats full canvas content. These
labels guide repair and diagnostics, but they are not allowed to hide an otherwise
useful answer from the user.

These instructions are strong enough to shape normal answers even when no document is
being created. A simple conversational turn still carries the full recipe-document
contract unless the provider chooses to ignore irrelevant parts.

### Other Context Provided Indirectly

After each cooking response, a background preference curator may review accumulated
conversation turns and update durable saved preferences. It is instructed not to save
one-off recipe requests, temporary ingredients, casual curiosity, or unconfirmed
long-term goals. On later chats, the resulting preferences markdown is passed back
into the cooking system prompt.

### Conversation Categories

Each Samwise conversation stores one broad `cookingCategory` for history organization:

| Category       | Session purpose                                                         |
| -------------- | ----------------------------------------------------------------------- |
| `ideas`        | Deciding what to cook, recommendations, planning, or flavor exploration |
| `recipes`      | Creating, importing, or recreating a recipe                             |
| `saved_recipe` | Discussing a recipe opened from the user's saved Cooking Library        |
| `adjustments`  | Substituting, scaling, adapting, or otherwise revising a recipe         |
| `cooking_help` | Technique, troubleshooting, food safety, or active cook-along guidance  |

The category module derives a category from the planner's validated intent and action,
without adding another model field or model call. Runtime merges it with the stored session
category in this precedence order: `saved_recipe`, `recipes`, `adjustments`, `cooking_help`,
then `ideas`. Categories can therefore become more specific as a session develops but
cannot be demoted by a weaker follow-up. A conversation containing a recipe document is
always categorized as `recipes`, regardless of later questions or adjustments, unless it
was created from a saved library recipe. Saved-recipe chats are assigned by verified recipe
ID at conversation creation and remain `saved_recipe` for the whole session. The resolved
category is stored on the conversation and copied into the assistant message metadata for
diagnostics.

Starting a saved-recipe discussion uses a dedicated backend operation. Ownership is checked
with a side-effect-free existence query rather than the full recipe detail loader, so chat
authorization does not trigger legacy repairs or illustration scheduling. The operation then
creates the conversation document and persists the conversation provenance. If conversation
persistence fails, it removes the newly created document before returning the error; if that
rollback also fails, a typed error retains both failures for diagnostics.

## Tools The Model Can Use

The agent does not receive every tool on every turn. Tool exposure changes according
to the validated planner output, canvas state, linked URLs, and web configuration.

### Document Tools

| Tool                      | When exposed                                                                                                            | Effect                                                                                      | User-visible consequence                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `create_cooking_document` | When the planner selects document work, or when runtime fallback keeps document capability available for model judgment | Creates and selects a new `recipe`, `guide`, or `prep_plan` document from complete markdown | Canvas opens or gains a new tab; chat shows the tool's short `user_message` |
| `read_cooking_document`   | Only when a selected canvas already exists                                                                              | Returns exact selected document markdown to the model                                       | No direct UI change; may require another model turn                         |
| `revise_cooking_document` | Only when a selected canvas already exists                                                                              | Replaces the selected document with complete revised markdown                               | Canvas updates; chat shows a short change message                           |

Canvas mutation is validated by runtime policy. A created or revised document
must contain one top-level title, an Ingredients or Shopping List section, and an
Instructions, Method, Steps, or equivalent actionable section. A revision must differ
from the existing markdown.

Important behavior: after a successful `create_cooking_document` or
`revise_cooking_document` call, the runtime returns immediately using the tool's
short `user_message`; it does not ask the model for a fuller explanatory chat
response. The durable content is expected to be read in the canvas.

### Research Permission Tool

| Tool                        | When exposed                                                                                       | Effect                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `request_external_research` | When Tavily web tools are configured but the planner has not already selected source/research work | Allows the model to explain why research is needed and unlock web tools for the remainder of the turn |

The unlock call must contain a recognized research type and a specific reason of at
least 20 characters. This is intended to preserve agent discretion without making web
search the default for recipe inspiration.

### Web Tools

Web tools are backed by Tavily and are exposed immediately when the validated planner
selects source/research work, when a pasted URL creates a source-reading requirement,
or later when the model successfully calls `request_external_research`.

| Tool                 | Purpose                                                         | Typical output returned to the model                                                    |
| -------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `search_web`         | Search public sources for external evidence                     | Up to 3 focused or 5 broad search results with snippets/raw content and source metadata |
| `read_web_page`      | Extract a non-recipe public page such as a menu or product page | Cleaned extracted page text plus source metadata                                        |
| `read_recipe_source` | Extract a user-supplied or selected recipe page                 | Page text plus inferred ingredients/instructions, confidence, and warnings              |

URLs in the user's latest message have special behavior: the backend attempts to read
each URL as a recipe source before the first model call. The extracted content is
inserted into the system prompt, and canvas creation/revision from a linked source is
blocked until the source read requirement has been satisfied.

### Presentation Tool

| Tool                     | Exposure                                                                                                                                   | Effect                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `set_prompt_suggestions` | Not offered during the initial answer loop; offered in a separate forced post-processing call when the completed reply includes a question | Produces up to three clickable suggested follow-up prompts |

The runtime also removes text-emitted `set_prompt_suggestions(...)` syntax if a model
incorrectly writes it into normal prose.

## When Web Research Is Enabled

Tool availability is now planner-led. The planner receives the current user text,
recent user messages, linked-source state, capability facts, and preference section
titles, then proposes whether the turn is source/research work. Runtime policy
validates that proposal against available credentials, source-reading requirements,
and tool capability limits.

Pasted HTTP(S) URLs remain a hard runtime fact: the backend attempts source reading
before the first response-model call and blocks source-faithful canvas mutation until
the source has been read or the user is asked to paste unavailable recipe text.

Uploaded recipe images are also hard runtime source facts, but they follow a
multimodal path instead of the web path. The chat route persists normalized image-file
metadata on the user message. If a later turn refers to that recipe without uploading
the image again, the route finds the latest prior user image, reconstructs its provider
image block through the configured file-storage strategy, and includes it in chat
history. The planner receives only image availability/count facts, while the response
model receives the actual image. Requests such as `give me this recipe` or `create the
recipe canvas` are routed as source-driven document work.

An attached image alone does not enable Tavily or generate web-source cards. Web tools
remain available only when the request independently needs external evidence. If an
image can no longer be read from storage, the request continues without crashing; the
assistant must ask for the missing source or the specific unreadable fact rather than
claiming source fidelity.

If the planner does not expose web tools but the response model realizes external
evidence is needed, it can call `request_external_research` with a specific reason.
That unlocks web tools for the remainder of the turn without making ordinary recipe
inspiration browse by default.

For an ordinary request such as `blueberry cheese cake`, current tests assert that web
tools are not exposed and no source cards should be generated.

## Source Handling And The Sources-Only Failure Mode

Research results are gathered in backend metadata and shown by the frontend below the
assistant reply as **Cooking sources** cards. The source cards are supplemental UI,
not intended to be the reply.

The current server includes explicit defenses against the observed sources-only
failure:

1. The system prompt says web results are working evidence and forbids returning only
   sources or a thin summary.
2. If sources exist but the assistant response has no inline markdown citation, the
   backend makes a correction model call requesting a cited rewrite.
3. If the draft response is only attribution/source lines, the correction call
   requests a substantive answer to the original user request.
4. If correction still returns only attribution, the backend discards both the empty
   answer and the exposed sources rather than intentionally presenting source cards as
   a response.

Therefore, if a new response still displays only source cards under the current
runtime, likely causes include a stale frontend/backend build, a path outside
`/api/cooking/chat`, persisted old messages, or a new gap in the attribution-only
detector. It is no longer the stated intended behavior.

## Provider And Latency Model

### Providers

| Operation                   | Provider/model by default                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Main cooking reply          | OpenRouter, `google/gemini-3.1-flash-lite`                                                                      |
| Main reply fallback         | OpenRouter, `deepseek/deepseek-v4-pro`                                                                          |
| Complex planning/response   | `COOKING_AGENT_COMPLEX_MODEL`, when configured, for safety, source/research, and document mutation risk classes |
| Planner override            | `COOKING_AGENT_PLANNER_MODEL`, when configured for non-elevated planner turns                                   |
| Quality repair override     | `COOKING_AGENT_REPAIR_MODEL`, when configured; otherwise the complex or response model                          |
| Web search/page extraction  | Tavily                                                                                                          |
| Saved document illustration | OpenRouter, `google/gemini-2.5-flash-image`                                                                     |
| Batched preference curation | OpenRouter, normally the cooking model unless configured separately                                             |

Illustration generation and background preference curation are separate from producing
the immediate cooking-chat reply. They can affect library images or later
personalization but should not block the initial answer.

### Provider Calls Per User Turn

| Scenario                                           | Main-provider calls, excluding fallback retries                    | Additional external work                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Direct ordinary answer with no follow-up question  | 2                                                                  | Planner call plus response call                                                      |
| Direct answer ending in a meaningful question      | 3                                                                  | Planner and response calls, then suggestion chips                                    |
| Empty model answer                                 | 2 or more                                                          | Second call recovers visible answer; suggestions may add another call                |
| Document creation or revision succeeds immediately | 1                                                                  | Database mutation; runtime returns the short tool message without another prose call |
| Model inspects document before answering           | At least 2                                                         | Database read tool between calls                                                     |
| Web research requested or pre-enabled              | At least 2 if a web tool is called                                 | One or more Tavily requests                                                          |
| Researched answer needs citation repair            | One extra correction call, potentially attempted with fallback too | None beyond research                                                                 |
| Answer fails response quality validation           | One extra repair call                                              | Rejected first draft is not emitted                                                  |
| Tool loop continues                                | Up to 5 model turns                                                | Tool work between turns                                                              |

Each provider call defaults to a 45-second timeout. A retryable failure before any
visible text is streamed is retried with the fallback model. Because both defaults
use the same OpenRouter host, a host/DNS outage can make one attempted response wait
about 90 seconds without increasing the chance of success.

### Streaming Behavior

Provider responses may arrive as streams internally, but user-visible cooking text is
buffered until citation and response-quality validation complete. Once validated, the
route emits the accepted answer through SSE. This prevents privacy or workflow-policy
failures from appearing briefly before repair, at the cost of increased
time-to-first-visible-text.

## Persistence And UI Responsibilities

| Layer                             | Responsibility                                                                                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chat route                        | Persists user message, normalized file/source metadata, Samwise response, conversation data, prompt suggestion metadata, and source metadata; restores the latest prior recipe image for follow-up turns; queues preference curation |
| Cooking document service          | Stores conversation documents, selected document, and cooking-session snapshots                                                                                                                                                      |
| Saved-recipe discussion operation | Verifies recipe ownership, creates the initial document, persists saved-recipe provenance, and compensates for partial persistence failures                                                                                          |
| Cooking workspace                 | Displays either full chat or chat alongside the selected canvas; supports multiple document tabs and deletion                                                                                                                        |
| Recipe canvas                     | Displays and allows user-driven saving of document markdown into the library                                                                                                                                                         |
| Recipe library                    | Displays saved recipes/guides/prep plans and asynchronously generated illustrations                                                                                                                                                  |
| Message renderer                  | Shows prompt suggestion chips and source cards from message metadata                                                                                                                                                                 |

The assistant cannot save a recipe to the library through its current tool surface.
It creates or revises conversation documents; the user presses **Save** in the
canvas to create a library item.

## Factors That Can Degrade Answer Quality

### 1. Planner And Validation Failures Can Still Shape Simple Answers

Routine turns now use a slim prompt profile and suppress unrelated document context.
They still depend on a planner proposal and an LLM semantic quality check. Malformed
planning falls back to non-semantic runtime context. If semantic repair fails but
hard boundaries still pass, the runtime can keep the model answer rather than
substituting a canned recipe template.

### 2. Canvas Mutations Intentionally Produce Very Short Chat Replies

Once a document mutation succeeds, the chat response is deliberately reduced to one
short sentence such as “I created X in the cooking canvas.” That is efficient when
the canvas is visible, but can feel like a weak answer if the user expected a
conversational introduction or if UI state fails to foreground the new document.

### 3. Web Research Adds a Rewrite Layer

Web research is designed to improve accuracy, but a researched answer is subject to
citation filtering and possibly a correction model call. This can change or shorten a
good first draft. The policy is necessary to prevent ungrounded citations and
sources-only output, but it increases complexity in the answer path.

### 4. Keyword-Based Evidence Detection Can Make Research Too Eager

The runtime can expose web tools based on wording before the model reasons about need.
A question using terms such as “traditional” or “equipment” may start down a research
path when knowledgeable conversation would have been sufficient. Conversely, the
model must explicitly ask to unlock research if the heuristic does not identify a
genuine external-evidence need.

### 5. Identity Is Split Between Rekky And Samwise

The app is Rekky and the assistant is Samwise. Keep that distinction explicit in
product copy and prompts so tone evaluation stays consistent.

## Factors That Can Degrade Performance

### High-Impact Paths

| Issue                                                          | Effect                                                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Same-host fallback retry after provider timeout or DNS failure | A failed answer can take roughly 90 seconds instead of 45 seconds                                   |
| Suggestion generation after replies containing questions       | Adds a model call to otherwise successful conversational turns                                      |
| Citation repair for researched answers                         | Adds a model call and delays visible text                                                           |
| Mandatory planning call                                        | Adds one provider call before response generation                                                   |
| Buffered validation and possible repair                        | Delays first visible text; prevents rejected text from being displayed                              |
| Preloading pasted recipe URLs                                  | Adds Tavily extraction time before the model starts responding                                      |
| Full selected canvas inserted into system context              | Increases request size, particularly for long recipes/guides                                        |
| Up to five agent/tool cycles                                   | Correct for agentic workflows, but potentially expensive if the model chooses unnecessary tool work |

### Observability Gap

The API route collects timing events for planning metadata, routed response models,
quality outcomes and repairs, web setup, provider attempts, tool execution, and
response output. The active runtime log output has been observed to
print the `[CookingPerf] /api/cooking/chat` event without rendering the structured
timing payload. That makes it difficult to tell whether slowness came from:

- provider connection or generation;
- fallback retry;
- Tavily extraction/search;
- tool loops;
- citation repair;
- suggestion generation; or
- persistence.

Quality and performance tuning should be based on visible per-stage metrics rather
than only the final timeout error in the UI.

## Current Design Assessment

The current design is agentic in an important way: the model decides whether to
answer, inspect a document, create a durable document, revise it, or request web
research. It is not hardcoded to create a recipe for every cooking phrase, and web
research is no longer intended to run for ordinary inspiration.

The runtime also applies hard guardrails where agent discretion alone is not
enough: canvas validity, source-driven recipe integrity, research-unlock validation,
source-only response repair, and user-controlled library saving.

The central tradeoff is that the system is now doing several jobs in one prompt and
one orchestration loop:

- friendly cooking conversation;
- durable recipe/guide/prep-plan authoring;
- web research and citation enforcement;
- personalization from saved preferences;
- follow-up UI generation.

That breadth explains both strengths and current weaknesses. The model has useful
capabilities and clear guardrails, but routine answers can bear the cognitive and
latency cost of workflows that are relevant only to some turns.

## Decisions To Evaluate Next

These are design questions raised by the current implementation, not changes made by
this document:

1. Should routine conversational turns receive a shorter instruction profile, with
   full canvas-authoring requirements injected only when document work is likely or
   requested?
2. Should a successful canvas mutation return a brief conversational orientation in
   addition to the mutation confirmation, or is the visible canvas sufficient?
3. Should prompt suggestion chips require a separate provider call on every reply
   ending in a question, or can that enrichment be more selective?
4. Should timeouts and network failures retry only against a genuinely independent
   provider, while model-specific availability errors continue to use OpenRouter
   fallback?
5. Which terms should automatically enable research tools, and which should leave the
   decision to the agent?
6. Should product copy continue to present Rekky as the app and Samwise as the
   cooking assistant in every user-visible surface?
7. Which performance events need to be exposed in development logs and production
   telemetry to measure answer quality and latency reliably?

## Implementation Map

| Module                                                 | Role in this design                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/api/src/cooking/agent.ts`                    | System instructions, prompt construction, tool selection/execution, provider loop, source correction, suggestions, timing events            |
| `packages/api/src/cooking/web.ts`                      | Tavily-backed search and extraction tools, URL safety checks, recipe fact extraction                                                        |
| `packages/api/src/cooking/service.ts`                  | Conversation document persistence and cooking-session persistence                                                                           |
| `packages/api/src/cooking/savedRecipeDiscussion.ts`    | Saved-recipe discussion startup, ownership verification, provenance persistence, and compensating rollback                                  |
| `packages/api/src/cooking/canvas.ts`                   | Validation/recognition of usable canvas markdown                                                                                            |
| `packages/api/src/preferences/batch.ts`                | Background curation of durable preferences learned from chat                                                                                |
| `packages/api/src/recipes/service.ts`                  | Saved library documents, categorization, and illustration scheduling                                                                        |
| `packages/api/src/recipes/illustrate.ts`               | Library illustration generation prompt/provider                                                                                             |
| `api/server/routes/cooking.js`                         | Authenticated SSE chat API, context loading, image-source restoration, message persistence, response metadata, performance trace collection |
| `packages/data-provider/src/createPayload.ts`          | Client-to-server routing into the cooking chat bridge                                                                                       |
| `client/src/routes/ChatRoute.tsx`                      | Cooking route setup, default model selection, document queries, workspace composition                                                       |
| `client/src/components/Cooking/Workspace.tsx`          | Chat/canvas layout and visible document selection                                                                                           |
| `client/src/components/Cooking/WebSources.tsx`         | Displays supporting source cards saved on assistant messages                                                                                |
| `client/src/components/Cooking/PromptSuggestions.tsx`  | Displays suggested next-turn chips                                                                                                          |
| `client/src/components/Cooking/RecipeCanvas.tsx`       | Displays active document and provides user-initiated save/update actions                                                                    |
| `client/src/components/Chat/landingLayout.ts`          | Central responsive geometry for the landing stage, composer, and suggestion rail                                                            |
| `client/src/hooks/Input/transcriptionSession.ts`       | Preserves pre-recording text and composes stable final/interim speech transcripts                                                           |
| `client/src/hooks/Chat/useStartCookingConversation.ts` | Owns cache invalidation and new cooking-conversation startup order                                                                          |
| `client/src/utils/rekkyDefaults.ts`                    | Client default endpoint, model, and assistant display constants                                                                             |
| `librechat.yaml`                                       | OpenRouter endpoint and Tavily web-search configuration                                                                                     |
