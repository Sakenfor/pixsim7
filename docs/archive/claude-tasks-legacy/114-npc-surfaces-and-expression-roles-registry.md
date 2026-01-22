**Task: NPC Surfaces & Expression Roles Registry (Plugin-Extensible Expressions)**

> **For Agents (How to use this file)**
> - This task introduces a **plugin-extensible “surface/role” layer** on top of `NpcExpression`, so plugins and systems can declare portrait/close-up/dialogue surfaces without new tables.
> - Goal: keep `NpcExpression` as a small, generic mapping table while letting plugins define richer “expression roles” (e.g. `closeup_kiss`, `dialogue_angry`) in a structured way.
> - Do **not** change the core `NpcExpression` schema unless necessary; prefer conventions + a registry and plugin metadata.

---

## Context

Current model for NPC visual expressions:

- `NpcExpression` (`pixsim7/backend/main/domain/game/models.py`):
  - `npc_id`, `state: str`, `asset_id`, optional `crop`, `meta`.
  - Intended for portraits / small talking/reaction clips (“expression surfaces”).
  - No FK to asset tables (keeps domains decoupled).

This works well for simple “portrait / talking / reaction” use, but we also want:

- Plugin-defined surfaces, e.g.:
  - Romance plugin: `closeup_kiss_soft`, `closeup_kiss_intense`.
  - Stealth plugin: `alert_portrait`, `caught_in_the_act`.
  - Mood plugin: `mood_very_happy`, `mood_anxious`.
- Per-world or per-plugin control over which surfaces exist and what they mean, without changing the DB schema each time.

The stat system solved a similar problem by introducing **stat packages** and a registry; we want an analogous pattern for NPC surfaces/expressions.

---

## Goals

- Keep `NpcExpression` as a **generic storage layer** (no schema explosion).
- Introduce a **surface/role registry** that:
  - Lets core & plugins register NPC surface types (e.g. `"core.portrait"`, `"plugin.game-romance.closeup_kiss"`).
  - Associates each surface type with semantics (where it’s used: overlays, 2D, generation, etc.).
- Use `NpcExpression.meta` (and/or `state`) to link each row to a registered surface type:
  - `meta.surfaceType: string` (e.g. `"portrait"`, `"closeup_kiss"`).
  - `meta.pluginId?: string`, `meta.tags?: string[]` for filtering.
- Allow worlds to choose which surface packages they use:
  - Via `GameWorld.meta` configuration, similar to stat packages and gating plugins.

Out of scope:

- Replacing or redesigning core rendering; this is about discovery/config, not drawing.

---

## Phase Checklist

- [ ] **Phase 1 – Audit Current NpcExpression Usage**
- [ ] **Phase 2 – Design NpcSurfacePackage & Registry API**
- [ ] **Phase 3 – Implement Backend NpcSurface Registry & Plugin Hook**
- [ ] **Phase 4 – Annotate NpcExpression Rows with Surface Types**
- [ ] **Phase 5 – Expose Surfaces to Frontend & Game-Core**

---

## Phase 1 – Audit Current NpcExpression Usage

**Goal:** Understand how `NpcExpression` is currently used so the surface/role registry aligns with existing patterns.

**Steps:**

- Search for `NpcExpression` usage in backend and frontend:
  - Backend: any services or APIs that query or manipulate `npc_expressions`.
  - Frontend/game-core: any code that expects certain `state` values (e.g., `"idle"`, `"talking"`, `"reaction_*"`).
- Document:
  - What `state` values are used today.
  - How expressions are selected (by state, by tags, by NPC ID).
  - Any plugin-specific assumptions already visible in the code or docs.

---

## Phase 2 – Design NpcSurfacePackage & Registry API

**Goal:** Define a domain model and registry API for NPC surfaces/roles that mirrors the stat package pattern but is tailored to expressions.

**Steps:**

- Add a small domain model in backend, e.g. `pixsim7/backend/main/domain/npc_surfaces/package_registry.py`:

  ```python
  class NpcSurfacePackage(BaseModel):
      id: str                   # e.g. "core.portrait", "plugin.game-romance.closeup_kiss"
      label: str
      description: str | None
      category: str | None      # e.g. "portrait", "closeup", "dialogue"
      surface_types: dict[str, dict[str, Any]]  # surfaceTypeId -> metadata
      source_plugin_id: str | None
  ```

- Registry API:
  - `register_npc_surface_package(pkg: NpcSurfacePackage) -> None`
  - `get_npc_surface_package(id: str) -> NpcSurfacePackage | None`
  - `list_npc_surface_packages() -> dict[str, NpcSurfacePackage]`
  - `find_surface_types(surface_type_id: str) -> list[tuple[NpcSurfacePackage, dict]]`
- Decide on conventions:
  - `surfaceTypeId` examples: `"portrait"`, `"dialogue"`, `"closeup_kiss"`, `"reaction_clip"`.
  - Whether `state` strings in `NpcExpression` should always match `surfaceTypeId` or be more granular (e.g. `state="closeup_kiss_soft"` with `meta.surfaceType="closeup_kiss"`).

---

## Phase 3 – Implement Backend NpcSurface Registry & Plugin Hook

**Goal:** Implement the registry and give plugins a way to contribute NPC surface packages at startup.

**Steps:**

- Implement `NpcSurfacePackage` and registry functions in `package_registry.py`.
- Extend plugin event types (`pixsim7/backend/main/infrastructure/plugins/types.py`):
  - Add `PluginEvents.NPC_SURFACES_REGISTER = "npc:surfaces_register"`.
- In the plugin manager (`plugins/manager.py`):
  - After loading each plugin, emit `PluginEvents.NPC_SURFACES_REGISTER` with `plugin_id` and optionally a callback for `register_npc_surface_package` (pattern matching stat packages).
- Example: `game_romance` plugin:
  - Registers a package `id="plugin.game-romance.closeup"` with `surface_types={"closeup_kiss": {...}}`.

**Notes:**

- Keep this registry **process-local**; each host can have different surface packages based on enabled plugins.

---

## Phase 4 – Annotate NpcExpression Rows with Surface Types

**Goal:** Start tagging `NpcExpression` rows with surface types so the registry becomes useful.

**Steps:**

- Decide on a convention for `NpcExpression.meta`, e.g.:

  ```jsonc
  {
    "surfaceType": "portrait",                  // matches a surface type in a package
    "pluginId": "game-romance",                // optional
    "tags": ["romance", "closeup", "kiss"]     // optional
  }
  ```

- Update any code that creates or updates `NpcExpression` rows to include `meta.surfaceType` where appropriate:
  - Core code: use `"portrait"` / `"dialogue"` / `"reaction_clip"` for built-in surfaces.
  - Plugins: set `surfaceType` to plugin-defined values (e.g. `"closeup_kiss"`).
- Optionally, add a small validation helper that:
  - Given an `NpcExpression`, checks whether `meta.surfaceType` exists in any registered `NpcSurfacePackage` and logs a warning if not.

---

## Phase 5 – Expose Surfaces to Frontend & Game-Core

**Goal:** Make NPC surface packages and surface types visible to frontend and game-core so UIs and tools can discover and use them.

**Steps:**

- Backend:
  - Add a read-only endpoint for surface packages, e.g. `/api/v1/npc-surfaces/packages`.
  - Response shape: list of `NpcSurfacePackage` objects (or a simplified view for TS).
- Frontend / game-core:
  - Add minimal TS types that mirror the JSON shape for `NpcSurfacePackage` and surface types.
  - Build a small “NPC Surfaces Inspector” or config view in `apps/main`, showing:
    - Registered surface packages.
    - Surface types per package.
    - For a given NPC, which `NpcExpression` rows exist for each surface type.
- Update any existing expression consumers to prefer `meta.surfaceType` + registry over hard-coded `state` strings where appropriate:
  - E.g. romance UIs query “all `surfaceType === 'closeup_kiss'` expressions for NPC N”.

---

## Validation & Notes

- After this task:
  - `NpcExpression` remains a simple table (no schema explosion).
  - NPC surfaces (portrait, dialogue, close-up, etc.) are defined as **packages** and can be extended by plugins.
  - Worlds and tools can discover available surface types via a registry and APIs, rather than relying on hard-coded state strings.
- Future extensions:
  - Per-world surface configuration (e.g. enabling/disabling certain surfaces per world).
  - Integration with `GameRuntime` so surfaces can be selected based on stat-based state (mood, intimacy, etc.) via plugins.

