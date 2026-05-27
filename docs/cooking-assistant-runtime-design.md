# Cooking Assistant Runtime Design

Status: current implementation review, May 27, 2026

This document explains what the cooking chat assistant is actually told, what it can
actually do, and which parts of the runtime can affect reply quality and latency. It
describes the current code rather than an idealized product design.

## Executive Summary

The cooking chat is a dedicated agent pipeline, separate from ordinary LibreChat
conversation handling. The visible assistant is named **Samwise**, while its system
instructions tell the model that its persona is **Mise**. The normal model is
`google/gemini-3.1-flash-lite` through OpenRouter, with
`deepseek/deepseek-v4-pro` as a fallback.

For each user turn, the server sends the model:

1. Saved cooking preferences, when present.
2. A list of cooking documents in this conversation and the selected canvas document.
3. Linked recipe material fetched from the web in advance, when the user pasted URLs.
4. A dynamically selected set of document and web-research tools.
5. A long instruction block defining personality, canvas behavior, sourcing policy,
   and detailed recipe-document format.
6. Prior chat history and the new user message.

The model is intended to converse naturally for ordinary questions and only create or
modify a canvas when the user wants a durable recipe, guide, or prep plan. Web sources
are intended to support an answer, never replace it. There is now a repair step that
rejects a response made only of source attribution and asks the model to answer again.

The system can be slow because a single user action may invoke multiple model calls,
web extraction calls, and a same-provider fallback retry. It can be over-directed
because every turn receives extensive document-writing and sourcing policy even when
the user asks a simple cooking question.

## Product Identities

| Concern | Current value | Where it is set |
| --- | --- | --- |
| Product/app identity | Mise | application configuration and UI strings |
| Assistant sender shown in stored cooking messages | Samwise | `api/server/routes/cooking.js` |
| Persona named in the cooking system prompt | Mise | `packages/api/src/cooking/agent.ts` |
| Configured UI endpoint label | OpenRouter | `librechat.yaml`, `client/src/utils/miseDefaults.ts` |

The Samwise/Mise split is not inherently wrong, but it is a design decision that
should be explicit. At present the assistant may be displayed as Samwise while being
instructed to write in "Mise's own voice."

## Request Path

```text
User types in /cook
  -> client builds a normal chat submission marked with cookingBridge
  -> POST /api/cooking/chat (SSE)
  -> route loads saved preferences and active conversation documents
  -> runCookingChat builds prompt, available tools, and provider requests
  -> OpenRouter model may answer or call tools
  -> document/web tools execute, then the model may run again
  -> route stores user and assistant messages plus source/suggestion metadata
  -> UI shows chat text, optional source cards, optional prompt chips, and canvas
```

The bridge is selected in `packages/data-provider/src/createPayload.ts`. The Express
route in `api/server/routes/cooking.js` handles streaming, persistence, and
post-response preference curation. Agent behavior lives primarily in
`packages/api/src/cooking/agent.ts`.

## What The Model Receives

### Prompt Assembly

The first model message is a system message assembled in this order:

| Prompt segment | Source | Purpose |
| --- | --- | --- |
| `promptPrefix` | client/request payload, when supplied | Additional caller instruction |
| Saved preferences markdown | preferences store | Safety, dietary, household, taste, equipment, and context |
| Web availability note | web context | Tells model when web credentials/tools are unavailable |
| Conversation document list | cooking drafts | Identifies all recipe/guide/prep documents and the selected one |
| Selected document markdown | selected draft, up to 18,000 chars | Lets model reason about or revise the open canvas |
| Linked-source requirement | latest message URL scan | Requires source reading before source-driven mutations |
| Preloaded linked-source extraction | Tavily result, when a URL was pasted | Gives source content before the first provider turn |
| Current product/tool state | dynamic tool selector | Explains which actions are possible now |
| Main cooking instructions | static system prompt | Defines voice, policy, canvas format, and research behavior |

The server then appends earlier non-error, finished messages for the current
conversation and finally the latest user message.

### Behavioral Instructions

The main instruction block currently asks the model to behave as follows:

| Area | Instruction given to the model |
| --- | --- |
| Voice | Be vivid, candid, practical, curious, and personable; do not imitate a real chef or presenter. |
| Chat versus canvas | Use chat for explanation, diagnosis, comparison, reassurance, and decision support. Use document mutation only for durable cooking work the user wants to keep. |
| Existing canvas | Do not silently alter a selected document merely because an idea was discussed. Ask before preserving ambiguous variants. |
| Document creation | Create a new document for a distinct recipe, guide, prep plan, imported source recipe, or explicitly preserved variant. |
| Document revision | Revise the selected document for substitutions, scaling, timing, equipment alternatives, adaptations, notes, or restructuring. |
| Saving | Never claim a recipe has been saved to the library; saving is user initiated. |
| Preferences | Treat Safety, Diet, and Religious & Cultural Rules as hard constraints. Treat other preferences as soft context. |
| Routine cooking | Do not browse for ordinary recipes, dish ideas, or technique guidance when culinary knowledge is sufficient. |
| Research | Browse only when the request materially needs external evidence, such as supplied URLs, verification, current availability, products, food safety, authenticity comparison, or restaurant/menu recreation. |
| Source use | Sources must be supporting evidence. The assistant must still answer substantively in its own voice and must not return only a bibliography or a thin source summary. |
| Recipe document format | Produce structured, highly detailed markdown with orientation, ingredients, method, sensory cues, timers, troubleshooting, serving notes, and purposeful variations when applicable. |

These instructions are strong enough to shape normal answers even when no document is
being created. A simple conversational turn still carries the full recipe-document
contract unless the provider chooses to ignore irrelevant parts.

### Other Context Provided Indirectly

After each cooking response, a background preference curator may review accumulated
conversation turns and update durable saved preferences. It is instructed not to save
one-off recipe requests, temporary ingredients, casual curiosity, or unconfirmed
long-term goals. On later chats, the resulting preferences markdown is passed back
into the cooking system prompt.

## Tools The Model Can Use

The agent does not receive every tool on every turn. Tool exposure changes according
to canvas state, user wording, linked URLs, and web configuration.

### Document Tools

| Tool | When exposed | Effect | User-visible consequence |
| --- | --- | --- | --- |
| `create_cooking_document` | Every cooking chat turn | Creates and selects a new `recipe`, `guide`, or `prep_plan` document from complete markdown | Canvas opens or gains a new tab; chat shows the tool's short `user_message` |
| `read_cooking_document` | Only when a selected canvas already exists | Returns exact selected document markdown to the model | No direct UI change; may require another model turn |
| `revise_cooking_document` | Only when a selected canvas already exists | Replaces the selected document with complete revised markdown | Canvas updates; chat shows a short change message |

Canvas mutation is validated by deterministic code. A created or revised document
must contain one top-level title, an Ingredients or Shopping List section, and an
Instructions, Method, Steps, or equivalent actionable section. A revision must differ
from the existing markdown.

Important behavior: after a successful `create_cooking_document` or
`revise_cooking_document` call, the runtime returns immediately using the tool's
short `user_message`; it does not ask the model for a fuller explanatory chat
response. The durable content is expected to be read in the canvas.

### Research Permission Tool

| Tool | When exposed | Effect |
| --- | --- | --- |
| `request_external_research` | When Tavily web tools are configured but the runtime has not already classified this turn as needing evidence | Allows the model to explain why research is needed and unlock web tools for the remainder of the turn |

The unlock call must contain a recognized research type and a specific reason of at
least 20 characters. This is intended to preserve agent discretion without making web
search the default for recipe inspiration.

### Web Tools

Web tools are backed by Tavily and are exposed immediately when the latest user
request matches a code-level evidence trigger, or later when the model successfully
calls `request_external_research`.

| Tool | Purpose | Typical output returned to the model |
| --- | --- | --- |
| `search_web` | Search public sources for external evidence | Up to 3 focused or 5 broad search results with snippets/raw content and source metadata |
| `read_web_page` | Extract a non-recipe public page such as a menu or product page | Cleaned extracted page text plus source metadata |
| `read_recipe_source` | Extract a user-supplied or selected recipe page | Page text plus inferred ingredients/instructions, confidence, and warnings |

URLs in the user's latest message have special behavior: the backend attempts to read
each URL as a recipe source before the first model call. The extracted content is
inserted into the system prompt, and canvas creation/revision from a linked source is
blocked until the source read requirement has been satisfied.

### Presentation Tool

| Tool | Exposure | Effect |
| --- | --- | --- |
| `set_prompt_suggestions` | Not offered during the initial answer loop; offered in a separate forced post-processing call when the completed reply includes a question | Produces up to three clickable suggested follow-up prompts |

The runtime also removes text-emitted `set_prompt_suggestions(...)` syntax if a model
incorrectly writes it into normal prose.

## When Web Research Is Automatically Enabled

Tool availability is not solely an agent judgment. Before asking the model, the
runtime applies text heuristics. It immediately unlocks web tools if the message:

- Contains an HTTP(S) URL.
- Requests research, comparison, sources, evidence, verification, browsing, citations,
  or references.
- Mentions safety-sensitive concepts such as canning, preservation, food poisoning,
  internal temperature, spoilage, or raw animal products.
- Mentions current availability, price, buying, stores, groceries, brands, products,
  equipment, or manufacturers.
- Mentions restaurants, menus, copycats, recreation, authenticity, tradition, origins,
  regionality, or history.

This means the agent has discretion in some cases, but not all cases. Words such as
`traditional`, `authentic`, `history`, or `equipment` can cause web tools to be
available before the model decides whether they are useful.

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

| Operation | Provider/model by default |
| --- | --- |
| Main cooking reply | OpenRouter, `google/gemini-3.1-flash-lite` |
| Main reply fallback | OpenRouter, `deepseek/deepseek-v4-pro` |
| Web search/page extraction | Tavily |
| Saved document illustration | OpenRouter, `google/gemini-2.5-flash-image` |
| Batched preference curation | OpenRouter, normally the cooking model unless configured separately |

Illustration generation and background preference curation are separate from producing
the immediate cooking-chat reply. They can affect library images or later
personalization but should not block the initial answer.

### Provider Calls Per User Turn

| Scenario | Main-provider calls, excluding fallback retries | Additional external work |
| --- | --- | --- |
| Direct ordinary answer with no follow-up question | 1 | None |
| Direct answer ending in a meaningful question | 2 | Second call generates suggestion chips |
| Empty model answer | 2 or more | Second call recovers visible answer; suggestions may add another call |
| Document creation or revision succeeds immediately | 1 | Database mutation; runtime returns the short tool message without another prose call |
| Model inspects document before answering | At least 2 | Database read tool between calls |
| Web research requested or pre-enabled | At least 2 if a web tool is called | One or more Tavily requests |
| Researched answer needs citation repair | One extra correction call, potentially attempted with fallback too | None beyond research |
| Tool loop continues | Up to 5 model turns | Tool work between turns |

Each provider call defaults to a 45-second timeout. A retryable failure before any
visible text is streamed is retried with the fallback model. Because both defaults
use the same OpenRouter host, a host/DNS outage can make one attempted response wait
about 90 seconds without increasing the chance of success.

### Streaming Behavior

Normal responses stream model text directly to the chat while it is being generated,
provided no web sources are already present. Once sources exist, streaming is withheld
until citation processing is complete, because the visible answer may need a rewrite.
This can make researched responses feel significantly slower even when the final
answer is correct.

## Persistence And UI Responsibilities

| Layer | Responsibility |
| --- | --- |
| Chat route | Persists user message, Samwise response, conversation data, prompt suggestion metadata, and source metadata; queues preference curation |
| Cooking document service | Stores conversation documents, selected document, and cooking-session snapshots |
| Cooking workspace | Displays either full chat or chat alongside the selected canvas; supports multiple document tabs and deletion |
| Recipe canvas | Displays and allows user-driven saving of document markdown into the library |
| Recipe library | Displays saved recipes/guides/prep plans and asynchronously generated illustrations |
| Message renderer | Shows prompt suggestion chips and source cards from message metadata |

The assistant cannot save a recipe to the library through its current tool surface.
It creates or revises conversation documents; the user presses **Save** in the
canvas to create a library item.

## Factors That Can Degrade Answer Quality

### 1. A Large Instruction Surface Applies To Simple Questions

The assistant always receives extensive personality, tool-choice, sourcing, and
full recipe-document formatting rules. These are valuable for document creation but
may distract a fast model on a simple conversational prompt such as a dish name or a
short substitution question. The prompt also grows when a selected canvas and saved
preferences are included.

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

### 5. Identity Is Split Between Mise And Samwise

The displayed assistant name is Samwise, but the prompt repeatedly directs the model
to speak as Mise. This should be resolved deliberately in product language, because
identity ambiguity makes tone evaluation harder and can surface inconsistently in
model-generated prose.

## Factors That Can Degrade Performance

### High-Impact Paths

| Issue | Effect |
| --- | --- |
| Same-host fallback retry after provider timeout or DNS failure | A failed answer can take roughly 90 seconds instead of 45 seconds |
| Suggestion generation after replies containing questions | Adds a model call to otherwise successful conversational turns |
| Citation repair for researched answers | Adds a model call and delays visible text |
| Preloading pasted recipe URLs | Adds Tavily extraction time before the model starts responding |
| Full selected canvas inserted into system context | Increases request size, particularly for long recipes/guides |
| Up to five agent/tool cycles | Correct for agentic workflows, but potentially expensive if the model chooses unnecessary tool work |

### Observability Gap

The API route collects rich timing events for web setup, provider attempts, tool
execution, and response output. The active runtime log output has been observed to
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

The runtime also applies deterministic guardrails where agent discretion alone is not
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
6. Should the assistant be consistently called Samwise in its own prompt, or should
   the UI sender remain Mise?
7. Which performance events need to be exposed in development logs and production
   telemetry to measure answer quality and latency reliably?

## Implementation Map

| Module | Role in this design |
| --- | --- |
| `packages/api/src/cooking/agent.ts` | System instructions, prompt construction, tool selection/execution, provider loop, source correction, suggestions, timing events |
| `packages/api/src/cooking/web.ts` | Tavily-backed search and extraction tools, URL safety checks, recipe fact extraction |
| `packages/api/src/cooking/service.ts` | Conversation document persistence and cooking-session persistence |
| `packages/api/src/cooking/canvas.ts` | Validation/recognition of usable canvas markdown |
| `packages/api/src/preferences/batch.ts` | Background curation of durable preferences learned from chat |
| `packages/api/src/recipes/service.ts` | Saved library documents, categorization, and illustration scheduling |
| `packages/api/src/recipes/illustrate.ts` | Library illustration generation prompt/provider |
| `api/server/routes/cooking.js` | Authenticated SSE chat API, context loading, message persistence, response metadata, performance trace collection |
| `packages/data-provider/src/createPayload.ts` | Client-to-server routing into the cooking chat bridge |
| `client/src/routes/ChatRoute.tsx` | Cooking route setup, default model selection, document queries, workspace composition |
| `client/src/components/Cooking/Workspace.tsx` | Chat/canvas layout and visible document selection |
| `client/src/components/Cooking/WebSources.tsx` | Displays supporting source cards saved on assistant messages |
| `client/src/components/Cooking/PromptSuggestions.tsx` | Displays suggested next-turn chips |
| `client/src/components/Cooking/RecipeCanvas.tsx` | Displays active document and provides user-initiated save/update actions |
| `client/src/utils/miseDefaults.ts` | Client default endpoint, model, and assistant display constants |
| `librechat.yaml` | OpenRouter endpoint and Tavily web-search configuration |
