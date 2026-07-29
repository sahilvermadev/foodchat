# Rekky Design Guide

Status: living product design reference  
Last updated: 2026-07-28

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

Rekky uses quiet, tinted mineral neutrals with one ember-coral signal. It should
not read as a themed “food palette”: warmth is carried by trace chroma in the
neutrals, while the accent is reserved for active state, focus, links, and primary
emphasis. Its footprint should remain below roughly 5% of a viewport.

Light and dark modes preserve the same relationships. Dark elevation becomes
lighter as surfaces rise; the accent becomes lighter and slightly less chromatic.

| Role                 | Light                   | Dark                    | Use                                   |
| -------------------- | ----------------------- | ----------------------- | ------------------------------------- |
| `--color-paper`      | `oklch(97.5% 0.006 55)` | `oklch(14.5% 0.008 35)` | App/page background                   |
| `--color-paper-2`    | `oklch(95.2% 0.008 55)` | `oklch(18% 0.009 35)`   | Main raised surfaces                  |
| `--color-paper-3`    | `oklch(92.5% 0.009 55)` | `oklch(22% 0.01 35)`    | Secondary controls and panels         |
| `--color-ink`        | `oklch(19% 0.01 35)`    | `oklch(94% 0.008 55)`   | Primary readable text                 |
| `--color-ink-2`      | `oklch(31% 0.01 35)`    | `oklch(79% 0.008 55)`   | Supporting text                       |
| `--color-rule`       | `oklch(85.5% 0.008 50)` | `oklch(29% 0.01 35)`    | Quiet dividers                        |
| `--color-rule-2`     | `oklch(77% 0.01 48)`    | `oklch(36% 0.01 35)`    | Stronger control boundaries           |
| `--color-accent`     | `oklch(53% 0.17 32)`    | `oklch(70% 0.14 32)`    | Active state, links, primary emphasis |
| `--color-accent-ink` | mineral paper           | smoked ink              | Text on accent fills                  |
| `--color-focus`      | `oklch(55% 0.2 32)`     | `oklch(72% 0.18 32)`    | Visible keyboard focus                |

Functional status colors are subordinate and must always include text or an icon:

- Success: restrained green, `--color-success`
- Caution: restrained amber, `--color-caution`
- Danger: signal red, `--color-danger`
- Informational: mineral blue, `--color-info`

Legacy `--rekky-*` names remain compatibility aliases only. New work uses semantic
`--color-*` roles or the existing application roles such as `--surface-primary`,
`--text-primary`, and `--border-light`.

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
- `rekky-section-title`: roman editorial section heading with restrained tracking.
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

Use this fixed shape and elevation matrix; feature code must not invent local values:

| Surface                   | Radius                                          | Elevation                                           |
| ------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| Controls and cards        | `--radius-control` / `--radius-card` (`0.5rem`) | `--shadow-surface` only when separation requires it |
| Menus and floating panels | `--radius-card`                                 | `--shadow-floating`                                 |
| Sheets and dialogs        | `--radius-dialog` (`0.75rem`)                   | `--shadow-dialog`                                   |

Stacking uses named layers only: `base`, `raised`, `dropdown`, `sticky`, `modal`,
`toast`, and `tooltip`. Arbitrary numeric z-index values are not permitted in feature code.

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

## Exports

The runtime source of truth remains `client/src/style.css`. The root `tokens.css`
file is a portable copy for design tooling and reuse.

### tokens.css

```css
:root {
  --color-paper: oklch(97.5% 0.006 55);
  --color-paper-2: oklch(95.2% 0.008 55);
  --color-paper-3: oklch(92.5% 0.009 55);
  --color-ink: oklch(19% 0.01 35);
  --color-ink-2: oklch(31% 0.01 35);
  --color-muted: oklch(45% 0.01 45);
  --color-rule: oklch(85.5% 0.008 50);
  --color-rule-2: oklch(77% 0.01 48);
  --color-accent: oklch(53% 0.17 32);
  --color-accent-ink: oklch(97.5% 0.006 55);
  --color-focus: oklch(55% 0.2 32);
}

.dark {
  --color-paper: oklch(14.5% 0.008 35);
  --color-paper-2: oklch(18% 0.009 35);
  --color-paper-3: oklch(22% 0.01 35);
  --color-ink: oklch(94% 0.008 55);
  --color-ink-2: oklch(79% 0.008 55);
  --color-muted: oklch(68% 0.008 50);
  --color-rule: oklch(29% 0.01 35);
  --color-rule-2: oklch(36% 0.01 35);
  --color-accent: oklch(70% 0.14 32);
  --color-accent-ink: oklch(16% 0.01 35);
  --color-focus: oklch(72% 0.18 32);
}
```

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: oklch(97.5% 0.006 55);
  --color-paper-2: oklch(95.2% 0.008 55);
  --color-paper-3: oklch(92.5% 0.009 55);
  --color-ink: oklch(19% 0.01 35);
  --color-ink-2: oklch(31% 0.01 35);
  --color-muted: oklch(45% 0.01 45);
  --color-rule: oklch(85.5% 0.008 50);
  --color-accent: oklch(53% 0.17 32);
  --color-focus: oklch(55% 0.2 32);
  --font-display: 'Space Grotesk', sans-serif;
  --font-body: 'Space Grotesk', sans-serif;
  --font-outlier: 'JetBrains Mono', monospace;
  --spacing-3xs: 0.25rem;
  --spacing-2xs: 0.5rem;
  --spacing-xs: 0.75rem;
  --spacing-sm: 1rem;
  --spacing-md: 1.5rem;
  --spacing-lg: 2rem;
  --spacing-xl: 3rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --radius-card: 0.5rem;
  --radius-input: 0.5rem;
}
```

### DTCG `tokens.json`

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "paper": { "$value": "oklch(97.5% 0.006 55)", "$type": "color" },
    "paper-2": { "$value": "oklch(95.2% 0.008 55)", "$type": "color" },
    "paper-3": { "$value": "oklch(92.5% 0.009 55)", "$type": "color" },
    "ink": { "$value": "oklch(19% 0.01 35)", "$type": "color" },
    "ink-2": { "$value": "oklch(31% 0.01 35)", "$type": "color" },
    "muted": { "$value": "oklch(45% 0.01 45)", "$type": "color" },
    "rule": { "$value": "oklch(85.5% 0.008 50)", "$type": "color" },
    "accent": { "$value": "oklch(53% 0.17 32)", "$type": "color" },
    "accent-ink": { "$value": "oklch(97.5% 0.006 55)", "$type": "color" },
    "focus": { "$value": "oklch(55% 0.2 32)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Space Grotesk, sans-serif", "$type": "fontFamily" },
    "body": { "$value": "Space Grotesk, sans-serif", "$type": "fontFamily" },
    "outlier": { "$value": "JetBrains Mono, monospace", "$type": "fontFamily" }
  },
  "space": {
    "xs": { "$value": "0.75rem", "$type": "dimension" },
    "sm": { "$value": "1rem", "$type": "dimension" },
    "md": { "$value": "1.5rem", "$type": "dimension" },
    "lg": { "$value": "2rem", "$type": "dimension" }
  }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background: 97.5% 0.006 55;
  --foreground: 19% 0.01 35;
  --primary: 53% 0.17 32;
  --primary-foreground: 97.5% 0.006 55;
  --muted: 92.5% 0.009 55;
  --muted-foreground: 45% 0.01 45;
  --border: 85.5% 0.008 50;
  --input: 77% 0.01 48;
  --ring: 55% 0.2 32;
  --radius: 0.5rem;
}

.dark {
  --background: 14.5% 0.008 35;
  --foreground: 94% 0.008 55;
  --primary: 70% 0.14 32;
  --primary-foreground: 16% 0.01 35;
  --muted: 22% 0.01 35;
  --muted-foreground: 68% 0.008 50;
  --border: 29% 0.01 35;
  --input: 36% 0.01 35;
  --ring: 72% 0.18 32;
}
```

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
