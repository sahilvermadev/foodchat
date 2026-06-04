# Rekky Design Guide

Status: living product design reference  
Last updated: 2026-06-04

This document describes the current design language of Rekky and the rules new UI
work should follow. It is intentionally practical: use it when building, reviewing,
or refactoring product surfaces.

## Product Identity

Rekky is a cooking assistant for recipes, planning, kitchen workflows, and personal
culinary preferences. The app should feel useful before it feels decorative. It is
not a generic chatbot skin, a recipe blog, or a dashboard. The interface should make
cooking decisions easier, preserve user context quietly, and keep the user close to
the next practical action.

The cooking assistant persona is Samwise. Rekky is the product; Samwise is the
assistant identity in cooking conversations.

## Design Principles

1. **Immediate Utility**
   The user should get an actionable cooking answer quickly. Do not hide normal
   recipes, decisions, or next steps behind extra panels, confirmations, or product
   ceremony.

2. **Quiet Personalization**
   Preferences, location, equipment, diet, safety, and household context should
   shape the result without being repeatedly announced. Expose personal context only
   when it helps the user understand a recommendation or make a choice.

3. **Typography First**
   Rekky relies on type, spacing, and low-contrast structure more than heavy cards.
   Use headings, metadata labels, thin dividers, and whitespace before introducing
   containers.

4. **Warm Technical Precision**
   The product should feel culinary and human, but not cute. Copy should be concrete:
   ingredients, timing, texture, constraints, substitutions, equipment, and failure
   recovery.

5. **Dense When Operational, Spacious When Reflective**
   Cooking instructions, preference editing, and active workflows can be dense and
   scannable. Exploratory/editorial surfaces can breathe, but must still stay useful.

6. **Restraint Over Ornament**
   Avoid decorative blobs, gradients, artificial gloss, excessive shadows, and
   redundant framing. Motion should clarify state changes, not show off.

## Visual System

The source of truth for tokens is `client/src/style.css`, surfaced through Tailwind
in `client/tailwind.config.cjs`.

### Core Palette

Rekky uses a warm culinary palette in light mode and a dark plum kitchen palette in
dark mode.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--presentation` | `--rekky-cream` | `--rekky-plum-950` | App/page background |
| `--surface-primary` | `--rekky-alabaster` | `--rekky-plum-900` | Main raised surfaces |
| `--surface-primary-alt` | `--rekky-cream` | `--rekky-plum-950` | Alternate panels/canvas |
| `--surface-secondary` | `--rekky-soft-clay` | `--rekky-plum-850` | Secondary controls/panels |
| `--surface-submit` | `--rekky-terracotta` | `--rekky-terracotta` | Primary actions |
| `--text-primary` | `--rekky-charcoal` | white | Primary readable text |
| `--text-secondary` | `--rekky-umber` | `--rekky-cream-muted` | Supporting text |
| `--border-light` | `--rekky-linen` | `--rekky-plum-750` | Default dividers |

Core named colors:

- Terracotta: `#c85a32`, hover `#b24e2a`
- Soft clay: `#f4ebe1`
- Alabaster: `#fafaf7`
- Stone: `#f3f1eb`
- Linen: `#e6e3da`
- Charcoal: `#1a1917`
- Plum base: `#171217`
- Leaf: `#75c46b`
- Lemon: `#f2c94c`
- Aubergine: `#6d3a6d`

Use semantic Tailwind classes such as `bg-presentation`, `bg-surface-primary`,
`text-text-primary`, `text-text-secondary`, `border-border-light`, and
`bg-surface-submit`. Avoid hardcoded hex values unless adding a new token.

### Typography

Loaded families:

- `Space Grotesk`: primary Rekky UI and editorial sans.
- `Inter`: fallback app UI font.
- `JetBrains Mono`: metadata, quantities, timers, compact labels.
- `Lora`: recipe/editorial heading surface.
- `Merriweather`: recipe body surface.
- `Syne`: small Rekky sidebar wordmark.

Important classes:

- `rekky-ui`: primary app UI wrapper.
- `rekky-title`: large editorial title.
- `rekky-section-title`: uppercase section heading.
- `rekky-sans-display-title`: large sans display title.
- `rekky-body`: readable body copy.
- `rekky-meta`: compact technical metadata label.
- `rekky-recipe-surface`: switches recipe typography to recipe heading/body fonts.
- `rekky-preferences-surface`: keeps preferences on Space Grotesk.
- `rekky-quantity`, `rekky-timer`: tabular numeric cooking values.

Rules:

- Use `Space Grotesk` for app UI and preference surfaces.
- Use recipe typography only inside recipe/cooking document surfaces.
- Use `rekky-meta` sparingly for labels like category, timing, difficulty, status,
  and small section headers.
- Avoid negative letter spacing except where the existing class already defines it.
- Do not introduce one-off font families for individual cuisine or feature pages.

### Shape, Borders, and Containers

Default radius is `0.5rem`. Cards and controls are generally `rounded-lg` or smaller.
Avoid large pill containers unless the control is intentionally chip-like.

Use containers for:

- Modals/dialogs.
- Repeated cards or list rows.
- Active recipe canvas sections where scannability matters.
- Input controls and selectable options.

Avoid containers for:

- Pure editorial text.
- Section grouping that can be handled with whitespace and a thin divider.
- Decorative preview boxes.
- Nested card-on-card layouts.

Preferred separators:

- `border-border-light`
- `border-t` or `border-b`
- low-contrast table borders
- open whitespace

## Layout Patterns

### App Shell

The app uses a persistent navigation/sidebar structure and a main work area.
Product surfaces should fill available height and avoid page-level scroll traps.

Use full-height flex layouts for interactive workspaces:

```tsx
<div className="rekky-ui flex h-full min-h-0 w-full flex-col overflow-hidden bg-presentation">
```

For split surfaces, prefer fixed operational sidebars and flexible primary canvas
areas. Keep mobile tabs explicit when two panes cannot coexist comfortably.

### Cooking Workspace

The cooking workspace is the core product surface. It has two modes:

- Chat-only: the assistant fills the workspace.
- Chat + canvas: recipe/guide/prep document on one side, chat on the other.

Guidelines:

- The chat is for conversation, diagnosis, comparison, and quick recipes.
- The canvas is for durable recipe, guide, or prep-plan documents.
- Do not force a canvas for ordinary questions.
- Recipe documents need clear headings, ingredients, method, timing, sensory cues,
  troubleshooting, and substitutions.
- Use source cards as support, never as the answer itself.

### Preferences Workspace

Preferences are a personal profile editor, not a settings dump. The UI should make
the profile feel understandable at a glance and easy to correct.

Current sections:

- Diet
- Safety
- Religious & Cultural Rules
- Kitchen
- Household
- Location
- Taste
- Cooking Level
- Goals
- Personal Context

Guidelines:

- Keep preference editing direct and scannable.
- Use chips, compact selectable rows, and category-level grouping.
- Allow user-defined values where presets are incomplete.
- Treat Safety, Diet, and Religious & Cultural Rules as hard constraints in product
  language and assistant behavior.
- Kitchen tools should be editable by category: appliances, cooktops, and tools.

### Auth and Startup

Auth screens should remain sparse, centered, and calm. The loading experience should
use the same background color logic as the app shell and avoid layout jumps.

Startup should fail visibly when backend config cannot load. A blank loading shell is
not acceptable as a long-term state.

### Side Panels and Settings

Operational panels can be more compact than editorial surfaces. Prefer:

- clear section labels;
- compact rows;
- familiar controls;
- visible focus states;
- no decorative hierarchy beyond borders, spacing, and text weight.

## Components and Controls

### Buttons

Primary action:

- `bg-surface-submit`
- hover `bg-surface-submit-hover`
- white or high-contrast text

Secondary action:

- transparent or `bg-surface-primary`
- `border-border-light`
- hover `bg-surface-hover`

Destructive action:

- `bg-surface-destructive`
- hover `bg-surface-destructive-hover`

Icon-only controls need accessible names and should be used only for familiar actions
such as close, delete, search, add, back, save, zoom, and reset.

### Inputs

Inputs should feel integrated, not loud. Use low-contrast borders and background
tokens. Do not add browser-default focus rectangles inside custom input shells; style
focus at the shell level with `focus-within`.

For add-an-item controls, prefer an inline compact control inside the relevant grid
or row, not a full-width separate line unless the input is the primary task.

### Tables

Tables are acceptable when the content is genuinely comparative or matrix-like.
Recipe/editorial markdown tables use:

- transparent background;
- low-contrast border;
- technical uppercase headers;
- enough cell padding for readability;
- no heavy dashboard styling.

### Modals

Use modals for focused editing or confirmation. Modal width should match task
complexity:

- simple forms: `max-w-2xl`
- dense kitchen/preferences editing: up to `max-w-5xl`

Keep modal body scroll internal when content is long. Do not force the whole page to
scroll behind the modal.

## Copy Guidelines

Voice:

- practical;
- specific;
- candid;
- warm but not cutesy;
- technically useful;
- concise unless the user asks for depth.

Prefer:

- "Cook the onion until the edges go translucent."
- "Use a saucepan if the skillet is too wide and the sauce keeps drying out."
- "This works with rice cooker rice, leftover rice, or fresh basmati."

Avoid:

- generic marketing copy;
- fake enthusiasm;
- "journey", "unlock", "master", "elevate" as filler;
- overexplaining the UI;
- exposing private context unnecessarily;
- telling users what they should feel.

## Imagery

Use real or generated bitmap imagery when the user needs to inspect food, products,
places, ingredients, or finished dishes. Images should be clear, semantically exact,
and useful.

Do not use:

- generic adjacent stock imagery;
- abstract food-themed illustrations where food inspection matters;
- dark/cropped/blurred images that hide the subject;
- decorative images that compete with the cooking task.

Recipe imagery should support choice and recognition. If image quality is uncertain,
ship text-first rather than low-quality filler.

## Motion

Motion should communicate state:

- modal entrance/exit;
- tab changes;
- active cooking step;
- loading/progress;
- small hover/focus transitions.

Use short durations around 160-300ms. Avoid physics-heavy effects unless the feature
is explicitly exploratory and has been tested on desktop and mobile.

## Accessibility

Minimum expectations:

- All interactive controls are keyboard reachable.
- Icon buttons have labels.
- Inputs have labels, even if visually hidden.
- Visible focus exists at the component level.
- Text contrast uses semantic tokens.
- Do not rely on color alone for selection or errors.
- Preserve reduced cognitive load: no hidden essential controls on hover only.

## Responsive Behavior

Desktop can use multi-pane layouts. Mobile must prioritize one active task at a time.

Rules:

- Avoid horizontal overflow.
- Use `min-h-0`, `min-w-0`, and explicit overflow boundaries in flex layouts.
- Use tabs or progressive disclosure when panes are too dense for mobile.
- Text should wrap before shrinking.
- Controls should remain large enough to tap.

## Feature-Specific Notes

### Culinary Horizon

Horizon is currently parked on the `horizon` branch. If resumed, keep it simpler than
the earlier graph direction:

- map-first exploration;
- vector world map, not dot clutter;
- semantic zoom reveals deeper cuisine granularity;
- no right sidebar unless it has a real job;
- cuisine pages use custom human-provided markdown for the main editorial section;
- recipe data should be structured separately and filterable by cuisine-specific
  categories.

Do not reintroduce free-form AI-authored page essays as the source of truth.

### Cuisine Pages

If cuisine pages return to `main`, the preferred content model is:

- human-authored markdown for the left/editorial section;
- structured YAML/JSON for recipe cards, categories, filters, images, timings, and
  difficulty;
- UI renderer that is consistent with Rekky typography and spacing;
- no page-specific font families or uncontrolled styling generated by agents.

## Engineering Rules for Design Work

1. Use existing tokens before adding new colors.
2. Use existing Rekky classes before creating new styling primitives.
3. Localize user-facing strings through `useLocalize()`.
4. Prefer lucide icons or the existing icon set.
5. Add focused tests for behavior changes, especially preference serialization,
   recipe/canvas flows, and route startup states.
6. Run targeted tests and type checks before shipping UI changes.
7. Keep build artifacts, generated `dist`, and local deployment metadata out of
   commits unless the repo explicitly tracks them.

## Review Checklist

Before merging a UI change, ask:

- Does the screen make the user's next action obvious?
- Is any personal context exposed unnecessarily?
- Are the colors and fonts from the existing token system?
- Are containers used only where they improve comprehension?
- Does the layout work at mobile and desktop widths?
- Are controls keyboard accessible and labeled?
- Are loading, empty, and error states handled?
- Is the copy concrete and useful?
- Did tests cover the changed behavior?

