# PRD: Agentic Cooking Assistant Redesign

Status: Proposed
Date: May 27, 2026
Product: Mise cooking assistant, presented to users as Samwise
Primary concern: conversational quality, situational judgment, and reliable tool use

## Problem Statement

The cooking assistant has access to useful capabilities: durable user preferences,
specialty ingredient availability, conversation history, recipe canvases, document
mutation tools, and optional web research. It is not consistently turning those
capabilities into intelligent assistance.

In a representative failure, a user in India asked for something quick to eat within
15 minutes. Rather than recognizing an immediate, low-effort meal-selection need and
using location and time-of-day as silent relevance signals, the assistant foregrounded
stored specialty ingredients and suggested a niche bacon-and-condiment noodle dish.
When corrected to provide a normal recipe and then an Indian option, it still delayed
the usable answer by offering document creation instead of producing an immediately
cookable recipe.

From the user's perspective, this is not a minor style problem. The assistant feels
out of touch, unnecessarily exposes remembered personal context, fails to retain
simple constraints across turns, and makes the user work to obtain an answer that
should have been obvious. Food decisions are often time-sensitive and emotionally
lightweight; a single irrelevant suggestion or needless confirmation step can cause
the user to abandon the experience.

The current behavior is caused by a system design that largely injects raw context,
instructions, and tools into a response model and relies on that model to determine
which facts matter. It has a bounded tool-execution loop, but it does not have a
purpose-built turn-planning layer that:

- identifies the user's immediate goal and accumulated constraints;
- chooses which context is relevant for this particular decision;
- uses situational signals such as local meal occasion appropriately;
- distinguishes available specialty ingredients from ordinary preferences or staples;
- decides whether to answer, clarify, research, or mutate a document;
- validates whether the resulting answer actually served the user's need.

## Solution

Redesign the cooking assistant around a bounded, task-adaptive agent loop. The
assistant should remain creative and model-driven, but it should operate through a
small set of explicit, testable decisions before generating the user-facing reply.

For each message, the redesigned assistant will:

1. Build reliable runtime context, including local time, coarse locale, conversation
   state, selected document state, saved constraints, and available capabilities.
2. Form a structured understanding of the turn: user goal, hard constraints, soft
   preferences, inherited conversational constraints, likely meal occasion,
   uncertainty, and the output the user now needs.
3. Select only the user context relevant to that understood task. Hard safety and
   dietary constraints always apply; specialty ingredients, household details, and
   personal history apply only when they improve the current answer.
4. Choose an action: answer directly, ask one necessary clarification, create or
   revise a cooking document, read a source, or conduct evidence-based research.
5. Expose only tools and instructions appropriate to the chosen action, then execute
   a bounded reasoning-and-action loop when a tool is needed.
6. Validate the completed response against the user's constraints, usefulness,
   privacy expectations, and tool policy before displaying it.
7. Curate durable memory after the interaction using confirmed, reusable facts rather
   than transient cravings or one-off ingredients.

This design should make the assistant feel intelligent through judgment rather than
through conspicuous personalization. Location and time-of-day should ordinarily
shape rankings silently. Available specialty condiments should expand feasible
options when appropriate, not override a request for everyday food. Once the user
has given sufficient constraints for a recipe, the assistant should provide an
actionable answer without another permission loop.

### Experience Principles

- Deliver immediate value before offering product workflow.
- Use personal context selectively and silently unless the user asks for
  personalization explicitly.
- Treat the latest explicit user correction as more important than inferred taste.
- Respect stable safety, dietary, and religious constraints without repeatedly
  announcing them.
- Infer cautiously: use time and location as ranked priors, not rigid assumptions.
- Ask questions only when the missing answer would materially change what is safe or
  useful.
- Use tools to accomplish the user's intent, not to demonstrate capability.
- Keep everyday requests fast; reserve deeper loops for uncertain, durable,
  evidence-dependent, or multi-step work.
- Measure reliability across multi-turn conversations, not only individual outputs.

### Illustrative Target Interaction

User:

> Suggest me something to eat which can be cooked fast under 15 mins.

Desired assistant behavior:

> If you want something ready fast, I would start with egg bhurji and toast or roti:
> about 10 minutes, filling, and made from ordinary ingredients. Other quick options
> are poha, masala toast, or curd rice with a quick tadka. Are eggs okay, or should I
> keep it vegetarian?

If the user then says:

> Something from Indian cuisine. Give me a normal recipe.

Desired assistant behavior:

> Make egg bhurji, ready in about 10 minutes. For 1-2 servings, use 3 eggs, 1 small
> onion, 1 tomato, oil, salt, a pinch of turmeric, and green chilli or coriander only
> if you have them. Cook the onion for 2 minutes, soften the tomato with salt and
> turmeric for 2-3 minutes, then stir in beaten eggs until just set. Eat with roti or
> toast. If you need an egg-free option, I can switch this to poha or besan chilla.

The assistant may create a canvas when the user asks to save, keep, build, or modify
a durable recipe document. It should not make access to basic help contingent on
opening a canvas.

## Goals

1. Improve appropriateness and usefulness of everyday cooking recommendations.
2. Preserve user constraints across conversational refinements.
3. Use saved context in a way that feels natural, private, and task-relevant.
4. Select tools based on intent and risk rather than exposing every available
   capability on every turn.
5. Support bounded agentic reasoning where it adds value without imposing excessive
   latency on routine answers.
6. Make quality regressions observable and testable using realistic multi-turn
   scenarios.
7. Keep the architecture extensible for future inventory, meal planning, shopping,
   and active cooking support without hardcoding recipe decisions.

## Success Metrics

| Metric | Target behavior |
| --- | --- |
| Time to actionable answer for routine recommendation | One assistant response after sufficient constraints are known |
| Constraint retention | Explicit constraints remain respected across follow-up turns |
| Unnecessary clarification rate | Questions are not asked when a useful low-risk answer can be supplied |
| Context appropriateness | Specialty or personal context is used only where relevant |
| Memory discretion | No casual exposure of stored location, household, or pantry details |
| Tool appropriateness | Tools are chosen only when required by the intended outcome |
| Multi-turn task success | Representative simulated conversations reliably reach a useful result |
| Latency for ordinary chat | No mandatory research or heavy multi-step planning where a direct answer is adequate |

## User Stories

1. As a hungry user, I want a practical meal suggestion quickly, so that I can begin cooking instead of continuing to negotiate with the assistant.
2. As a user asking for food under a time limit, I want every recommendation to respect that limit, so that the suggestion is actually usable.
3. As a user in a particular locale, I want ordinary locally relevant dishes ranked sensibly, so that recommendations feel natural to my life.
4. As a user, I want the assistant to consider time-of-day when it is useful, so that breakfast, snack, lunch, and dinner suggestions are contextually appropriate.
5. As a user, I want time-of-day inferences to remain flexible, so that I can still ask for unusual food without being blocked by assumptions.
6. As an Indian user asking for a normal quick meal, I want everyday Indian options considered before niche international dishes, so that I get a low-friction answer.
7. As a user with established cuisine preferences, I want those preferences to improve rankings when relevant, so that the assistant learns my tastes without becoming repetitive.
8. As a user who stores specialty ingredients, I want them treated as optional opportunities, so that they do not dominate ordinary meal suggestions.
9. As a user who says I want basic or normal food, I want that correction respected immediately, so that I do not need to repeat myself.
10. As a user with allergies, I want unsafe suggestions automatically removed, so that every recommendation is safe by default.
11. As a user with dietary or religious constraints, I want them enforced reliably, so that personalized recommendations do not violate my boundaries.
12. As a user with no relevant restrictions stated, I want a reasonable answer plus a lightweight alternative when necessary, so that the assistant remains helpful rather than interrogative.
13. As a user asking for a recipe, I want ingredients and steps immediately, so that the assistant does not delay action behind UI workflow.
14. As a user exploring possible dishes, I want concise options and a useful refinement question, so that I can decide without receiving an unnecessarily long document.
15. As a user who has chosen a dish, I want the assistant to move from exploration to execution, so that the conversation makes progress.
16. As a user who wants a durable recipe, I want a structured cooking canvas created when appropriate, so that I can follow and revisit the instructions.
17. As a user with an open recipe canvas, I want discussion to remain discussion until I request a modification, so that recipes do not change unexpectedly.
18. As a user asking for a substitution or scaling change, I want the existing recipe revised coherently, so that the document stays usable.
19. As a user supplying a recipe URL, I want the assistant to read the actual source before adapting it, so that it does not invent an approximation.
20. As a user asking about food safety, authenticity, current availability, or products, I want external research when required, so that claims are evidence-based.
21. As a user asking for ordinary recipe inspiration, I want an answer from cooking knowledge without unnecessary web research, so that the experience stays fast and focused.
22. As a user receiving researched advice, I want sources to support the answer rather than replace it, so that I still receive useful guidance.
23. As a user, I want the assistant to ask a clarification only when the choice truly matters, so that conversation feels efficient.
24. As a user with unknown egg or meat preferences, I want the assistant to offer safe branches where possible, so that it can proceed without over-questioning.
25. As a user who has corrected a poor suggestion, I want the assistant to incorporate that correction for the rest of the task, so that trust can recover quickly.
26. As a user, I want remembered details used without the assistant announcing them awkwardly, so that personalization feels respectful.
27. As a user, I want temporary ingredients or cravings kept separate from long-term preferences, so that later recommendations are not distorted.
28. As a user who routinely keeps an uncommon condiment, I want it available for appropriate dishes, so that the assistant can be creative when the moment calls for it.
29. As a user cooking for a household, I want serving quantities adjusted only when that information is relevant, so that personal context does not appear gratuitously.
30. As a user with limited equipment, I want suggestions filtered for feasibility, so that the assistant does not recommend methods I cannot perform.
31. As a user seeking a quick meal, I want the response optimized for starting now, so that detailed food history or elaborate presentation does not get in my way.
32. As a user learning to cook, I want sensory cues and recovery guidance when I request a full recipe, so that I can succeed rather than merely follow timings.
33. As a returning user, I want the assistant to become more helpful over time, so that memory creates value without making each answer feel predetermined.
34. As a product owner, I want high-quality multi-turn evaluations, so that a polished single response cannot hide repeated conversational failures.
35. As a product owner, I want failed scenarios turned into regressions, so that real user disappointments improve the system permanently.
36. As an engineer, I want agent decisions represented structurally, so that relevance, tool choice, and failures can be tested and debugged.
37. As an engineer, I want ordinary turns to remain low-latency, so that better reasoning does not unnecessarily slow the entire product.
38. As an engineer, I want complex turns to use stronger reasoning selectively, so that cost is spent where quality depends on it.
39. As an engineer, I want tool interfaces to match user intents, so that the model is less likely to call or advertise irrelevant tools.
40. As an engineer, I want privacy-sensitive context usage observable without logging sensitive raw content, so that inappropriate personalization can be detected safely.

## Implementation Decisions

### 1. Use A Bounded Agent Loop, Not Unrestricted Autonomy

The redesigned assistant will operate through a bounded loop with explicit exit
conditions. Direct conversational answers should normally complete in one generation.
The loop is used when a task needs clarification, document work, source reading,
research, or response repair.

The loop terminates when:

- a validated direct answer is ready;
- one necessary user clarification is requested;
- a requested document mutation completes successfully;
- a researched answer with supporting evidence is ready;
- an error requires a transparent user-facing response;
- a strict iteration limit is reached.

This follows established agent guidance: flexibility where the path cannot be fully
predicted, with stopping conditions and environmental feedback to retain control.

### 2. Introduce A Hybrid Turn Understanding Planner

Create a backend-only planner that transforms the current user message, relevant
recent history, trusted runtime context, active canvas state, linked source state,
selected preference section metadata, and available capability facts into a compact
structured turn plan. The planner is agentic: the LLM proposes semantic judgment as
JSON, while runtime policy validates structure, redacts private data, and enforces
hard boundaries.

Its interface should yield:

- the immediate user goal, such as recommend, provide recipe, modify existing
  document, research, explain, or troubleshoot;
- inherited and newly added constraints;
- exclusions introduced by corrections, such as avoiding specialty-led suggestions;
- uncertainty requiring clarification;
- the desired response mode;
- whether a durable document is already requested;
- whether external evidence is materially necessary.

The LLM is responsible for semantic intent, soft preference relevance,
ordinary-versus-specialty judgment, clarification need, source/research need, and
action proposal. Runtime policy is responsible for trusted context facts, hard
constraints, URL/source facts, active canvas availability, privacy redaction, tool
capability limits, schema validation, and a non-semantic safe fallback when planner
output is malformed or unavailable.

This module must carry refinements forward across turns. A user correction such as
“normal recipe” must become an active constraint, not merely an isolated sentence in
chat history.

### 3. Introduce A Relevant Context Module

Create a deep module that selects and describes only context relevant to the
validated turn plan. The planner may propose context categories, but runtime privacy
policy decides what can actually be exposed and must prevent the response model from
treating every stored detail as an instruction to personalize visibly.

Context priority is:

1. Safety, dietary, allergy, and religious constraints.
2. Explicit user requirements and corrections in the active task.
3. Situational signals such as meal occasion, urgency, and locale.
4. Stable taste and cuisine preferences relevant to the task.
5. Feasibility facts such as equipment and current serving requirements.
6. Everyday ingredients and currently available food where the user asked for pantry
   help.
7. Specialty ingredients only where the requested dish, cuisine, or user request
   makes them useful.

The module should output a compact context brief rather than entire unfiltered
preference markdown. Hard safety, diet, allergy, and religious constraints are
always exposed when present, even if the planner omits them. Exact timestamps,
timezone identifiers, granular saved locations, complete preference bodies, and raw
private memories must not be exposed to the response prompt or behavioral telemetry.
The module must record selected and withheld context categories for evaluation and
debugging without logging raw sensitive content.

### 4. Model Availability And Preference Separately

The preference and ingredient model must distinguish:

- hard constraints;
- favourite or disliked flavours and cuisines;
- ordinary staples and reliably available basic ingredients;
- optional condiments and flavour enhancers;
- specialty or occasional ingredients;
- current-session available ingredients;
- equipment;
- household and serving defaults;
- situational goals such as quick weekday meals or longer projects.

Availability must not be interpreted as preference. Specialty ingredient catalog
content and imagery may remain useful for presentation and availability, but the
recommendation planner must receive semantic usage information rather than only a
catalog classification.

### 5. Add A Preference Exposure Policy

The agent must not receive the full user preference artifact as a flat prompt blob.
The Relevant Context Module should convert preferences into a task-specific
Preference Brief that states what is mandatory, what is useful, and what should be
suppressed for the current turn.

Preference handling rules:

| Preference category | Exposure rule | Effect on answer |
| --- | --- | --- |
| Safety, allergy, medical, diet, and religious rules | Always exposed when known | Hard filter; unsafe outputs are invalid |
| Current user request and corrections | Always exposed for the active task | Highest-priority task constraints |
| Situational context such as time, locale, urgency, and meal occasion | Exposed as soft priors with confidence | Ranks options silently; should rarely be mentioned |
| Stable taste, cuisine, and goal preferences | Exposed only when relevant to the task | Ranks and styles suggestions |
| Kitchen equipment and technique level | Exposed when it affects feasibility | Filters impossible methods or asks one focused question |
| Household and serving defaults | Exposed when scaling or planning matters | Adjusts quantities, time, and practicality |
| Ordinary staples and reliable basics | Exposed for everyday suggestions or pantry tasks | Supports accessible default choices |
| Specialty ingredients and occasional items | Suppressed unless requested, naturally relevant, or useful for novelty | Optional enhancer; never the default anchor for ordinary requests |
| Personal context and past anecdotes | Suppressed unless clearly useful | Avoids conspicuous or creepy personalization |

Precedence is:

1. Hard constraints.
2. Explicit current request.
3. Active corrections from the current conversation.
4. Situational priors.
5. Stable preferences.
6. Availability and specialty opportunities.

For example, if a user in India with saved fish sauce, bacon, chili oil, and
mozzarella asks for food under 15 minutes, the brief should prefer ordinary,
accessible quick options and suppress those specialty ingredients. Those ingredients
should become relevant only if the user asks for fusion food, novelty, or a way to
use them.

### 6. Provide Deterministic Situational Context

The cooking turn should receive local date/time and timezone from trusted runtime
context where available. It may derive a likely meal occasion with a confidence
level. Coarse locale or country can contribute to ingredient accessibility and
everyday cuisine ranking.

These signals are soft priors:

- they influence ordering of suggestions;
- they do not prohibit alternatives;
- they should not ordinarily be exposed in prose;
- explicit user taste or requests override them.

### 7. Add A Hybrid Action Planning Module

Based on turn understanding and selected context, use the LLM planner to propose the
next user-serving action, then apply runtime validation before configuring the
response turn:

| Action | When appropriate |
| --- | --- |
| Answer directly | Routine recommendation, explanation, or complete recipe that does not need a tool |
| Ask clarification | A missing answer materially affects safety, feasibility, or the main direction |
| Create document | The user wants a durable distinct recipe, guide, or preparation plan |
| Read document | Exact selected document contents are required before answering or revising |
| Revise document | The user wants the selected durable document changed |
| Read linked source | The user wants supplied recipe material used faithfully |
| Research externally | The answer depends on current, source-dependent, safety, authenticity, product, or availability evidence |

The plan is not a user-facing chain of thought. It is a concise machine-readable
decision that can be logged, tested, and used to configure the generation turn.
Planner output must include privacy-safe rationale labels rather than raw user
memory or freeform private reasoning.

### 8. Gate Tools And Instructions From The Plan

Only provide tools and instructions appropriate to the intended action.

- Routine recommendation turns must not be biased toward canvas creation.
- Explicit durable recipe requests may expose document creation.
- Existing document edits may expose read and revision operations only when an
  active selected draft exists and the current user intent matches document work.
- Source-driven work must require source reading before exact adaptation.
- External research remains unavailable unless the planner proposes source/research
  work, a pasted URL creates a source-reading requirement, or the model requests
  research through a validated tool call.
- Ordinary recipe inspiration must not unlock web tools merely because browsing is
  available.

Likewise, prompt profiles should be selected from the validated plan. Routine direct
turns receive only short persona, context brief, and tool state. Document work
receives the document contract and canvas markdown requirements. Source or research
turns receive source and web rules. Active canvas discussion receives selected
document context without implying mutation.

### 9. Preserve Model Discretion Inside The Right Frame

The planner must not hardcode that every Indian user wants a particular dish, or that
every dinner is traditional food. It should provide relevant facts and ranked priors,
then allow the response model to produce appropriate, varied suggestions.

This is the intended balance:

- runtime systems define trusted facts, constraints, permissions, and validation;
- the planner model supplies semantic intent, soft relevance judgment, clarification
  need, and action proposals;
- the response model supplies culinary judgment, creative options, phrasing, and
  sensitive conversational adaptation inside the validated prompt profile;
- tools supply environmental facts and durable actions only when the validated plan
  and runtime tool gate permit them.

### 10. Add A Response Quality Gate

Before a response is surfaced, validate high-impact dimensions:

- explicit constraints were honored;
- the response is actionable when an actionable answer was requested;
- the response does not merely advertise document creation or sources;
- stored personal context is not unnecessarily exposed;
- clarification is not substituted for a reasonable answer;
- tool results and source claims are represented honestly.

For routine low-risk answers, validation should be lightweight. For externally
researched, document-mutating, safety-sensitive, or highly personalized turns, a
targeted model-based evaluation may repair one failed answer before returning it.

### 11. Refine Memory Curation

Durable memory updates should remain separate from immediate response generation.
The curator should record only stable reusable information supported by the user's
words. It should not convert temporary availability, one-off recipes, or assistant
suggestions into preferences.

User corrections should influence the active conversation immediately. They should
become durable memories only when the user expresses an enduring preference or
requests that it be remembered.

### 12. Use Model Routing Deliberately

Routine replies should use a fast, cost-effective model after the turn is properly
framed. Higher-reasoning models should be considered for:

- ambiguous multi-constraint planning;
- safety-sensitive decisions;
- source reconciliation;
- substantial recipe document generation or revision;
- quality-repair attempts after validator failure.

Model selection must be governed by evaluation results rather than by cost alone.

### 13. Maintain Privacy-Aware Observability

Capture structured events needed to diagnose behavior:

- interpreted goal and intended action;
- categories of context selected or withheld;
- inferred meal occasion and confidence;
- tools exposed and tools used;
- response validation outcomes and repair attempts;
- latency and model routing.

Do not log complete personal preference text or raw private memories solely for
behavioral telemetry.

## Proposed Modules

| Module | Responsibility | Interface leverage |
| --- | --- | --- |
| Turn Context Builder | Gather trusted runtime, conversation, document, and capability state | Gives all downstream reasoning one reliable view of the current turn |
| Turn Understanding Planner | LLM proposes intent, action, clarification need, and context categories as JSON; non-semantic runtime fallback preserves safe behavior when the planner is unavailable | Converts conversational ambiguity into a validated decision object |
| Relevant Context Selector | Expose only profile/context facts allowed by the plan and hard policy | Prevents raw memory from dominating responses |
| Action Planner | Validate answer, clarification, document operation, source, or research proposals | Centralizes tool and output decisions |
| Tool Gate | Construct the smallest permitted tool set and prompt profile from the validated plan | Keeps irrelevant tools and instructions out of routine turns |
| Execution Loop | Run bounded model/tool/observation iterations | Supports flexible multi-step tasks while preserving control |
| Response Quality Gate | Validate usability, constraint compliance, and memory discretion | Converts known failures into enforceable quality behavior |
| Memory Curator | Store only confirmed durable preferences after interaction | Improves future support without polluting current reasoning |
| Agent Evaluation Harness | Execute realistic multi-turn conversations and score outcomes | Makes user-visible quality regressions measurable |

## Interaction Requirements

### Everyday Recommendation

- The assistant must prioritize immediate usability and ordinary accessible options.
- It may use locale and likely meal occasion to rank dishes silently.
- It must not surface specialty inventory unless the user asked to use ingredients,
  requested novelty, or the suggested dish naturally benefits from the item.
- It should ask no more than one focused refinement question after providing useful
  options or a practical default.

### Recipe Request

- Once the user asks for a recipe and constraints are sufficient, the assistant must
  produce actionable instructions or create the explicitly requested durable
  document in that response.
- It must not repeatedly ask whether the user wants a recipe document after the user
  has asked for a recipe.
- When a quick recipe is requested, the response must preserve the time constraint
  and avoid unnecessary long-form canvas behavior unless the user wants it.

### Existing Canvas Work

- Conversational brainstorming must not silently modify the selected document.
- Direct instructions to change the existing recipe should use the revision action.
- Requests for separate variants should create distinct documents only when the user
  wants to retain both versions or clearly requests a separate deliverable.

### Research And Sources

- Routine dish generation does not require browsing.
- Source reading is mandatory when the user provides a recipe URL intended to govern
  the result.
- External research is appropriate for current availability, products, restaurants,
  authenticity claims, verification, and food safety.
- A user-facing researched answer must contain useful guidance; source cards and
  citations are supplemental evidence.

## Testing Decisions

Tests must evaluate observable behavior, not private chain-of-thought or incidental
prompt wording. A good test provides the user input, profile/runtime facts, permitted
tools, and tool observations, then asserts the resulting action, answer properties,
document state, or exposed source state.

### Module Tests

- Test turn understanding for constraint inheritance, correction handling, urgency,
  and response-mode selection.
- Test relevant context selection for hard constraints, silent locale/time use,
  suppression of irrelevant specialty context, and privacy-safe category reporting.
- Test action planning for direct answer versus clarification, document mutation,
  source reading, and research.
- Test tool gating so ordinary turns do not receive irrelevant document or research
  operations, while requested actions receive the tools they require.
- Test response validation against ignored constraints, source-only answers,
  needless permission loops, and exposed private context.
- Test memory curation so current ingredients and one-off choices do not become
  durable preferences.

### Conversation Evaluations

Create an evaluation suite containing complete multi-turn interactions.
It should include at least:

1. An Indian user with specialty condiments requests a meal under 15 minutes; the
   assistant supplies appropriate everyday options without mentioning stored pantry
   or location details.
2. The user rejects specialty-led suggestions and asks for normal food; the next
   response respects that correction.
3. The user asks for an Indian recipe; the assistant provides usable ingredients and
   steps immediately.
4. The user has a dietary or religious restriction conflicting with an otherwise
   plausible suggestion; the restriction always wins.
5. The user asks for food at different local meal occasions; suggestions adapt
   plausibly without claiming certainty.
6. The user explicitly requests a creative use of a specialty ingredient; the
   assistant can then use it confidently.
7. The user supplies a linked source; the assistant reads and faithfully uses it.
8. The user requests research; sources support a substantive reply rather than
   replacing it.
9. The user has a selected recipe document and asks only a question; no unintended
   document mutation occurs.
10. The user requests a document edit; the revision action occurs and leaves a
    coherent usable canvas.

### Reliability Testing

- Run important conversation scenarios multiple times and record consistent success,
  not only single-run quality.
- Score action selection, tool appropriateness, constraint compliance, privacy
  discretion, and time to actionable help.
- Treat each real reported quality failure as a regression scenario before changing
  prompts or orchestration.

### Existing Prior Art

The current application already has tests for cooking agent tool exposure, document
mutation, linked source processing, research source repair, preferences curation, and
specialty ingredient catalog behavior. The redesign should extend those testing
patterns with structured planning and multi-turn behavioral outcomes rather than
replacing them with prompt snapshot tests.

## Delivery Plan

### Phase 1: Measurement And Turn State

- Convert reported conversation failures into evaluation fixtures and quality
  scoring.
- Provide trusted runtime context needed for meal-occasion reasoning.
- Define structured turn understanding and accumulated constraints.

Exit condition: failures can be reproduced and the intended task state is represented
correctly before response generation.

### Phase 2: Context Selection And Semantic Preferences

- Add relevance-based context selection.
- Separate specialty availability from ordinary cuisine/taste preference.
- Ensure explicit corrections suppress irrelevant personalization in the active task.

Exit condition: generic quick-meal evaluations no longer overuse specialty context or
expose irrelevant memory.

### Phase 3: Intent-Based Actions And Tools

- Add action planning.
- Gate tools and prompt sections according to the plan.
- Preserve bounded tool execution for document work and evidence gathering.

Exit condition: ordinary answers no longer defer to canvas workflow and durable tasks
still use tools correctly.

### Phase 4: Validation And Routing

- Add response quality validation and limited repair.
- Route more complex turns to stronger reasoning only when evaluation justifies it.
- Add privacy-safe decision telemetry and latency tracking.

Exit condition: quality improves without unacceptable routine latency or uncontrolled
cost.

Implemented slice:

- Buffer response text until LLM quality validation and any single repair
  pass have completed, so rejected drafts are never emitted to the user stream.
- Provide multi-turn evaluation scenarios with action, tool, privacy,
  document, source, repair, and latency-baseline scoring.
- Route preflight-classified safety, source/research, and document mutation work to
  an optional complex model; route validator repairs to an optional repair model;
  record privacy-safe routing reasons and selected model roles in timing events.

## Out of Scope

- Hardcoding particular dishes for users in a particular country or at a particular
  time of day.
- Replacing the model with deterministic recipe templates.
- Autonomous grocery purchasing, appliance control, or irreversible actions.
- Full nutritional or medical meal planning.
- Browsing the web for routine recipe inspiration by default.
- Persisting transient inferred moods, cravings, or meal occasions as durable memory.
- Reworking unrelated recipe library, illustration, or general chat UI behavior.
- Selecting a final model provider before evaluation establishes quality and latency
  requirements.

## Further Notes

### Architectural Rationale

The redesign intentionally does not add an unbounded autonomous agent. Research and
industry guidance consistently support simple, composable agent patterns, bounded
execution loops, well-designed tools, environmental feedback, layered guardrails,
and evaluation-driven increases in autonomy.

The current cooking assistant already possesses a basic tool loop. The highest-value
change is to put disciplined turn understanding, context relevance, and action
selection before that loop, then verify its user-facing result afterward.

### Reference Material

- Anthropic, *Building Effective Agents*:
  https://www.anthropic.com/engineering/building-effective-agents
- OpenAI, *A Practical Guide to Building Agents*:
  https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
- Yao et al., *ReAct: Synergizing Reasoning and Acting in Language Models*,
  ICLR 2023:
  https://openreview.net/forum?id=WE_vluYUL-X
- Yao et al., *tau-bench: A Benchmark for Tool-Agent-User Interaction in
  Real-World Domains*, ICLR 2025:
  https://proceedings.iclr.cc/paper_files/paper/2025/hash/1b126cc38b8638e07bef37e7b2bb72bf-Abstract-Conference.html
- Yang et al., *SWE-agent: Agent-Computer Interfaces Enable Automated Software
  Engineering*, NeurIPS 2024:
  https://papers.nips.cc/paper_files/paper/2024/hash/5a7c947568c1b1328ccc5230172e1e7c-Abstract-Conference.html
- Google Cloud, *Choose your agentic AI architecture components*:
  https://docs.cloud.google.com/architecture/choose-agentic-ai-architecture-components
