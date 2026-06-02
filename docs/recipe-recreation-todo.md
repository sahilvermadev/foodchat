# Recipe Recreation Feature TODO

## Goal

Let a user describe a dish they tried, saw, or remember, then guide them toward a faithful recreation through AI research, culinary reasoning, and iterative feedback.

The feature should feel like working with a strong recipe developer: curious, specific, practical, and willing to revise based on the user’s memory and kitchen constraints.

## Core User Story

As a cook, I want to tell the app about a dish I loved from a restaurant, video, cookbook, family meal, or photo so the app can ask smart follow-up questions, research likely versions of the dish, infer technique and ingredients, and produce a recipe I can cook and refine.

## Product Behavior

- Accept an initial dish description from the user.
- Ask targeted follow-up questions when important details are missing.
- Research likely versions of the dish when the user provides a restaurant, cuisine, location, chef, menu name, video, article, or recipe clue.
- Use culinary science to infer technique, texture, seasoning, ingredient ratios, substitutions, and cooking method.
- Produce a first-draft recreation recipe with clear assumptions.
- Ask the user for feedback after review or cooking.
- Revise the recipe based on feedback such as taste, texture, aroma, appearance, heat level, sweetness, richness, doneness, and difficulty.
- Preserve the recreation history so the user can compare versions.

## Inputs To Support

- Restaurant name, city, menu item, or dish name.
- Photo or screenshot, if image input is available.
- Link to a recipe, article, short video, or menu page.
- User memory: taste, texture, plating, color, aroma, portion size, sauces, sides, garnish.
- Dietary constraints and available equipment.
- User skill level and desired time budget.

## AI Workflow

1. Capture the dish brief.
2. Extract known facts: dish name, cuisine, place, ingredients, visual cues, technique clues, and constraints.
3. Identify missing high-value details.
4. Ask only the most useful follow-up questions.
5. Research external clues when available.
6. Build a recreation hypothesis.
7. Generate a cookable recipe with assumptions and confidence notes.
8. Collect feedback.
9. Revise recipe versions until the user is satisfied.

## Recipe Output

Each generated recipe should include:

- Recreated dish name.
- Brief explanation of what the AI is trying to match.
- Ingredients with amounts.
- Equipment.
- Step-by-step method.
- Timing.
- Sensory checkpoints.
- Substitutions.
- Make-ahead notes when relevant.
- Assumptions made.
- Confidence level.
- Questions for the next revision.

## Versioning

- Store each recreation attempt as a version.
- Keep the user’s feedback attached to the version it refers to.
- Let the user mark the best version.
- Let the user save the final recipe to their cooking library or memories.

## Lean First Version

- Text-only dish brief.
- AI follow-up questions.
- One researched or inferred recipe draft.
- Manual user feedback.
- Regenerate revised version.
- Save final recipe.

## Later Enhancements

- Photo-based recreation.
- Link ingestion for menus, food blogs, and videos.
- Side-by-side recipe version comparison.
- Shopping list generation.
- Cook mode with checkpoints.
- Taste calibration profile based on user preferences.
- Restaurant/source attribution notes.

## Culinary Intuition And De-Recipe-ing

The long-term goal is not to make users dependent on generated recipes. Rekky should make users better, more intuitive cooks by teaching transferable ratios, techniques, and sensory judgment.

### No-Recipe Mode

No-Recipe Mode teaches a cooking framework instead of a strict recipe. It should help users understand what they are doing, why each move matters, and how to adjust based on what they see, smell, hear, and taste.

Example framework for a pan sauce:

1. Sear meat.
2. Build fond.
3. Add aromatics.
4. Deglaze.
5. Reduce.
6. Mount with butter.

The mode should favor patterns like ratios, sequence, heat control, texture cues, and balance checks over exact measurements.

### No-Recipe Mode Behavior

- Explain the technique framework before giving any quantities.
- Use sensory checkpoints instead of rigid timers when possible.
- Teach ratios and ranges, such as vinaigrette balance, braise liquid depth, or pan sauce reduction.
- Ask the user what ingredients and equipment they have.
- Help the user adapt the framework to their pantry.
- Offer guardrails for common failure points.
- End with a short reflection that reinforces what the user learned.

### Palate Customization Engine

Post-cook review should capture useful taste feedback, not just ratings. Rekky should learn the user’s palate and adjust future recipes subtly.

Instead of asking only for stars, Rekky should ask targeted questions such as:

- How was the acid balance?
- Was it salty enough?
- Did it need more heat?
- Was the richness right?
- Was the sweetness distracting?
- Did the texture land where you wanted?

If the user says a dish was "a bit too sharp," Rekky should remember that signal and slightly dial back citrus, vinegar, fermented ingredients, or other acid sources in future suggestions when appropriate.

### Palate Customization Behavior

- Store feedback as structured taste signals, not only free text.
- Track preferences for acid, salt, heat, sweetness, bitterness, richness, texture, spice intensity, and doneness.
- Apply preferences gently so recipes do not become one-note.
- Keep cuisine and dish context in mind before changing a recipe.
- Let the user override or reset learned preferences.
- Explain meaningful adjustments briefly when they affect a recipe.
- Avoid treating one bad cook as a permanent preference shift.

### Education Acceptance Criteria

- A user can choose a guided framework instead of a strict recipe.
- The app teaches why each technique step matters.
- The user receives useful sensory checkpoints while cooking.
- Post-cook feedback updates a persistent palate profile.
- Future recipes adapt to the user’s taste without hiding major changes.
- The feature makes the user less dependent on exact recipes over time.

## Hyper-Local, Hyper-Seasonal Gastro-Intelligence

Rekky should eventually understand the user’s local food supply, not just their broad location. The goal is to connect recipes, inspiration, and substitutions to what is actually fresh, available, and distinctive nearby.

### Micro-Seasonal Alerts

Rekky should notice short seasonal windows and help the user act on them.

Example:

"The first wild ramps just hit the farmers market near you this weekend. Here are three ways to showcase them."

These alerts should be rare, timely, and useful. They should feel like a knowledgeable local cook pointing out an opportunity, not generic content marketing.

### Smart Ingredient Swaps Based On Terroir

When a recipe calls for an ingredient that is unavailable, expensive, or not ideal locally, Rekky should suggest a substitution grounded in local flavor and supply.

Example:

If a recipe calls for a specific Italian cheese that is not available nearby, Rekky should not default to a generic substitute. It should suggest a local artisan cheese from a nearby dairy that matches the flavor profile, texture, age, salt level, melt behavior, and intended role in the recipe.

### Local Intelligence Inputs

- User location and preferred shopping radius.
- Farmers markets, CSAs, co-ops, specialty grocers, butchers, fishmongers, bakeries, dairies, and farm stands.
- Local harvest calendars.
- Vendor availability when reliable.
- Regional specialties and local producers.
- User budget and shopping habits.
- Ingredient quality signals, such as freshness, peak season, production style, and distance.

### Product Behavior

- Recommend seasonal dishes based on what is locally peaking.
- Surface micro-seasonal opportunities only when confidence is high.
- Suggest nearby sources for standout ingredients.
- Offer substitutions that preserve the ingredient’s role in the dish.
- Prefer local ingredients only when they improve freshness, fit, or meaning.
- Avoid forcing local substitutions when the original ingredient is essential.
- Explain why a local swap works in culinary terms.

### Lean First Version

- Use user location plus a coarse seasonal produce calendar.
- Suggest seasonal recipe ideas for the user’s region.
- Add simple substitution notes for common unavailable ingredients.
- Let users save preferred local markets and shops.

### Later Enhancements

- Farmers market and CSA availability feeds.
- Local producer profiles.
- Ingredient freshness alerts.
- Region-specific recipe adaptation.
- Shopping lists grouped by local source.
- Local cheese, produce, seafood, meat, and bakery substitution engine.
- Vendor-aware recipe planning.

### Local Intelligence Acceptance Criteria

- Rekky can recommend dishes around ingredients currently in season near the user.
- Alerts are specific, timely, and sparse enough to remain valuable.
- Ingredient swaps account for flavor, texture, technique, and recipe role.
- Local substitutions are explained clearly.
- The user can control location, shopping radius, and alert frequency.
- The feature makes the app feel connected to the user’s real food environment.

## Open Product Questions

- Should this live as a dedicated cooking workflow or as a special chat mode?
- Should external research be required, optional, or only used when the user provides a source clue?
- Should the app show research sources to the user or only summarize the reasoning?
- Should recipes be saved as memories, recipes, or both?
- How much uncertainty should the AI expose before the output feels too technical?
- Should No-Recipe Mode be a separate mode, a recipe toggle, or a natural next step after a user cooks a dish a few times?
- Which palate preferences should be global, and which should be cuisine-specific?
- What level of local data reliability is required before sending micro-seasonal alerts?
- Should local vendor recommendations require explicit user opt-in?

## Acceptance Criteria

- A user can start from a vague dish memory and get a useful first recipe.
- The AI asks clarifying questions instead of making low-confidence guesses too early.
- The generated recipe is directly cookable.
- User feedback leads to a visibly revised recipe, not a minor rewording.
- The feature preserves prior versions and the final chosen recipe.
- The workflow fits the cooking app and does not reintroduce generic chat bloat.
