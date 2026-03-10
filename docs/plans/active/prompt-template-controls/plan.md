# Prompt Template Controls Backlog

Last updated: 2026-03-10
Owner: template-controls lane
Status: active
Stage: backlog

## TODO: Migrate Sliders From `slotLabel` to `slotKey`

### Why
- Current control effects target slots by `slotLabel` string match.
- Renaming a slot label silently breaks slider behavior.
- We now support stable `slot.key` and `effect.slotKey` (preferred) with `slotLabel` as a legacy fallback.

### Work Items
1. Add `key:` to all authored template slots in YAML content packs (stable, human-readable, never renamed).
2. Update all slider control effects in YAML to include `slotKey:` (keep `slotLabel:` for backwards compatibility during migration).
3. Update the Template Controls editor UI to make `slotKey` first-class:
   - show `slot.key` next to label in the slot list
   - allow targeting effects by slot key (dropdown/search)
   - warn when an effect targets a missing key/label

### Suggested Slot Key Conventions
- `snake_case` keys, scoped to the template (keys only need to be unique within one template):
  - `pose_lock`, `identity_lock`, `framing_lock`, `wardrobe_theme`, `subgenre_cue`, `bone_ornaments`, `tattoos`


## TODO: Add “Theme Modifier Packs” (Abstract Steering, Minimal Prompt Text)

### Goal
Allow shifting an existing theme (e.g. tribal_handcrafted) toward a sub-style like “more provocative” without:
- weaving extra sub-genre words through every block, and
- adding explicit/graphic wording to prompts.

### Proposed Mechanism (Prefer “Selection Steering” Over “Text Injection”)
1. Define a small set of neutral, abstract tags used across style/wardrobe blocks, for example:
   - `allure_level: preserve|subtle|medium|high`
   - `modesty_level: conservative|balanced|daring`
   - `silhouette: relaxed|fitted|accentuated`
   - `surface: matte|oiled|glossy` (only if appropriate for your providers/content goals)
2. Tag existing wardrobe/accessory/body-art blocks with these tags.
3. Add a slider (ex: `Allure`) that applies `slot_tag_boost` to multiple slots:
   - `Wardrobe theme` (primary)
   - `Lighting` / `Color` / `Mood` slots (secondary, if present)
   - optional: `Expression/Presence` slots for “confidence” vs “shy” (non-explicit)
4. Do not add a dedicated “provocative cue” text block unless you explicitly want prompt-level traceability.
   - If you want traceability without extra words in the prompt, prefer storing `control_values` + `slot_results` in the manifest and filtering in UI by those.

### Packaging
- Implement as a small content pack (or shared pack fragment) containing:
  - (optional) modifier blocks with minimal neutral text, if you want a slot-based toggle
  - otherwise only tags + slider effects are needed (no additional blocks)

## Update Log

- 2026-03-10: Normalized plan metadata to template contract and added update-log governance section.
