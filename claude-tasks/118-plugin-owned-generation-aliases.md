# Task 118: Plugin‑Owned Generation Aliases & Finalization

This task builds on the recent generation pipeline drift fixes and the new
`register_generation_alias()` API to **finish the transition** toward plugins
owning their own semantic generation aliases (e.g. `npc_response`) instead of
hard‑coding them everywhere in core.

The goal is to keep the unified pipeline stable while making it clear that:

- Core owns **canonical operations** (`OperationType` + canonical
  `generation_type` strings).
- Plugins own **semantic aliases** that express game concepts on top of those.

---

## 0. Context & References

Recent work:

- Drift fixes & mappings:
  - `pixsim7/backend/main/shared/operation_mapping.py`
  - `pixsim7/backend/main/shared/schemas/generation_schemas.py`
  - `pixsim7/backend/main/services/generation/creation_service.py`
  - `pixsim7/backend/main/services/provider/provider_service.py`
  - `apps/main/src/lib/api/controlCenter.ts`
- New operation registry & validation:
  - `pixsim7/backend/main/shared/operation_mapping.py`
    - `OPERATION_REGISTRY`
    - `GENERATION_TYPE_OPERATION_MAP`
    - `validate_operation_coverage()`, `assert_operation_coverage()`
    - `register_generation_alias()` + `ALIAS_METADATA`
- Game dialogue / NPC plugins:
  - `pixsim7/backend/main/plugins/game_dialogue/manifest.py`
  - `pixsim7/backend/main/plugins/game_npcs/manifest.py`

Current alias situation:

- Canonical/structured `generation_type` values (schema):
  - `text_to_image | transition | variation | dialogue | environment | npc_response | image_edit | video_extend | fusion`
- Operation mappings:
  - `variation | dialogue | environment` → `TEXT_TO_VIDEO`
  - `npc_response` → `IMAGE_TO_VIDEO`
  - `image_edit` → `IMAGE_TO_IMAGE`
  - `transition` → `VIDEO_TRANSITION`
- Plugin registration already added:
  - In `game_dialogue.on_load()`:
    - `register_generation_alias("npc_response", IMAGE_TO_VIDEO, owner="game-dialogue")`
    - `register_generation_alias("dialogue", TEXT_TO_VIDEO, owner="game-dialogue")`
    - `register_generation_alias("environment", TEXT_TO_VIDEO, owner="game-dialogue")`

The remaining work is to **clarify and consolidate responsibilities** so that
semantics live in plugins, while core stays simple and generic.

---

## 1. Clarify Canonical vs Semantic Aliases

**Goal:** Make it explicit which names are canonical core labels, and which
are plugin‑owned semantic aliases, without breaking any existing configs.

### 1.1 Classify aliases in `operation_mapping.py`

File: `pixsim7/backend/main/shared/operation_mapping.py`

- Review `OPERATION_REGISTRY` and `GENERATION_TYPE_OPERATION_MAP`:
  - Classify each `generation_type` as either:
    - **Canonical core name** (generic operation label, e.g. `text_to_image`), or
    - **Semantic/game alias** (e.g. `npc_response`, `dialogue`, `environment`).
- Add a short comment near each alias or at the top of the map documenting:
  - Which ones are “core canonical” vs “plugin/semantic”.
  - That semantic aliases should be registered/owned by plugins via
    `register_generation_alias()`.

> Note: For now, do **not** remove existing entries from
> `GENERATION_TYPE_OPERATION_MAP`; keep backward compatibility and treat
> plugin calls to `register_generation_alias()` as assertions + metadata.

### 1.2 Ensure alias metadata is complete

- Verify that all semantic aliases currently in use
  (`npc_response`, `dialogue`, `environment`, etc.) are:
  - Present in `GENERATION_TYPE_OPERATION_MAP`.
  - Present in `OPERATION_REGISTRY[op].generation_type_aliases`.
  - Have an entry in `ALIAS_METADATA` after plugin load.
- If any semantic alias is still “orphaned” (no owner), either:
  - Attach it to the appropriate plugin (see section 2), or
  - Mark it clearly in comments as “core legacy alias” that should not be
    used in new configs.

Acceptance:

- A short comment block in `operation_mapping.py` that clearly documents
  canonical vs semantic aliases.
- All semantic aliases in use have owner metadata in `ALIAS_METADATA` at
  runtime (verify via a small REPL/test if needed).

---

## 2. Move Semantic Responsibility into Plugins

**Goal:** Every semantic/game‑flavored alias that is still “alive” is clearly
owned by a plugin, not by generic core code.

### 2.1 Game dialogue aliases

File: `pixsim7/backend/main/plugins/game_dialogue/manifest.py`

- Confirm the existing `register_generation_alias()` calls in `on_load()`:
  - `npc_response` → `IMAGE_TO_VIDEO`
  - `dialogue` → `TEXT_TO_VIDEO`
  - `environment` → `TEXT_TO_VIDEO`
- Ensure import paths are correct and that `on_load()` runs early enough
  (it should be called by the plugin manager during startup).

### 2.2 NPC / other plugins (if applicable)

- Inspect other plugins (if any) that might conceptually use or introduce
  semantic labels:
  - `pixsim7/backend/main/plugins/game_npcs/manifest.py`
  - `pixsim7/backend/main/plugins/game_romance/manifest.py`
  - `pixsim7/backend/main/plugins/game_stealth/manifest.py`
- For each plugin that needs its own semantic `generation_type` labels:
  - Add `register_generation_alias()` calls in `on_load()` with:
    - A descriptive alias string.
    - The appropriate `OperationType`.
    - `owner` set to the plugin id (e.g. `"game-npcs"`).
- Do **not** introduce new alias strings unless the plugin actually uses
  them in configs or API; this task is about ownership, not expansion.

Acceptance:

- Any alias that represents a game concept has a clear owner (plugin id)
  and is registered in that plugin’s `on_load()` hook.

---

## 3. Wire Alias Metadata into Introspection / Tooling

**Goal:** Make alias ownership visible to tooling and future audits so
we can detect drift early.

### 3.1 Extend metadata listing

File: `pixsim7/backend/main/shared/operation_mapping.py`

- Update `list_generation_operation_metadata()` to include alias metadata:
  - For each `generation_type`, include:
    - `generation_type`
    - `operation_type`
    - `owner` (if present in `ALIAS_METADATA`)
    - `is_semantic_alias` (bool, based on your classification)
  - This may require merging `GENERATION_TYPE_OPERATION_MAP` and
    `ALIAS_METADATA` into the returned objects.

### 3.2 (Optional) Expose via API

- If not already present, add or extend a small introspection endpoint
  (e.g. in `api/v1/generations.py` or a dev‑only route) that:
  - Returns the list from `list_generation_operation_metadata()`.
  - Is safe to call from frontend dev tools and drift audits.

Acceptance:

- A call to `list_generation_operation_metadata()` (or the corresponding
  API) returns, for each alias:
  - The operation type it maps to.
  - Whether it is semantic vs canonical (if implemented).
  - The owning plugin (if any).

---

## 4. Documentation & Usage Guidance

**Goal:** Make it easy for future work (and other agents) to follow the new
pattern instead of re‑introducing hard‑coded aliases.

### 4.1 Update or add a short doc section

Suggested file: `docs/systems/generation/GENERATION_SYSTEM.md` or a new small doc,
e.g. `docs/GENERATION_ALIAS_CONVENTIONS.md`.

Document briefly:

- Canonical operations vs semantic aliases:
  - Canonical: `OperationType` + matching `generation_type` where possible.
  - Semantic: plugin‑owned labels that are mapped via
    `register_generation_alias()`.
- How to add a new plugin semantic alias:
  1. Decide the canonical `OperationType` you’re using.
  2. Call `register_generation_alias("my_alias", OperationType.XYZ, owner="my-plugin")` in your plugin’s `on_load()`.
  3. Use `"my_alias"` in that plugin’s configs/scene data only.
- The rule: *core code should not introduce new semantic alias strings*
  without a plugin owner.

### 4.2 Cross‑reference in existing tasks/docs

- In `claude-tasks/116-generation-pipeline-drift-audit.md` or
  `claude-tasks/117-generation-pipeline-drift-fixes.md`, add a short
  “See also” note pointing at the new alias conventions doc (optional).

Acceptance:

- There is a small, discoverable doc explaining:
  - What aliases are.
  - How plugins should register and use them.
  - That new semantic names should not be hard‑coded into core mapping
    without plugin ownership.

---

## 5. Non‑Goals / Constraints

- Do **not** break existing stored `generation_config` documents:
  - Existing `generation_type` values like `npc_response`, `variation`,
    `dialogue`, `environment` **must continue to work**.
- Do not change `GenerationNodeConfigSchema.generation_type` pattern in
  this task beyond comments or very minor clarifications.
- Do not change frontend behavior for Quick Generate in this task.
  (Any cleanup of frontend unions/mappings can be a follow‑up task.)

---

## 6. Deliverables

When this task is complete, we should have:

1. **Clear classification** of canonical vs semantic aliases in
   `operation_mapping.py`, with comments and owner metadata wired up.
2. **Plugin ownership** for all semantic aliases currently in use
   (e.g. dialogue/narrative‑related names), via calls to
   `register_generation_alias()` in plugin `on_load()` hooks.
3. **Enhanced introspection** from `list_generation_operation_metadata()`
   (and optionally an API) that exposes alias → op → owner relationships.
4. **Lightweight documentation** explaining the alias pattern so future
   changes don’t re‑introduce drift or anonymous strings in core mapping.

