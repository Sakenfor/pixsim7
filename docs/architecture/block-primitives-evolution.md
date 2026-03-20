# Block Primitives: Architecture Evolution & Open Questions

> **Status:** Architecture companion (context + rationale), not the canonical execution plan.
> **Canonical plan ID:** `block-primitives-evolution` (query via `/api/v1/dev/plans/block-primitives-evolution`)
> **Current snapshot:** `docs/architecture/reviews/block-primitives-snapshot-2026-03-10.md`
> **Topic:** Block/primitive systems, PromptBlock retirement, composition paths | **Last verified:** 2026-03-03
> **Related:** `prompt-pipeline-current-state.md` (superseded snapshot), `prompt-resolver-next-v1.md`, `../../docs/actions/README.md` (archived)

> Update (March 1, 2026): Runtime and game dialogue now resolve through primitives-first composition (`dynamic_slot_planner -> compiler_v1 -> next_v1`). Legacy `/api/v1/action_blocks`, `routes/action_blocks`, and the ActionEngine selector stack were removed from active backend runtime wiring.
>
> Update (March 2, 2026): PromptBlock retirement progressed further. Active write/query paths now target `BlockPrimitive`, block references in main DB moved to canonical string `block_id` values, and PromptBlock is now legacy/archive-only for remaining historical surfaces.
>
> Update (March 3, 2026): Frontend catalog reads were consolidated behind `apps/main/src/lib/resolvers/*` (`resolverRegistry` + domain resolver modules). World/location/NPC/session/project/template/content-pack reads now use resolver APIs with explicit `consumerId` tracking instead of ad-hoc direct list calls.

## Current State (March 2026)

### Three Block Systems Exist

| System | Table | Database | Status | Content |
|--------|-------|----------|--------|---------|
| **PromptBlock** | `action_blocks` | Main DB | Legacy/archive only | Historical block records kept for compatibility while final cleanup lands |
| **BlockPrimitive** | `block_primitives` | Separate `pixsim7_blocks` DB | Active canonical source | Atomic and prose-capable blocks used by current composition paths |
| **PromptVersion** | `prompt_versions` | Main DB | Active | Complete versioned prompts (final output, not building blocks) |

### PromptBlock Status Snapshot (March 2, 2026)

- PromptBlock is no longer the active model for block composition/runtime selection.
- New and updated block content flows through `BlockPrimitive` (blocks DB) in active paths.
- `block_image_fits.block_id` now stores canonical string block IDs (not UUID FK to `action_blocks.id`).
- `character_usage.action_block_id` now stores canonical string block IDs.
- `prompt_version_blocks.block_id` has been moved to canonical string block IDs as a soft reference.
- `dev_prompt_timeline` no longer queries PromptBlock directly for family block summaries.
- Embedding service now embeds and searches `BlockPrimitive`.
- PromptBlock remains in codebase as a legacy model until final schema/model cleanup.

### PromptBlock Model (Legacy)
Heavy model with many fields most systems don't use:
- `role`, `category`, `tags` — core organization (still useful)
- `kind` (single_state/transition) — video choreography specific
- `compatible_next/prev` — sequencing graph (templates handle this now)
- `intent` (generate/preserve/modify/add/remove) — useful for multi-asset ops
- `complexity_level` — nice to have
- `transition_from/to/via`, `camera_movement`, `consistency` — very specific to video choreography
- `is_composite`, `component_blocks`, `composition_strategy` — redundant with templates
- `reference_image` — useful but niche
- `embedding` (768-dim) — semantic search

### BlockPrimitive Model (New)
Deliberately simple:
- `block_id`, `category`, `text`, `tags` — core content
- `capabilities` — explicit runtime/composition capability IDs used by compiler/resolver gating
- `owner_id`, `source` (system/user/imported) — ownership
- `is_public`, `avg_rating`, `usage_count` — discovery
- `embedding` (768-dim) — semantic search
- No separate role/intent/sequencing columns; these remain tag/capability/composer concerns

### What's Already Wired
- Template slots and runtime resolution now use primitives as the active source.
- Runtime query mode resolves through planner/compiler/resolver instead of the legacy selector stack.
- Template service primitive query path is the only supported block source in active roll/resolve flow.
- Frontend read-path access is now registry-backed for catalog data:
  - `game.catalog.*` (worlds, locations, npcs)
  - `game.catalog.sessions`
  - `game.catalog.saved-projects`
  - `blocks.catalog.*` (templates, primitives, content packs)
- `_CATEGORY_FALLBACK` in composition_role_inference.py maps primitive categories to composition roles
- Block matrix panel supports viewing both sources
- Primitives support `frame` field for spatial wrapping (e.g., `"{text} from the left side"`)
- ScenePrep currently launches template fanout generation and records `scene_prep_*` provenance; it does not directly invoke `/api/v1/game/dialogue/primitives/select`.
- Scene Prep panel state is authoring/runtime input only; `ActionSelectionContext` is runtime resolver input in backend game dialogue flow.
- Dev/category apply + content pack block import now write `BlockPrimitive` rows.
- Semantic pack export and dev ontology scan now read primitives for block catalog data.
- Timeline/debug aggregation derives block usage from `Generation + BlockImageFit` and resolves primitive IDs from blocks DB.
- Embedding path is primitive-based (`EmbeddingService` targets `BlockPrimitive`).
- New block IDs are enforced as namespaced strings (for collision safety across packs/projects).

---

## Decision: Unified Canonical Model

### Proposal: BlockPrimitive becomes the single canonical block model

Everything goes in the blocks DB — both atomic primitives and prose-length narrative chunks. The difference is **category and text length**, not model structure.

```
block_primitives table (blocks DB):
  ├── light               (5-20 words)   — atomic modifier
  ├── camera              (5-20 words)   — atomic modifier
  ├── wardrobe            (10-30 words)  — atomic modifier, optionally image-backed
  ├── mood                (5-15 words)   — atomic, generic modifier
  ├── color               (5-10 words)   — atomic, generic modifier
  ├── location            (5-10 words)   — atomic, generic modifier
  ├── texture             (5-15 words)   — atomic, generic modifier
  ├── rendering           (10-20 words)  — atomic modifier
  ├── framing             (10-20 words)  — atomic modifier
  ├── character_desc      (50-300 words) — prose block
  ├── environment_narrative (50-200 words) — prose block
  └── interaction_choreography (100-500 words) — prose block
```

### Why Unify
- Prose blocks and primitives are structurally identical: `block_id + category + text + tags`
- Same query system (`build_block_primitive_query`) works for both
- Same composition pipeline handles both
- Same tag-based filtering
- No benefit to maintaining two separate models/databases/query paths
- PromptBlock's extra fields (`compatible_next/prev`, `transition_from/to/via`, etc.) are unused dead weight

### What Gets Retired
- `action_blocks` table (PromptBlock) - frozen, final drop pending completion of legacy cleanup
- Any old content worth keeping migrates to BlockPrimitive with appropriate categories
- `block_source: "action_blocks"` routing path in template service is removed from active flow
- Remaining PromptBlock model/domain exports are legacy surfaces to delete in final cutover

### Small Additions Needed on BlockPrimitive
- `reference_asset_id` (optional) — for image-backed blocks (wardrobe, character references)
- Possibly `source_pack` — provenance tracking (which content pack)

---

## Generic Modifiers Pattern

Some primitive categories are **generic modifiers** — they work with any other primitive via template slot adjacency. The primitive doesn't know what it modifies; the composer decides by placing them next to each other.

| Category | Generic? | Works with |
|----------|----------|-----------|
| `color` | Yes | Any — light color, wardrobe color, environment color |
| `location` | Yes | Any — light position, character position, prop position |
| `mood` | Yes | Any — scene mood, character mood, interaction mood |
| `texture` | Yes | Any — rendering texture, fabric texture, surface texture |
| `light` | No | Lighting-specific |
| `camera` | No | Camera-specific |
| `wardrobe` | No | Character-specific |
| `environment` | No | Scene-specific |

---

## Pack Stratification Baseline (March 4, 2026)

To avoid world-pack bloat, Bananza seed scaffolding now follows a 3-pack split:

- `core_scene_primitives` (`core.*`) for reusable scene fundamentals
- `genre_tone_primitives` (`genre.*`) for tone/arc nudges shared across worlds
- `bananza_boat_demo` (`bananza.*`) for world/character/location-specific blocks only

### Initial Core/Genre Baseline

Added as shared primitives:

- `core.light.daylight_crisp`
- `core.light.sunset_reflections`
- `core.camera.two_shot_medium_tracking`
- `core.camera.establishing_wide`
- `core.continuity.identity_lock`
- `core.continuity.wardrobe_lock`
- `core.motion.forward_progress_small`
- `genre.comedy.mood.slapstick_flirt`
- `genre.comedy.mood.awkward_pause`
- `genre.sensual.nudge.eye_contact_hold`
- `genre.sensual.nudge.distance_reduce`

### Bananza-to-Shared Migration Map (Seed IDs)

| Previous Bananza ID | New Shared ID | Pack |
|---|---|---|
| `bananza.light.tropical_noon` | `core.light.daylight_crisp` | `core_scene_primitives` |
| `bananza.light.sunset_reflections` | `core.light.sunset_reflections` | `core_scene_primitives` |
| `bananza.camera.two_shot.deck` | `core.camera.two_shot_medium_tracking` | `core_scene_primitives` |
| `bananza.camera.wide_boat_reveal` | `core.camera.establishing_wide` | `core_scene_primitives` |
| `bananza.mood.slapstick_flirt` | `genre.comedy.mood.slapstick_flirt` | `genre_tone_primitives` |
| `bananza.mood.awkward_pause` | `genre.comedy.mood.awkward_pause` | `genre_tone_primitives` |

### Scaffold Slot Implications

Scene scaffold slots for `light`, `camera`, and `mood` are now configured as multi-pack selectors (via `tags.any.source_pack`) instead of strict `world=bananza_boat` filters. This keeps Bananza templates compatible while allowing shared-pack evolution.

---

## Prose Blocks & Granularity Evolution

### Key Insight: Prose blocks don't decompose — primitives grow around them

A prose `character_desc` block:
```
"gorilla, massive frame, deep brown eyes, black chef's jacket
 tailored to frame, gold embroidery, folded arms, jaw set, unimpressed"
```

This block stays as-is. But as the primitive vocabulary grows:
- `wardrobe` primitives exist → composer can split outfit out
- `pose` primitives exist → composer can split posture out
- `mood` primitives exist → composer can split emotional state out

The prose block becomes a **fallback** for when fine-grained primitives don't exist. The composer's logic:

```
1. "I need a character" → query category: character_desc
2. "Are there wardrobe primitives matching this context?" → query category: wardrobe + tags
   → yes? → use trimmed character_desc + separate wardrobe
   → no?  → use full prose block as-is
3. Repeat for pose, mood, etc.
```

### No Decomposition Required
- Existing prose blocks always remain valid
- New prose blocks can be written leaner (knowing primitives handle modular parts)
- The **composer** decides granularity at runtime, not the block

---

## Composition Paths (Multiple Composers)

There are multiple ways to compose blocks into a generation request. All should work with the unified block model:

### 1. Pre-Authored Templates
```
Template YAML → slot list → find_candidates() → select → compose → prompt
```
- Slots pre-defined with categories, tags, selection strategies
- `block_source` routes to blocks DB
- Most predictable, least dynamic

### 2. ScenePrep (Frontend, Manual)
```
User picks cast + guidance refs + variants → template fanout → generation
```
Already has concepts that map to primitives:
- `castRows` → character blocks
- `guidanceRefRows` → reference assets (wardrobe images, etc.)
- `candidateAssets` by group → primitive categories
- `variantRows` → camera/framing primitives

### 3. Runtime Composer Path (Backend, Runtime)
```
Game state -> ActionSelectionContext -> dynamic slot plan -> compile -> resolve -> generation
```
Current context-aware inputs:
- `locationTag` → environment/location primitives
- `mood` → mood primitives
- `pose` → character_pose primitives
- `intimacy_level` → wardrobe/mood filtering
- `leadNpcId` → character script block

### 4. Dynamic Slot Builder (Future)
```
Game state → infer needed categories → query available primitives → compose
```
The missing piece — a composer that dynamically builds a slot list based on:
- What the game needs (character + environment + lighting)
- What granularity is available (are wardrobe primitives available, or just prose?)
- Current game context (NPC state, relationship, arc progress, location)

### Key Insight
All paths are converging on primitives, but as of March 1, 2026 there are still two active execution routes:
- Runtime/game dialogue path: `ActionSelectionContext -> dynamic_slot_planner -> compiler_v1 -> next_v1`.
- ScenePrep path: template fanout compile/execute with `scene_prep_*` run-context metadata.

This means ScenePrep and runtime selection are aligned in intent, but not yet a single unified execution entrypoint.

---

## Game Entity Connections

### Current Glue (Exists)
| Layer | Mechanism | Location |
|-------|-----------|----------|
| PromptFamily | `game_world_id`, `npc_id`, `scene_id` FKs | domain/prompt/models.py |
| Character bindings | Template maps roles → character UUIDs | api/v1/block_templates.py |
| Template variables | `{{npc.name}}`, `{{actor}}`, `{{affinity}}` | NarrativeContext.to_template_vars() |
| CharacterUsage | Junction table: character ↔ blocks | domain/game/entities/character.py |
| ActionSelectionContext | Filters by location, intimacy, mood, NPC IDs | domain/narrative/action_blocks/ |
| NarrativeContext | Full game state → template vars | domain/narrative/context.py |
| Social context builder | Relationship stats → content rating | services/generation/social_context_builder.py |

### Missing Glue
- BlockPrimitive has no direct FK to game entities (by design — most are generic)
- Entity-specific blocks (gorilla's chef jacket) need optional game refs
- Options: tags (`{npc_archetype: gorilla_chef}`), optional FK, or both

### Character System
Character editor is the most built-out game entity UI:
- Full tabbed editor (identity, visual, rendering, personality, behavior, voice)
- `visual_traits` (JSON: build, height, skin/fur, eyes, clothing, accessories)
- `reference_assets` / `surface_assets` (structured per-asset metadata)
- Game NPC sync (`sync-to-game` / `sync-from-game`)
- Character versioning/evolution

No structured outfit/wardrobe system — clothing is loose JSON keys in `visual_traits`.

---

## Wardrobe as Primitives

### Proposal
Outfit descriptions as BlockPrimitive entries:
```yaml
- block_id: wardrobe.chef_jacket_black
  category: wardrobe
  text: "black chef's jacket, tailored to frame, name embroidered in gold thread"
  tags: { style: formal, occupation: chef, color: black, fit: tailored }
  reference_asset_id: 456  # optional — actual image of the jacket
```

### Why This Works
- Same model as all other primitives
- Swappable via template/composer slot
- Not locked to any character — template decides pairing
- Can be prompt-only, image-only, or both
- `color` generic modifier works: [wardrobe: chef jacket] + [color: black]
- Future control sliders can adjust tags (fit: loose → tailored → skin_tight)

### Image + Prompt Dual Mode
When a wardrobe primitive has both `text` and `reference_asset_id`:
- Text flows into prompt composition (describes the outfit)
- Asset flows into composition_assets (visual reference for generation)
- Both influence the generation — text guides, image anchors

---

## Open Questions

### 1. Granularity Discovery
How does a runtime composer know to split a prose block into finer primitives? Options:
- **Category convention**: if `wardrobe` primitives exist and character_desc mentions clothing, prefer the split
- **Tag overlap detection**: character_desc tagged `{has_wardrobe: true}` signals extractable wardrobe
- **Explicit slim variants**: maintain both "full" and "slim" versions of prose blocks
- **Composer rules**: hardcoded logic ("always try to split wardrobe from character_desc")

### 2. Prose Block Boundaries
Where does a primitive end and a prose block begin? Current thinking:
- **Primitive**: single aspect, swappable, works in any context (5-30 words)
- **Prose block**: narrative context, character-specific or scene-specific (50-500 words)
- **No hard line** — category is the organizer, not text length

### 3. Game Entity Ownership
Should some blocks belong to game entities?
- Generic blocks (lighting, camera, mood) → no ownership, available everywhere
- Character-specific blocks (gorilla chef description) → optionally linked to character/NPC
- Scene-specific blocks (backstage corridor narrative) → optionally linked to location/scene
- Implementation: optional `entity_ref` field? Tags? Both?

### 4. Migration Path
If BlockPrimitive becomes canonical:
- Which old PromptBlock content is worth migrating?
- What categories do legacy blocks map to?
- Does the `action_blocks` table stay as read-only archive or get dropped?
- Which final code surfaces still import/export PromptBlock and can now be deleted safely?

### 5. ScenePrep Integration
How do primitives appear in the ScenePrep UI?
- As selectable groups alongside existing guidance refs?
- As a new "modifiers" section with per-category pickers?
- Replace candidate asset groups with primitive category queries?

### 6. Runtime Composer Scope
How far should runtime composition go versus template-driven composition?
- Keep dynamic slot planning focused on runtime/game contexts only?
- Reuse compiler/resolver constraints between runtime and template roll paths?
- Decide where granularity heuristics should live (planner vs compiler vs resolver).

### 7. Composition Intelligence
When the composer has both a full prose block and fine-grained primitives available:
- Does it prefer granular? (more control, but more complexity)
- Does it prefer prose? (simpler, but less swappable)
- Context-dependent? (game runtime → granular for dynamism; static template → prose for stability)

---

## Proposed Next Steps (Not Prioritized)

1. **Add wardrobe + mood + texture + rendering + framing primitive categories** to scene_foundation pack
2. **Add `reference_asset_id` to BlockPrimitive model** for image-backed blocks
3. **Seed first prose blocks** (character descriptions, environment narratives) as BlockPrimitive
4. **Create a test character** via Character editor, with wardrobe primitives
5. **Converge runtime + template selection policy** where practical
6. **Wire ScenePrep** to show primitive categories as modifier options
7. **Build dynamic slot builder** — game state → category list → primitive query → compose
8. **Finalize PromptBlock retirement** (apply migrations in all envs, remove legacy model exports/imports, then drop `action_blocks`)
