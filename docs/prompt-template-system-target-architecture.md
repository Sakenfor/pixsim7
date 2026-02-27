# Prompt Block / Template System - Target Architecture (Proposed)

> Date: 2026-02-23
> Scope: Implementation-oriented target architecture for connecting existing systems.
> Status: Proposed (separate from `docs/prompt-template-system-current-state.md`)

---

## 1. Purpose

Define a practical target architecture that connects the existing prompt block/template system with:

- character reference images (multi-image providers like Pixverse)
- template revisions/forks/shareability
- composition role taxonomy alignment
- future "template as structured scene request" usage (including game-facing flows)

This document is intentionally incremental. It assumes the current vertical slice remains intact and focuses on adding connective layers rather than rewriting the system.

---

## 2. Design Principles

1. Keep templates reusable.
- Templates should reference roles/bindings, not provider-specific image slot syntax.

2. Keep hard constraints deterministic.
- Slot filtering and package constraints remain deterministic.
- AI (later) can rerank filtered candidates, not replace hard constraints.

3. Separate identity from behavior.
- Reference images / character definitions own identity.
- Blocks describe behavior, placement, mood, and scene integration.

4. Preserve current content-pack workflow.
- YAML packs remain the authoring source for curated content.
- New features should work with current loader/reload flow.

5. Add new capabilities behind adapters.
- Provider-specific prompt/image formatting lives in provider adapters/formatters, not in templates.

---

## 3. Target End State (High Level)

Template roll and generation become a two-part output:

1. Human/model prompt text (existing)
2. Structured render plan (new sidecar)

The structured render plan captures:

- cast assignments (template role -> character)
- reference image assignments (template role -> asset/image slot)
- provider image legend mapping (image #2, image #3, ...)
- slot diagnostics and selection debug
- scene metadata useful for future game/event systems

High-level flow:

```text
Template + Slots + Controls + Character Bindings
        +
Runtime Cast Assignment (characters, refs, provider options)
        ->
Template Roll (deterministic selection + character expansion)
        ->
Render Plan Builder (reference images, provider legend, diagnostics)
        ->
Provider Formatter (Pixverse etc.)
        ->
Generation Request (prompt + attached images + config/runContext)
```

---

## 4. Core Concepts (Target Model)

### 4.1 Template (stays domain-specific)

A `BlockTemplate` remains a prompt-domain artifact:

- slots
- composition strategy
- controls
- character bindings
- template metadata

It should not become provider-specific or image-slot-specific.

### 4.2 Character Binding (extended)

Current state: text-oriented binding for placeholder expansion.

Target extension:

- optional runtime reference image metadata
- optional character definition linkage
- optional resolver hints (view/pose/outfit)

Conceptually:

```json
{
  "binding_key": "elderly_man_1",
  "character_id": "char_123",
  "fallback_name": "An elderly man",
  "reference": {
    "asset_id": "asset_456",
    "image_index": 2,
    "view": "three_quarter",
    "pose": "standing"
  }
}
```

Note: `image_index` is runtime/provider assignment, not author-time template content.

### 4.3 Character Reference Set (new, lightweight first)

A character may have multiple reference images.

Target capability:

- store multiple images per character
- tag them (view, pose, outfit, expression, quality)
- select best fit per template role requirement

This can start as a lightweight JSON-backed structure and later become a first-class table/model.

### 4.4 Template Role Requirement (derived from slots + metadata)

Templates/slots imply requirements for cast/reference selection:

- must have reference image
- preferred pose/view
- strict identity lock
- appearance lock vs behavior-only role

This should be derived from template metadata and slot tags, not hardcoded per template in provider code.

### 4.5 Render Plan (new runtime sidecar)

Generated during roll/compose:

- `cast_assignments`
- `reference_images`
- `provider_legend`
- `slot_results`
- `selector_debug`
- `warnings`

This is the bridge from prompt templates to future game/event requests.

---

## 5. Key Connection Layers to Add

## 5.1 Role Mapping Layer (Prompt Roles <-> Composition Roles)

Problem:

- backend prompt blocks/templates use one role taxonomy
- frontend composition tools use another
- current integration is mostly string matching / UI enrichment

Target:

- explicit mapping layer with diagnostics

Example shape:

```json
{
  "prompt_role": "placement",
  "prompt_category": "character_desc",
  "composition_role": "entities:supporting_character",
  "confidence": "manual",
  "notes": "Behavioral/supporting presence, not main subject identity"
}
```

Implementation approach:

1. Add a mapping module/service (read-only table or config first).
2. Expose diagnostics:
- unknown prompt role/category combos
- ambiguous mappings
- unmapped composition roles
3. Use mapping in Prompt Library and Composition Roles panels for richer cross-navigation.

Why first:

- This de-risks later character/reference and game-scene work.

## 5.2 Reference Image Resolver (Character Binding -> Provider Images)

Problem:

- bindings are text-only today
- providers like Pixverse support multiple images

Target:

- runtime resolver chooses reference images per bound character and assigns provider image slots

Rules:

- template binds roles (`elderly_man_1`)
- runtime assigns characters and reference images
- provider formatter emits prompt legend (`image #2`) and attaches assets

V1 behavior:

- one intro legend line, emitted once near prompt start
- blocks stay unchanged and continue using `{{binding}}`

Example legend:

`Use source image (image #1) for the woman. Use reference image #2 for elderly_man_1, #3 for elderly_man_2, and #4 for elderly_man_3.`

## 5.3 Template Revision Layer (Versioning Base Reuse)

Problem:

- templates are in-place mutable
- versioning infra already exists elsewhere

Target:

- immutable template revisions with HEAD pointer/family
- revisions support compare, load, fork, rollback, upstream updates

Minimal model:

- `block_template_families` (or reuse generic version family pattern)
- `block_template_revisions`
- `block_templates` becomes HEAD pointer or current materialized view

Desired outcomes:

- "Try another user's version"
- "Update available" from upstream revision
- reliable diff/compare workflows

## 5.4 Shareable Artifact Layer (Composable, not a big base class)

Target shared concerns:

- ownership policy
- visibility (private/public/unlisted)
- provenance/source metadata (YAML/content pack/user/fork)
- revision linkage (optional)
- sync status/update markers

Templates should use:

- ownership + visibility + provenance + revisions

Blocks should start with:

- ownership + visibility + provenance

Revisions for blocks can come later (especially useful for user-authored blocks).

---

## 6. Identity vs Description Authoring Rules (Important)

To avoid conflicts between reference images and text blocks, define these rules:

1. Reference image owns identity.
- face
- body proportions/build
- hair/age/appearance traits
- clothing (if clothing lock is present)

2. Placement blocks stay spatial only.
- position, depth, relative arrangement
- no emotional tone, no identity restatement

3. Character description blocks split into two classes.
- `identity_descriptive` (use when no reference image)
- `reaction_descriptive` (safe with reference image)

4. Action blocks carry engagement/behavior.
- gaze, gesture, lean-in, reaction timing, motion interactions

5. Atmosphere blocks carry scene tone.
- not identity, not geometry

This can be implemented via tags first (no schema break required), for example:

- `reference_safe: true`
- `description_kind: identity|reaction`

Then runtime can suppress or down-rank identity-descriptive blocks when a binding has a reference image.

---

## 7. Provider Formatting Architecture (Pixverse and Others)

Templates should not contain provider syntax like `"image #2"`.

Add a provider-facing formatter layer that accepts:

- rolled prompt text
- render plan (reference mapping)
- provider capabilities

Formatter responsibilities:

1. Attach reference assets to the request payload.
2. Emit provider-specific legend/preamble wording (if needed).
3. Optionally rewrite phrasing for provider constraints.
4. Record formatter warnings/debug (e.g., missing asset for bound role).

Capability-driven behavior:

- provider supports multi-image refs: add legend + images
- provider supports only source image: omit extra reference binding usage
- provider supports none: degrade gracefully, keep text-only behavior

---

## 8. Template as Structured Scene Request (Game-Facing Direction)

Longer-term goal:

- use templates not only as prompt generators
- also as structured scene/event requests

Target output sidecar (example shape):

```json
{
  "scene_type": "transit_proximity",
  "template_id": "afternoon-metro-elderly-trio",
  "cast": {
    "woman": { "character_id": "..." },
    "elderly_man_1": { "character_id": "..." }
  },
  "references": [
    { "binding": "woman", "provider_image_index": 1, "asset_id": "..." },
    { "binding": "elderly_man_1", "provider_image_index": 2, "asset_id": "..." }
  ],
  "beats": [
    { "kind": "placement", "slot": "Nearest man placement" },
    { "kind": "action", "slot": "Woman engagement beat" },
    { "kind": "action", "slot": "Metro sway contact beat" }
  ],
  "camera": {
    "framing": "tight_intimate_group",
    "fov": "narrow"
  }
}
```

Benefits:

- replay/debugging
- moderation checks on structure
- easier migration to game event systems
- deterministic scene requests across providers

---

## 9. Incremental Implementation Plan

## Phase 1 - Low-risk connectors (high ROI)

1. Add explicit role mapping diagnostics layer.
2. Add runtime character reference mapping (no template schema change required yet).
3. Add provider formatter hook for multi-image legend/preamble.
4. Emit render-plan debug metadata in template roll/generation flow (even if partial).

Outcome:

- Multi-image providers become usable with templates.
- Identity/behavior separation can be enforced incrementally.

## Phase 2 - Template revisioning and collaboration

1. Add template revision/family tables and service adapter using existing versioning base.
2. Update Template Builder to support:
- revision history
- compare
- load revision into draft
- fork
3. Generalize "update available" badge to revision-aware status.

Outcome:

- Safe collaborative authoring on shared backends.

## Phase 3 - Authoring semantics and reference-safe content

1. Tag blocks/slots as reference-safe vs identity-descriptive.
2. Add runtime suppression/down-ranking rules when reference images are present.
3. Add template/package dependency metadata enforcement in roll path (`prefer/restrict/fallback`).
4. Expand Prompt Library diagnostics:
- effective package policy
- candidate counts by package
- reference-safety warnings

Outcome:

- Higher-quality, more predictable rolls for character-grounded templates.

## Phase 4 - AI-assisted selection (optional, layered)

1. Keep deterministic filter + heuristic score.
2. Add AI rerank only on filtered top-K candidates.
3. Persist selector debug and fallback reasons.
4. Add offline eval cases for template quality comparison.

Outcome:

- Better coherence without sacrificing control.

## Phase 5 - Structured scene request / game integration

1. Formalize render plan schema.
2. Persist scene-request sidecar with generations.
3. Expose API for downstream game systems.
4. Add tooling for scene replay/inspection.

Outcome:

- Templates become reusable scene specs, not just prompt assembly recipes.

---

## 10. Proposed Data Additions (Minimal First)

## Runtime-only (start here)

- `binding_reference_images` in run context or generation config extra
- `provider_reference_plan` debug metadata
- `reference_legend` preamble generation

No DB migration required for first pass.

## Template/metadata (later, backwards-compatible)

- `template_metadata.source`
- `template_metadata.dependencies`
- `template_metadata.role_mapping_hints` (optional)
- `template_metadata.reference_policy` (optional)

Prefer metadata JSON first before adding columns.

## DB/schema additions (high-value)

- template revision family/revision tables (or generic reuse with adapter)
- optional `owner_user_id` on `BlockTemplate` (strong ownership semantics)
- optional character reference set tables (later)

---

## 11. Open Questions to Resolve Before Implementation

### Template revisions / forks

- Is `BlockTemplate` HEAD materialized, or do we always read latest revision?
- How should YAML-backed templates map to revision history?
- Are content-pack updates represented as revisions or external source sync events?

### Character reference images

- Where should reference image selection happen: template roll service, generation build layer, or provider adapter?
- What is the source-of-truth for multi-image ordering (`image #2`, `#3`): provider adapter or generic render-plan builder?
- How do we represent missing required refs (error vs degrade)?

### Role mapping

- Is mapping one-to-one enough, or do we need prompt role + category -> composition role?
- Where should mapping live first: code config, DB table, or content-pack metadata?

### Template as game request

- What subset of render plan should be persisted on Generation now?
- What parts are provider-specific and must stay out of game-facing schema?

---

## 12. Immediate Next Actions (Recommended)

1. Implement a role mapping diagnostics module (read-only, no migration).
2. Implement runtime reference-image mapping + Pixverse legend formatter path.
3. Add template revision model proposal and service adapter spike using existing versioning base.
4. Tag new metro/character blocks as reference-safe vs identity-descriptive from the start.

These steps connect the current pieces without blocking on a large redesign.

