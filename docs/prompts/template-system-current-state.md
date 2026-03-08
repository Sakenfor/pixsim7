# Prompt Block / Template System — Current State Architecture

> **Generated**: 2026-02-23
> **Scope**: Read-only analysis of implemented code. No speculative redesign.
> **Repo**: pixsim7 (monorepo — Python backend + TypeScript frontend)

>
> **Update (March 1, 2026)**: This document is partially historical. Since it was generated:
> - Legacy `/api/v1/action_blocks` and `routes/action_blocks` were removed.
> - Legacy ActionEngine selector stack is no longer used by runtime/game dialogue flows.
> - Legacy prompt-block service modules were removed.
> - Runtime block selection now resolves through planner/compiler/resolver over primitives.
---

## 1. Executive Summary

### What exists and is already strong

The prompt block/template system is **production-capable** with a complete vertical slice:

- **YAML content packs** load curated blocks, templates, and characters into PostgreSQL with hot-reload via file watcher.
- **Block templates** define slot-based prompt recipes with tag filtering, selection strategies, and composition strategies (sequential, layered, merged).
- **Template rolling** selects blocks per-slot via seeded RNG, supports multiple selection strategies (uniform, weighted_tags, diverse, coherent_rerank, llm_rerank), and composes the final prompt.
- **Character bindings** with late-expansion placeholders (`{{role}}`, `{{role.attr}}`) enable species-agnostic blocks resolved at roll time.
- **Template controls** (sliders) declaratively modify slot intensity and tag preferences at roll time.
- **Diagnostics endpoint** provides per-slot match counts, package breakdowns, and fallback warnings.
- **Frontend tooling** includes a full TemplateBuilder, SlotEditor, ControlsEditor, CastPanel, RollResult display, and Block Explorer — all backed by a Zustand store.
- **runContext** integration enables server-side rolling during generation (per-item variation in burst mode).
- **Composition Roles** taxonomy (auto-generated from vocabulary) provides typed role classification.

### Main architectural gaps

1. **No template versioning/revision tracking** — BlockTemplate has no family/version linkage despite PromptVersion infrastructure existing for prompts.
2. **No shareable template artifacts** — `is_public` flag exists but no export/import, fork, or share-by-link mechanism.
3. **No reference image bindings** — character bindings resolve to text only; no mapping to provider image slots (`image #N`). (Note: op-level entity ref bindings are now supported via `LinkBackedRefBinder`, but these are semantic refs for operations, not provider image slots.)
4. **Control effects are tag-only** — no "locked" controls that force slot parameters (role, category, complexity) rather than just tag preferences.
5. **Semantic Packs reference blocks/families but not templates** — the shareable bundle model doesn't include block templates.
6. **Block ↔ Composition Role alignment is implicit** — block `role` field uses `PromptSegmentRole` enum while composition uses `ImageCompositionRole`; no formal mapping.

### Best next integration moves

1. **Add `version_family_id` to BlockTemplate** — connect to existing `VersioningServiceBase` for revision tracking.
2. **Extend character bindings to carry `reference_image_asset_id`** — enables provider-specific image legend formatting.
3. **Add `block_template_ids` to SemanticPackDB** — make templates distributable alongside blocks.
4. **Add "locked" control effects** — `slot_override` effect kind that can force role/category/complexity, not just tag boosts.
5. **Build role mapping between PromptSegmentRole ↔ ImageCompositionRole** — explicit bridge table or function.

---

## 2. System Map

### High-Level Component Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        YAML CONTENT PACKS                           │
│  pixsim7/backend/main/content_packs/prompt/<pack>/                  │
│    ├── schema.yaml / blocks.schema.yaml (PromptBlock schema defs)   │
│    ├── templates.yaml    (BlockTemplate definitions)                │
│    └── characters.yaml   (Character definitions)                    │
└────────────────────┬────────────────────────────────────────────────┘
                     │ discover + parse + normalize + upsert
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      CONTENT PACK LOADER                            │
│  content_pack_loader.py   — parse YAML, normalize slots, stamp     │
│  content_pack_watcher.py  — watchfiles 1500ms debounce hot-reload  │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     POSTGRESQL DATABASE                             │
│  action_blocks         (PromptBlock)                                │
│  block_templates       (BlockTemplate — slots embedded as JSON)     │
│  characters            (Character)                                  │
│  prompt_families       (PromptFamily — versioning base)             │
│  prompt_versions       (PromptVersion — git-like history)           │
│  semantic_packs        (SemanticPackDB — shareable bundles)         │
│  asset_version_families (AssetVersionFamily — asset versioning)     │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     BACKEND SERVICES                                │
│  BlockTemplateService — CRUD, roll, diagnostics, selection          │
│  CharacterBindingExpander — {{role.attr}} expansion                 │
│  composition_engine helpers — derived analysis only                   │
│  PromptFamilyService — family/version CRUD                          │
│  OwnershipService — access control policies                         │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     REST API (FastAPI)                               │
│  /api/v1/block-templates/*  — CRUD, roll, diagnostics, blocks       │
│  /api/v1/generations        — runContext-driven rolling              │
│  /api/v1/concepts/role      — runtime composition roles             │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│               SHARED API CLIENT (TypeScript)                        │
│  packages/shared/api/client/src/domains/blockTemplates.ts           │
│  packages/shared/types/src/blockTemplate.ts                         │
│  packages/shared/types/src/composition-roles.generated.ts           │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 FRONTEND APPLICATION                                 │
│  blockTemplateStore (Zustand)                                       │
│  TemplateBuilder / SlotEditor / ControlsEditor / CastPanel          │
│  TemplateRollResult                                                 │
│  PromptLibraryInspector (diagnostics, packages, block explorer)     │
│  QuickGenerateController (pinned template → runContext → server)    │
└─────────────────────────────────────────────────────────────────────┘
```

### Template Roll Path

```
Frontend:                                Backend:
 ┌──────────────┐    POST /roll         ┌──────────────────────────────┐
 │ Roll button  │ ──────────────────►   │ BlockTemplateService         │
 │ (or pinned   │    {seed,             │   .roll_template()           │
 │  auto-roll)  │     exclude_ids,      │                              │
 └──────────────┘     char_bindings,    │ 1. Load template             │
                      control_values}   │ 2. Normalize slots           │
                                        │ 3. Apply controls            │
                                        │ 4. CompilerV1 → candidates   │
                                        │ 5. LinkBackedRefBinder       │
                                        │    (bind op refs, prune)     │
                                        │ 6. NextV1Resolver            │
                                        │    (score, pick winners)     │
                                        │ 7. Compose + expand chars    │
                                        │ 8. Return RollResult         │
                                        │    (incl. ref_binding stats) │
                                        └──────────────────────────────┘
```

### Generation Path with runContext

```
Frontend (QuickGenerateController):
  ┌─────────────────────────────────────┐
  │ mode='each' → pass template_id      │
  │ mode='once' → roll client-side,     │
  │               pass assembled_prompt  │
  └─────────────┬───────────────────────┘
                │  POST /generations
                │  config.run_context = {
                │    block_template_id,
                │    character_bindings,
                │    mode, run_id, item_index
                │  }
                ▼
Backend (generations.py:150-183):
  ┌─────────────────────────────────────┐
  │ If block_template_id in run_context │
  │   → roll_template(template_id, ...) │
  │   → replace config.prompt           │
  │   → persist roll metadata           │
  │     (seed, selected_block_ids,      │
  │      assembled_prompt)              │
  └─────────────────────────────────────┘
```

### Source-of-Truth Boundaries

| Data | Source of Truth | Sync Direction |
|------|----------------|----------------|
| Block text/tags | YAML content packs | YAML → DB (upsert on load) |
| Template structure (YAML-backed) | YAML → DB | YAML → DB (reload replaces) |
| Template structure (user-created) | DB only | DB ← Frontend |
| Character definitions | YAML → DB | YAML → DB |
| Composition roles | Vocabulary YAML → codegen → TS | Codegen → Runtime API |
| Roll results | Ephemeral (returned from API) | Not persisted directly |
| Generation run_context | DB (generation record) | Frontend → Backend → DB |
| Template controls | template_metadata JSON | YAML or Frontend → DB |

---

## 3. Backend Inventory

### Models

| Model | Table | File | Key Fields |
|-------|-------|------|------------|
| `PromptBlock` | `action_blocks` | `domain/prompt/models.py:281-620` | block_id (unique), role, category, kind, text, tags (JSON), complexity_level, source_type, package_name, embedding (Vector(768)) |
| `BlockTemplate` | `block_templates` | `domain/prompt/models.py:622-738` | slug (unique), slots (JSON array), composition_strategy, character_bindings (JSON), template_metadata (JSON), package_name |
| `PromptFamily` | `prompt_families` | `domain/prompt/models.py:28-123` | slug (unique), prompt_type, game_world_id, npc_id, scene_id |
| `PromptVersion` | `prompt_versions` | `domain/prompt/models.py:126-273` | family_id, version_number, prompt_hash (SHA256), parent_version_id, branch_name, semantic_version, diff_from_parent |
| `SemanticPackDB` | `semantic_packs` | `domain/semantic_pack.py:15-161` | id, version (semver), action_block_ids, prompt_family_slugs, parser_hints, status |

### Enums

File: `domain/prompt/enums.py`

| Enum | Values | Purpose |
|------|--------|---------|
| `PromptSegmentRole` | character, action, setting, mood, romance, camera, other | Block role classification |
| `BlockSourceType` | library, parsed, ai_extracted, user_created, migrated, imported | Provenance tracking |
| `CurationStatus` | raw, reviewed, curated | Quality lifecycle |
| `BlockKind` | single_state, transition | Block type for generation |
| `ComplexityLevel` | simple, moderate, complex, very_complex | Char-count tiers |
| `BlockIntent` | generate, preserve, modify, add, remove | How block applies to input |
| `PromptSourceType` | versioned, inline, generated, unknown | Generation prompt origin |

### Services

| Service | File | Responsibilities |
|---------|------|-----------------|
| `BlockTemplateService` | `services/prompt/block/template_service.py` (~900 lines) | CRUD, roll_template, diagnostics, selection strategies, control effects, preview |
| `LinkBackedRefBinder` | `services/prompt/block/ref_binding_adapter.py` | Binds op refs on compiled candidates against available_refs / link lookups; prunes unresolvable candidates in `required` mode; stamps `ref_binding` diagnostics into roll metadata |
| `CharacterBindingExpander` | `services/prompt/block/character_expander.py` | `{{role.attr}}` expansion with species vocabulary lookups |
| `composition_engine` helpers | `services/prompt/block/composition_engine.py` | Derived analysis from selected blocks (legacy class removed) |
| `ContentPackLoader` | `services/prompt/block/content_pack_loader.py` (~530 lines) | YAML discovery, parsing, DB upsert, pruning, rehoming |
| `ContentPackWatcher` | `services/prompt/block/content_pack_watcher.py` | watchfiles-based hot-reload with 1500ms debounce |
| `PromptFamilyService` | `services/prompt/family.py` | Family/version CRUD, auto-increment, diff generation |
| `VersioningServiceBase` | `services/versioning/base.py` (~446 lines) | Generic versioning: timeline, ancestry, HEAD management |
| `TemplateCRUDService` | `services/entity_crud/crud_service.py` | Generic CRUD with ownership scoping |

### APIs

File: `api/v1/block_templates.py` (~530 lines)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/block-templates` | POST | Create template |
| `/block-templates` | GET | List/search templates (package, tag, is_public, owner_user_id, mine, include_public filters) |
| `/block-templates/{id}` | GET | Get by UUID |
| `/block-templates/by-slug/{slug}` | GET | Get by slug |
| `/block-templates/{id}` | PATCH | Update |
| `/block-templates/{id}` | DELETE | Delete |
| `/block-templates/{id}/roll` | POST | Roll template (seed, exclude_ids, char_bindings, control_values) |
| `/block-templates/{id}/diagnostics` | GET | Per-slot match counts and warnings |
| `/block-templates/preview-slot` | POST | Preview matching blocks for a slot spec |
| `/block-templates/blocks` | GET | Search blocks (role, category, kind, package, text, tags) |
| `/block-templates/blocks/roles` | GET | Role/category combinations with counts |
| `/block-templates/blocks/tags` | GET | Tag facets (distinct keys and values) |
| `/block-templates/meta/packages` | GET | Distinct block package names |
| `/block-templates/meta/content-packs` | GET | Discovered content packs on disk |
| `/block-templates/meta/content-packs/reload` | POST | Hot-reload packs (force, prune options, admin only) |

### Slot Normalization / Schema Migration

File: `services/prompt/block/template_slots.py`

- **Schema version**: `TEMPLATE_SLOT_SCHEMA_VERSION = 2` (stored in `template_metadata.slot_schema_version`)
- **v1→v2 migration**: Moves legacy `tag_constraints` flat maps into canonical `tags` groups (`{all, any, not}`)
- **Tag query aliases**: `all_of`→`all`, `any_of`→`any`, `none_of`→`not`
- **Slot presets**: Named preset bundles (e.g. `subject_preservation` → 3 slots for pose/identity/framing lock)
- **Normalization cascade**: tag queries → preferences (boost/avoid tags) → selection config (top_k, temperature, weights)

### Block Query Semantics

File: `services/prompt/block/block_query.py` (~190 lines)

Tag query groups use PostgreSQL JSONB operators:
- **`all`**: AND — every key-value pair must match (`jsonb_extract_path_text(tags, key) IN values`)
- **`any`**: OR — at least one pair must match
- **`not`**: Exclusion — none of the pairs may match (`IS NULL OR value NOT IN`)

Values can be strings or lists (multi-match). Example:
```yaml
tags:
  all: { intensity: [5, 6], location: "park" }    # intensity in [5,6] AND location="park"
  any: { mood: ["romantic", "intimate"] }          # mood in any of these
  not: { camera_angle: "surveillance" }            # exclude this
```

### Content Pack Loader Behavior

File: `services/prompt/block/content_pack_loader.py`

- **Discovery**: Scans `content_packs/prompt/<pack>/` for YAML files
- **Create-only fields**: `source_type=library`, `curation_status=curated`, `created_by=content_pack` — set on INSERT, never overwritten
- **Metadata stamping**: `template_metadata.content_pack = <pack_name>`
- **Rehoming**: If same entity appears in a different pack, ownership transfers without force flag
- **Pruning**: With `prune_missing=True`, removes DB rows whose IDs are absent from current YAML
- **Atomic**: All changes committed in single transaction

---

## 4. Frontend Inventory

### Builder / Editor

| Component | File | Purpose |
|-----------|------|---------|
| `TemplateBuilder` | `features/prompts/components/templates/TemplateBuilder.tsx` (~850 lines) | Full template CRUD: name/slug/description, composition strategy, target operation, controls, character bindings, presets, slot management |
| `TemplateSlotEditor` | `features/prompts/components/templates/TemplateSlotEditor.tsx` (~524 lines) | Per-slot editor: role/category/kind, tag query JSON, complexity range, selection strategy, preferences, live match preview |
| `TemplateControlsEditor` | `features/prompts/components/templates/TemplateControlsEditor.tsx` (~918 lines) | Slider control definition: label/id, min/max/step/default, slot_intensity + slot_tag_boost effects, per-effect tag editing |
| `TemplateCastPanel` | `features/prompts/components/templates/TemplateCastPanel.tsx` (~160 lines) | Character selection before rolling: per-role dropdown with species/category filtering, "Random" sentinel option |
| `TemplateRollResult` | `features/prompts/components/templates/TemplateRollResult.tsx` (~168 lines) | Roll display: summary bar, per-slot results with status badges, warnings, assembled prompt with char count, "Use"/"Re-roll" actions |

### Template Controls / Sliders

File: `features/prompts/lib/templateControls.ts` (183 lines)

**Schema** (implemented):

```typescript
interface TemplateSliderControl {
  id: string;          // e.g. "pose_lock"
  type: 'slider';      // Only slider type exists
  label: string;
  min: number;         // Default 0
  max: number;         // Default 10
  step: number;        // Default 1
  defaultValue: number;
  effects: TemplateControlEffect[];
}

type TemplateControlEffect =
  | { kind: 'slot_intensity'; slotLabel: string }
  | { kind: 'slot_tag_boost'; slotLabel: string;
      enabledAt?: number;  // Threshold value
      boostTags?: Record<string, string | string[]>;
      avoidTags?: Record<string, string | string[]> };
```

**Runtime behavior** (backend `_apply_control_effects`):
- For each control, finds slot_tag_boost effects where `control_value >= enabledAt`
- Merges boost/avoid tags into slot preferences
- **Highest-threshold matching effect wins** (not cumulative)

**What exists vs what's missing**:
- `slot_intensity`: Sets slot.intensity value directly
- `slot_tag_boost`: Modifies tag preferences at thresholds
- **Missing**: `slot_override` (force role/category/complexity), `slot_toggle` (enable/disable slot), `composition_switch` (change composition strategy)

### Prompt Library / Block Explorer / Diagnostics

| Component | File | Purpose |
|-----------|------|---------|
| `PromptLibraryInspectorPanel` | `features/panels/domain/definitions/prompt-library-inspector/` | Unified browser with tabs: packages, templates (with diagnostics), blocks |
| `BlockExplorerPanel` | `features/panels/domain/definitions/block-explorer/` | Block browser: role/category tree, tag facets, text/metadata detail view |

**Diagnostics display** (via `GET /block-templates/{id}/diagnostics`):
- Per-slot: `total_matches`, `package_match_counts[]`, `template_package_match_count`
- Flags: `has_matches_outside_template_package`, `would_need_fallback_if_template_package_restricted`
- Status hints: `queryable`, `reinforcement`, `audio_cue`

### Panel Registration

| Panel ID | Component | Category | Default Zone |
|----------|-----------|----------|--------------|
| `template-builder` | TemplateBuilderPanel | prompts | center |
| `template-library` | TemplateLibraryPanel | tools | left (350px) |
| `block-explorer` | BlockExplorerPanel | tools | — |
| `prompt-library-inspector` | PromptLibraryInspectorPanel | tools | — |

### Composition Roles Integration

- **Generated types**: `packages/shared/types/src/composition-roles.generated.ts` — auto-generated from vocabulary YAML via `pnpm composition-roles:gen`
- **Runtime API**: `compositionPackageStore` (Zustand) fetches `/api/v1/concepts/role` for plugin-aware roles
- **Frontend usage**: PromptLibraryInspectorPanel uses `useCompositionPackages()` for role colors/descriptions
- **Mapping functions**: `inferRoleFromTag()`, `inferRoleFromTags()` — resolve tag strings to `ImageCompositionRole`
- **Gap**: Block `role` field (`PromptSegmentRole`: character, action, camera, etc.) is not formally mapped to `ImageCompositionRole` (entities:main_character, camera:angle, etc.)

### State Management

File: `features/prompts/stores/blockTemplateStore.ts` (~356 lines)

Zustand store with:
- `templates[]`, `activeTemplate`, `draftSlots[]`, `draftCharacterBindings`
- `lastRollResult`, `pinnedTemplateId`, `templateRollMode` ('once' | 'each')
- CRUD methods, slot management, binding management, preset save/load/rename/delete
- `roll(templateId, seed)` → calls API → updates `lastRollResult`

### Shared API Client vs App Wrapper

| Layer | File | What it does |
|-------|------|-------------|
| **Shared client** | `packages/shared/api/client/src/domains/blockTemplates.ts` (~290 lines) | All API functions: listTemplates, rollTemplate, searchBlocks, getTemplateDiagnostics, etc. |
| **App wrapper** | `apps/main/src/lib/api/blockTemplates.ts` (~52 lines) | Re-exports from shared client via `createBlockTemplatesApi(pixsimClient)` |

---

## 5. Data Model / Concept Map

### Core Concepts

| Concept | Definition | Where it lives | Notes |
|---------|-----------|-----------------|-------|
| **Content Pack** | A directory of pack files (`schema.yaml`/`blocks.schema.yaml` for blocks, plus `templates.yaml`, `characters.yaml`) | Filesystem → DB | Source of truth for curated content; DB rows stamped with `content_pack` source |
| **Package** | A `package_name` string grouping related blocks/templates | `PromptBlock.package_name`, `BlockTemplate.package_name` | Scoping mechanism for queries; not a first-class entity |
| **PromptBlock** | A reusable text fragment with role/category/tags | `action_blocks` table | Has embeddings (Vector(768)), provenance tracking, quality metrics |
| **BlockTemplate** | A recipe of ordered slots that select blocks + compose them | `block_templates` table | Slots stored as embedded JSON array; no independent slot table |
| **Slot** | A position in a template that selects one block | Embedded in `BlockTemplate.slots[]` | Has tag query, selection strategy, preferences, intensity, fallback_text |
| **Character** | A named entity with species, vocabulary, visual/behavioral traits | `characters` table (via content packs) | Used by character bindings for `{{role.attr}}` expansion |
| **Character Binding** | Maps a template role name to a character_id + cast spec | `BlockTemplate.character_bindings` (JSON) | `cast.filter_species` / `filter_category` for CastPanel dropdowns |
| **Template Control** | A slider that modifies slot behavior at roll time | `BlockTemplate.template_metadata.controls[]` | Only slider type implemented; effects: `slot_intensity`, `slot_tag_boost` |
| **Roll Result** | Output of rolling a template: assembled prompt + per-slot results + ref_binding diagnostics | Ephemeral (API response) | Metadata persisted via `runContext` in generation records. `metadata.ref_binding` carries binding stats (mode, candidates_checked/pruned, resolved_ref_count, warnings). Selected block payloads carry `block_metadata.op.resolved_refs` / `resolved_params`. |
| **runContext** | Metadata object attached to generation requests | `GenerationConfig.run_context` | Carries `block_template_id`, `character_bindings`; receives `selected_block_ids`, `seed`, `assembled_prompt` after rolling |
| **Composition Role** | A typed role in the visual composition taxonomy | `composition-roles.generated.ts`, runtime via `/api/v1/concepts/role` | Hierarchical: `entities:main_character`, `camera:angle`, etc. |
| **Semantic Pack** | A shareable bundle referencing blocks + prompt families | `semantic_packs` table | References by ID, not copies; has `parser_hints`, `status` lifecycle |
| **PromptFamily** | A versioned prompt lineage (git-like) | `prompt_families` table | Has game integration fields (world_id, npc_id, scene_id) |
| **PromptVersion** | A specific version of a prompt with ancestry | `prompt_versions` table | Has `parent_version_id`, `branch_name`, `diff_from_parent` |

### Concept Overlaps / Splits

| Overlap | Details |
|---------|---------|
| **Block role vs Composition role** | `PromptBlock.role` uses `PromptSegmentRole` (character, action, camera, etc.). `ImageCompositionRole` uses hierarchical IDs (entities:main_character, camera:angle). No formal bridge. |
| **Template slots vs PromptVersion** | Templates compose blocks into prompts via slots. PromptVersion stores full prompt text with version history. No direct linkage — a template roll produces text that could become a PromptVersion but doesn't automatically. |
| **Package vs Content Pack** | Content pack is a filesystem directory; package_name is a DB-level grouping string. A content pack can define blocks in any package_name. They're related but not 1:1. |
| **template_metadata vs template controls** | Controls live inside `template_metadata.controls[]`. Other metadata fields (slot_schema_version, target_operation, provider, notes) coexist in the same JSON blob. |
| **Semantic Pack vs Content Pack** | Content packs are filesystem-loaded YAML. Semantic packs are DB-backed shareable manifests. They reference similar entities but are different distribution mechanisms. |

---

## 6. Implemented vs Scaffolded

| Feature | Status | Where | Notes |
|---------|--------|-------|-------|
| YAML content pack loading | **Implemented** | `content_pack_loader.py` | Full discovery, parse, upsert, rehoming, pruning |
| Hot-reload watcher | **Implemented** | `content_pack_watcher.py` | watchfiles + debounce; reloads on .yaml change |
| Block template CRUD | **Implemented** | `template_service.py`, API routes | Full REST API with search/filter |
| Template rolling with selection strategies | **Implemented** | `template_service.py:691-900+` | uniform, weighted_rating, weighted_tags, diverse |
| Op ref binding (LinkBackedRefBinder) | **Implemented** | `ref_binding_adapter.py`, `template_service.py` | Binds op refs/params, prunes candidates; modes: off/advisory/required; diagnostics in roll metadata |
| Slot schema normalization (v1→v2) | **Implemented** | `template_slots.py` | Auto-migrates legacy tag_constraints to canonical form |
| Slot presets | **Implemented** | `template_slots.py:22-68` | subject_preservation, pose_lock_graduated, camera_stability, etc. |
| Character binding expansion | **Implemented** | `character_expander.py` | {{role}}, {{role.attr}}, {{role.pronoun.x}}, species vocab |
| Composition strategies | **Implemented** | `template_service.py` | sequential (default), layered, merged |
| Template diagnostics | **Implemented** | `template_service.py:222-322`, API endpoint | Per-slot match counts, package breakdowns, warnings |
| Template controls (slider) | **Implemented** | `templateControls.ts`, backend `_apply_control_effects` | slot_intensity + slot_tag_boost effects |
| Cast panel (character selection) | **Implemented** | `TemplateCastPanel.tsx` | Per-role dropdown with species/category filters |
| Dual roll mode (once/each) | **Implemented** | `useQuickGenerateController.ts` | Client-side once vs server-side per-item |
| runContext template metadata persistence | **Implemented** | `generations.py:150-183` | seed, selected_block_ids, assembled_prompt stored |
| Block explorer with tag facets | **Implemented** | `BlockExplorerPanel.tsx` | Role tree, tag facets, block detail |
| Prompt Library Inspector | **Implemented** | `PromptLibraryInspectorPanel.tsx` | Tabs: packages, templates, blocks |
| Composition Roles taxonomy | **Implemented** | `composition-roles.generated.ts` | Auto-generated; runtime API for plugin roles |
| Prompt versioning (family/version) | **Implemented** | `domain/prompt/models.py`, `services/prompt/family.py` | Git-like: version_number, parent_id, branch_name, diff |
| Asset versioning | **Implemented** | `domain/assets/versioning.py`, `services/versioning/base.py` | HEAD pointer, timeline, ancestry chain |
| Generic ownership policies | **Implemented** | `services/ownership/policies.py` | GLOBAL, USER, WORLD, SESSION scopes |
| User-owned resource helpers | **Implemented** | `services/ownership/user_owned.py` | `resolve_user_owned_list_scope`, `resolve_user_owner`, `assert_can_write_user_owned` — canonical helpers for list scoping, owner field extraction, and write access checks. Used by block template and analyzer preset routes. |
| Generic CRUD service | **Implemented** | `services/entity_crud/crud_service.py` | Owner-scoped filters, advanced operators |
| Semantic Packs | **Partial** | `domain/semantic_pack.py` | Model exists; references blocks/families but not templates; no service/API layer found |
| Plugin catalog | **Implemented** | `domain/plugin_catalog.py` | Catalog + UserPluginState; per-user enable/settings |
| coherent_rerank / llm_rerank strategies | **Schema-only** | `blockTemplate.ts` type union | Listed in TemplateSlotSelectionStrategy; implementation status in service uncertain |
| Template versioning | **Not implemented** | — | BlockTemplate has no family_id/version_number despite PromptVersion infrastructure |
| Template sharing/export | **Not implemented** | — | `is_public` flag exists but no export/import/fork mechanism |
| Reference image bindings | **Not implemented** | — | Character bindings resolve to text only; no asset_id linkage |
| Locked/override controls | **Not implemented** | — | Controls only modify tags; can't force role/category/complexity |
| Block ↔ CompositionRole bridge | **Not implemented** | — | Two separate role systems with no formal mapping |
| Template dependency tracking | **Schema-only** | `template_metadata.dependencies` field referenced in diagnostics | Field read but never populated by loader |
| Semantic Pack API/service | **Not implemented** | — | Model exists, no CRUD service or API endpoints found |

---

## 7. Integration Seams / Opportunities

### 7.1 Character Bindings → Reference Image Mapping

**Current seam**: `CharacterBinding` already has `character_id` and `cast` fields. The `CastPanel` resolves characters with visual traits.

**Extension point**: Add `reference_image_asset_id?: number` to `CharacterBinding`. During roll composition, a provider-specific formatter could emit image legends (e.g., Pixverse `image #1 = <asset_url>`).

**Files to touch**: `blockTemplate.ts` (type), `character_expander.py` (expand to include image refs), provider-specific prompt formatter.

### 7.2 Provider-Specific Image Legend Formatter

**Current seam**: `template_metadata.provider` and `template_metadata.mode` already exist in YAML. The composition engine assembles text without provider awareness.

**Extension point**: Post-composition hook that takes `(assembled_prompt, character_bindings_with_images, provider_name)` and produces provider-formatted prompt with image references.

### 7.3 Template → VersioningServiceBase

**Current seam**: `VersioningServiceBase` is fully implemented with timeline, ancestry, HEAD management. `BlockTemplate` already has `owner_user_id`, `created_by`, and `template_metadata` (could store `version_family_id`).

**Extension point**: Add `version_family_id`, `version_number`, `parent_template_id` columns to `block_templates`. Implement `BlockTemplateVersioningService(VersioningServiceBase)`.

### 7.4 Semantic Pack → Block Template References

**Current seam**: `SemanticPackDB` already has `action_block_ids[]` and `prompt_family_slugs[]`.

**Extension point**: Add `block_template_slugs: List[str]` to `SemanticPackDB`. Content pack loader could auto-populate this field.

### 7.5 Selector Registry + Debug Surfacing

**Current seam**: `find_candidates()` and `_select_candidate_for_slot()` are separate methods designed as override points (comments note "swap SQL for vector/hybrid search").

**Extension point**: Strategy registry pattern — register named selectors, expose available selectors via API, surface per-slot selector debug info in diagnostics.

### 7.6 Block Role → Composition Role Bridge

**Current seam**: `inferRoleFromTag()` maps tag strings to composition roles. Blocks have structured `tags` (JSON dict).

**Extension point**: Use block tags to infer composition role, or add `composition_role` field to PromptBlock. This enables the composition engine to understand role layers.

### 7.7 Shareable Artifact Layer

**Current seam**: `is_public` flags, `OwnershipPolicy` infrastructure, `PluginCatalogEntry` distribution model, `SemanticPackDB` manifest pattern.

**Extension point**: "Template artifact" = {template + blocks + characters} exportable as a single package. Could reuse SemanticPack as the distribution unit.

---

## 8. Risks / Friction Points

### 8.1 YAML → DB Sync Ambiguity

- **Risk**: If a YAML-backed template is edited in the UI, the next YAML reload overwrites UI changes (unless `force=False` and entity already exists).
- **Current mitigation**: `_BLOCK_CREATE_ONLY` fields are not overwritten on update. But slot definitions, name, description *are* overwritten.
- **Recommendation**: Track `source_type` on templates (like blocks have `source_type`). Refuse to overwrite `user_created` templates on YAML reload.

### 8.2 Embedded Slots JSON

- **Design choice**: Slots are embedded JSON in the template row, never queried independently.
- **Implication**: Cannot query "all templates that use role=camera" without scanning all template slot arrays.
- **Tradeoff**: Simplifies atomic template operations but limits cross-template analytics.

### 8.3 Two Role Systems

- **`PromptSegmentRole`** (backend enum): character, action, setting, mood, romance, camera, other
- **`ImageCompositionRole`** (frontend generated): entities:main_character, camera:angle, materials:atmosphere, etc.
- **Friction**: Block explorer uses one taxonomy; composition engine uses another. No automated mapping between them.

### 8.4 Control Effects Are Tag-Only

- Slider controls can only boost/avoid tags. They cannot:
  - Force a different selection strategy per slot
  - Toggle slots on/off
  - Override role/category/complexity constraints
  - Switch composition strategy
- **Impact**: Limits expressiveness of template authoring. Authors work around this by creating many specialized blocks with different tag values.

### 8.5 No Template Provenance After Roll

- `runContext` stores `selected_block_ids` and `seed`, but the template's *version* at roll time is not captured.
- If a template is later edited, you cannot reconstruct what the template looked like when a specific generation was created.
- **Mitigation**: Could snapshot `template_metadata.slot_schema_version` + slot definitions hash in runContext.

### 8.6 Semantic Pack Is Disconnected

- `SemanticPackDB` model exists with migration, but no service layer or API endpoints were found.
- Cannot currently create, list, or publish semantic packs via API.
- Risk of schema drift if the model evolves without a consuming service.

### 8.7 Character Expansion Fails Silently

- If a character_id in bindings doesn't resolve, the expander uses `fallback_name` or `"A figure"`.
- No diagnostic warning is surfaced to the user via the roll result `warnings` array for this case (uncertain — depends on implementation).

---

## 9. Recommended Roadmap

### Phase 1: Strengthen Existing (Low Risk, High ROI)

**Infrastructure**:
1. **Add `source_type` to BlockTemplate** — mirror the PromptBlock pattern (`library` vs `user_created`). Prevent YAML reload from overwriting user edits.
2. **Snapshot template version in runContext** — store slot definitions hash or slot_schema_version in generation metadata for reproducibility.
3. **Add `block_template_slugs` to SemanticPackDB** — simple column addition, enables template bundling.

**Authoring UX**:
4. **Surface character expansion warnings in RollResult** — if a binding fails to resolve, include it in `warnings[]`.
5. **Add "locked" control effect kind** (`slot_override`) — force role/category/complexity constraints from a slider, not just tag preferences.

### Phase 2: Versioning & Sharing (Medium Risk, High ROI)

**Infrastructure**:
6. **Template versioning** — add `version_family_id`, `version_number`, `parent_template_id` to `block_templates`. Implement `BlockTemplateVersioningService` extending `VersioningServiceBase`.
7. **Semantic Pack CRUD service + API** — build the missing service layer for creating/publishing semantic packs. Enable "Export template as pack" workflow.
8. **Block ↔ CompositionRole mapping function** — `inferCompositionRoleFromBlock(block)` using block.role + block.tags. Register as a concept mapping in the role registry.

**Authoring UX**:
9. **Template diff view** — leverage `diff_from_parent` pattern from PromptVersion. Show slot changes between template versions.
10. **Fork template** — "Save as new" with parent_template_id linkage.

### Phase 3: Character References & Game Integration (Higher Risk, Transformative)

**Infrastructure**:
11. **Reference image bindings** — extend `CharacterBinding` with `reference_image_asset_id`. Build provider-specific image legend formatter (Pixverse `image #N`, Kling reference, etc.).
12. **Template as structured scene request** — formalize `template_metadata` to carry scene-level parameters (target_duration, camera_preset, mood_override). This becomes the "game request" schema.
13. **AI-assisted block selection** — implement `llm_rerank` strategy: candidate set → LLM ranks by scene coherence.

**Authoring UX**:
14. **Visual slot editor** — drag-and-drop slot reordering, inline block preview cards, visual tag query builder.
15. **Template marketplace** — user profiles + published semantic packs + install/fork workflow.

---

## 10. Glossary

| Term | Definition |
|------|-----------|
| **Action Block** / **PromptBlock** | A reusable text fragment with role/category/tags, stored in `action_blocks` table. The atomic unit of prompt composition. |
| **Block Template** | A recipe defining ordered slots that select blocks and compose them into a final prompt. |
| **Slot** | A position in a template that defines constraints (role, tags, complexity) for selecting one block. |
| **Content Pack** | A filesystem directory (`content_packs/prompt/<name>/`) containing YAML definitions for blocks, templates, and characters. |
| **Package** | A `package_name` string grouping related blocks/templates. Not a first-class entity. |
| **Roll** | The act of executing a template: selecting a block for each slot via the configured selection strategy and composing the result. |
| **Composition Strategy** | How selected blocks are assembled: `sequential` (ordered concatenation), `layered`, or `merged`. |
| **Character Binding** | A mapping from a template role name (e.g., "actor") to a specific character_id, with optional cast spec for species/category filtering. |
| **Cast Spec** | Filter hints on a character binding: `filter_species`, `filter_category`, `label`. Used by CastPanel dropdowns. |
| **Template Control** | A slider definition in `template_metadata.controls[]` that modifies slot behavior at roll time via effects. |
| **Control Effect** | An action triggered by a slider value: `slot_intensity` (set intensity) or `slot_tag_boost` (modify tag preferences at threshold). |
| **Reinforcement Slot** | A special slot kind that injects literal text (often with `{{role.attr}}` placeholders) without querying the database. |
| **Audio Cue Slot** | Similar to reinforcement; injects vocalization/reaction text. Can inherit intensity from the prior slot. |
| **Tag Query** | Structured filter on block tags: `{all: {key: value}, any: {key: values}, not: {key: value}}`. |
| **Selection Strategy** | Algorithm for choosing one block from candidates: `uniform`, `weighted_rating`, `weighted_tags`, `diverse`, `coherent_rerank`, `llm_rerank`. |
| **runContext** | Metadata attached to generation requests carrying template info. Flows frontend → backend; enriched with roll results and persisted. |
| **Composition Role** | A typed role in the visual composition taxonomy (e.g., `entities:main_character`, `camera:angle`). Hierarchical with groups and leaves. |
| **Semantic Pack** | A DB-backed shareable manifest referencing blocks and prompt families by ID. Has status lifecycle (draft/published/deprecated). |
| **Prompt Family** | A versioned prompt lineage with git-like branching. Has game integration fields (world_id, npc_id, scene_id). |
| **Prompt Version** | A specific version of a prompt with ancestry tracking, commit messages, and diff caching. |

---

## 11. Questions to Answer Before Implementing

### Template Revisions / Forks

1. Should template versions share the same slug (like prompt families) or get new slugs?
2. Should YAML-backed templates participate in versioning, or only user-created ones?
3. What's the HEAD pointer behavior — latest version, or user-designated "active" version?
4. Can templates be forked across users (if sharing is added), or only within one user's space?
5. Should roll history be tied to template version (for reproducibility audit)?

### Character Reference Images

1. Which providers support multi-image references, and what's the legend format for each?
2. Should reference images be bound at template definition time or at roll/generation time?
3. How do reference images interact with the existing composition asset system (image_to_video input vs reference images)?
4. Should the CastPanel also show reference image thumbnails for characters?
5. What happens when a character is cast to "Random" — does the random character need a reference image too?

### Template as Game Request

1. What's the minimum schema for a "scene request" that a game system would emit?
2. Should the game request override template slots (force specific blocks) or just influence selection (via control values)?
3. How does the scene request interact with NPC/world state from PromptFamily's `game_world_id`/`npc_id` fields?
4. Should templates support conditional slots (slot only activates if certain game state conditions are met)?
5. What's the priority order: game state constraints > template controls > slot defaults?

---

*End of document.*
