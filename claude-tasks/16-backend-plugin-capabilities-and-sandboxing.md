**Task: Backend Plugin Capabilities & Sandboxing (Multi‑Phase)**

> **For Agents (How to use this file)**
> - This is a **roadmap/status document** for the backend plugin system; it is not the primary spec for behavior or NPC logic.
> - Read these first for authoritative behavior and plugin infrastructure:  
>   - `pixsim7_backend/infrastructure/plugins/types.py` – plugin manifest, hooks, events  
>   - `pixsim7_backend/infrastructure/plugins/manager.py` – plugin loading/registration  
>   - `pixsim7_backend/infrastructure/events/handlers.py` – event handler plugins  
>   - `pixsim7_backend/infrastructure/middleware/*` – middleware plugin patterns  
>   - `pixsim7_backend/README.md` – section on plugin system (and what was left behind from PixSim6).
>   - `claude-tasks/13-npc-behavior-system-activities-and-routine-graphs.md` + `13-safeguards-and-extensibility.md` – how plugins are expected to interact with NPC behavior (custom conditions/effects, simulation tiers).
> - Treat the **plugin manifest + capabilities** defined here as the canonical way for plugins to touch world/session/behavior state. Avoid grabbing raw DB sessions or internal services directly from plugins.

---

## Context

Current state of the backend plugin system:

- `PluginManager` dynamically loads plugin modules (`manifest.py`), registers FastAPI routers, and calls optional lifecycle hooks (`on_load`, `on_enable`, `on_disable`).
- `PluginManifest` already exposes:
  - `kind: "route" | "feature"` and basic metadata.
  - `permissions: list[str]` (intended for sandboxing / capability control).
  - `dependencies`, `requires_db`, `requires_redis`, etc.
- Event handler and middleware “plugins” use a similar dynamic loading model.
- The system assumes **trusted plugins**:
  - Plugin code executes in‑process with full Python capabilities.
  - `permissions` are metadata only and are not enforced.
  - Plugins can import internal modules and construct full‑power services/DB sessions if they choose.

We want to evolve this into a **capability-based plugin model** that:

- Makes it easy to build first‑party and partner plugins that:
  - Extend NPC behavior (custom conditions/effects/scoring).
  - React to world/session events.
  - Expose additional feature routes.
- While:
  - Limiting what any single plugin can do (principle of least privilege).
  - Making plugin behavior observable (logging, metrics, diagnostics).
  - Laying groundwork for eventual **sandboxed/out‑of‑process community plugins**.

**Important constraints:**

- Do **not** add new core DB tables or columns to support plugins.
- All plugin configuration should live in:
  - Environment/config (`settings`).
  - World/NPC/session JSON (`meta`, `flags`, `relationships`).
- Plugins should integrate with existing systems (worlds, sessions, behavior, generation) via narrow, well‑typed APIs instead of arbitrary imports.

---

## Phase Checklist

- [ ] **Phase 16.1 – Inventory Plugin Types & Touch Points**
- [ ] **Phase 16.2 – Define Permission Model & Capability Surfaces**
- [ ] **Phase 16.3 – Implement `PluginContext` & DI for In‑Process Plugins**
- [ ] **Phase 16.4 – Enforce Permissions in Behavior/NPC Extensions**
- [ ] **Phase 16.5 – Plugin Observability & Failure Isolation**
- [ ] **Phase 16.6 – World/Workspace‑Scoped Plugin Enablement**
- [ ] **Phase 16.7 – Design Path to Out‑of‑Process / Sandboxed Plugins (Future)**

---

## Phase 16.1 – Inventory Plugin Types & Touch Points

**Goal**  
Get a clear picture of all plugin‑like mechanisms, where they live, and what they can currently do.

**Scope**

- `pixsim7_backend/infrastructure/plugins/*` – main plugin manager & manifest.
- `pixsim7_backend/routes/*` – route “plugins”.
- `pixsim7_backend/event_handlers/*` – event handler plugins.
- `pixsim7_backend/infrastructure/middleware/*` – middleware plugins.
- Behavior extensions planned in Task 13 (custom condition/effect/scoring registries).

**Key Steps**

1. Catalog plugin categories:
   - **Route plugins** – add API endpoints via routers.
   - **Feature plugins** – add game mechanics, behavior, or integrations via hooks and registries.
   - **Event handler plugins** – subscribe to `PluginEvents` and other event buses.
   - **Middleware plugins** – wrap HTTP requests/responses.
2. For each category, note:
   - What objects they can currently access (DB, services, settings).
   - What they’re *intended* to do (e.g. extend behavior vs add admin endpoints).
3. Document the results in a short table appended to this file (plugin type, entrypoint module, allowed capabilities, notes).

**Status:** ☐ Not started

---

## Phase 16.2 – Define Permission Model & Capability Surfaces

**Goal**  
Turn `PluginManifest.permissions` into a concrete, enforceable model and define the small set of capabilities plugins are allowed to use.

**Scope**

- Permission names, semantics, and where they apply.
- Mapping between permissions and capability APIs (`PluginContext` methods).

**Key Concepts**

- **Permissions** are high‑level intents:
  - Example categories:
    - `world:read` – read world meta/config.
    - `session:read` – read session flags/relationships.
    - `session:write` – mutate session flags/relationships.
    - `behavior:extend_conditions` – register custom behavior conditions.
    - `behavior:extend_effects` – register custom activity effects.
    - `generation:submit` – submit requests to `/api/v1/generations`.
    - `log:emit` – emit structured logs/metrics under a given plugin ID.
    - `admin:routes` – expose admin‑only endpoints.
- **Capabilities** are concrete surfaces exposed to plugins:
  - Read‑only views (`WorldReadAPI`, `SessionReadAPI`).
  - Scoped mutation APIs (`SessionMutationsAPI`, `BehaviorExtensionAPI`).
  - Helper clients (`GenerationAPI`, `LoggingAPI`).

**Key Steps**

1. Define a minimal initial permission set in code (e.g. `PLUGIN_PERMISSIONS` enum or constants).
2. For each permission, define:
   - What API(s) it unlocks.
   - Any extra constraints (e.g. `admin:routes` requires global config flags).
3. Update `PluginManifest` docstring / comments to reference these canonical permissions.
4. Decide on failure modes:
   - Missing permission ⇒ deny capability and log a warning (do not crash app).
   - Unknown permission string ⇒ ignore or warn; do not grant extra power.

**Status:** ☐ Not started

---

## Phase 16.3 – Implement `PluginContext` & DI for In‑Process Plugins

**Goal**  
Provide plugins with a restricted, permission‑aware context object instead of full access to internal services.

**Scope**

- `PluginContext` type and helpers in `pixsim7_backend/infrastructure/plugins`.
- Wiring context into:
  - Route plugins (via FastAPI dependency injection).
  - Event handler plugins (via `plugin_hooks`).

**Sketch: `PluginContext`**

```python
class PluginContext:
    def __init__(
        self,
        plugin_id: str,
        permissions: list[str],
        db: AsyncSession | None,
        redis: Redis | None,
        # Capability helpers (lazy-initialized)
        world_api: WorldReadAPI,
        session_api: SessionAPI,
        behavior_api: BehaviorExtensionAPI,
        generation_api: GenerationAPI,
        logger: structlog.BoundLogger,
    ):
        self.plugin_id = plugin_id
        self.permissions = set(permissions)
        self.world = world_api
        self.session = session_api
        self.behavior = behavior_api
        self.generation = generation_api
        self.log = logger
```

**Key Steps**

1. Implement `PluginContext` factory:
   - Takes a `PluginManifest`, `db`/`redis` (if allowed), and global config.
   - Builds capability helpers based on `manifest.permissions`.
2. Expose a FastAPI dependency for route plugins:

```python
def get_plugin_context(plugin_id: str):
    async def _dep(
        db: AsyncSession = Depends(get_database),
        redis: Optional[Redis] = Depends(get_redis_client),
    ) -> PluginContext:
        manifest = plugin_manager.get_plugin(plugin_id)['manifest']
        return build_plugin_context(manifest, db=db, redis=redis)
    return _dep
```

3. Encourage route plugin authors to declare:

```python
@router.get("/something")
async def do_something(ctx: PluginContext = Depends(get_plugin_context("my_plugin"))):
    world = await ctx.world.get_world(world_id)
    ...
```

4. For event handlers, pass `PluginContext` (or a subset) into callback signatures so they don’t need raw DB/services.

**Status:** ☐ Not started

---

## Phase 16.4 – Enforce Permissions in Behavior/NPC Extensions

**Goal**  
Ensure that plugins extending the NPC behavior system (Task 13) can only do so via well‑defined, permission‑checked hooks.

**Scope**

- Custom behavior **conditions** and **effects**.
- Scoring configuration overrides.
- Simulation tier rules (`simulationConfig`).

**Key Steps**

1. Tie behavior permissions to capability APIs:
   - `behavior:extend_conditions` ⇒ allows plugin to register:
     - Custom condition evaluator IDs under its own namespace (`"plugin:<id>:...`).
   - `behavior:extend_effects` ⇒ allows plugin to register:
     - Custom activity effect types (`"effect:plugin:<id>:..."`).
2. Centralize registration:
   - Provide `BehaviorExtensionAPI` methods:
     - `register_condition_evaluator(id: str, fn: Callable)`.
     - `register_effect_handler(id: str, fn: Callable)`.
   - These methods enforce namespacing, check permissions, and record provenance (`plugin_id`).
3. Update Task 13 docs (or cross‑reference) to state:
   - “Plugins MUST register behavior extensions via `BehaviorExtensionAPI`; do not mutate global registries directly.”
4. Validate usage:
   - On plugin load, if a plugin tries to register behavior extensions without the correct permission, log and reject the registration.
5. Wire simulation tier rules:
   - Allow plugins to *influence* `simulationConfig` (e.g. by generating default config), but require explicit permissions (e.g. `behavior:configure_simulation`).

**Status:** ☐ Not started

---

## Phase 16.5 – Plugin Observability & Failure Isolation

**Goal**  
Make plugin behavior visible and ensure a faulty plugin cannot easily break the entire app or behavior system.

**Scope**

- Logging and metrics per plugin.
- Error handling around plugin hooks/handlers.

**Key Steps**

1. **Structured logging:**
   - Bind `plugin_id` (and optionally `plugin_kind`) into all logs emitted via `PluginContext.log`.
   - For route plugins, add middleware that tags requests with `plugin_id` when hitting plugin routes.
2. **Metrics:**
   - Track per‐plugin:
     - Request counts and latencies for plugin routes.
     - Error counts in custom condition/effect evaluators.
     - Time spent in plugin event handlers.
3. **Failure isolation:**
   - Wrap plugin hook/handler calls (conditions/effects/event handlers) in try/except:
     - On failure, log with `plugin_id` and continue with a safe fallback.
     - For behavior conditions: treat failing conditions as `False`.
     - For behavior effects: skip failed custom effect and continue others.
4. **Health reporting:**
   - Expose an admin endpoint or diagnostics view listing:
     - Loaded plugins, permissions, and whether they’ve recently caused errors.

**Status:** ☐ Not started

---

## Phase 16.6 – World/Workspace‑Scoped Plugin Enablement

**Goal**  
Allow plugins to be enabled/disabled on a per‑world (or per‑workspace) basis, not just globally.

**Scope**

- Configuration in `GameWorld.meta` (and optionally workspace config).
- Behavior on request handling and behavior execution.

**Key Steps**

1. Define world‑level plugin configuration (JSON only):

```ts
// In GameWorld.meta
behavior?: {
  // ...
  enabledPlugins?: string[];       // plugin IDs allowed to influence behavior in this world
}
```

2. During behavior execution:
   - When evaluating custom conditions/effects, check:
     - Global plugin enabled/disabled state (via PluginManager).
     - World’s `enabledPlugins` list.
   - Skip behavior extensions whose `plugin_id` is not enabled for this world.
3. For route plugins:
   - If routes are world‑specific (e.g. `/worlds/{world_id}/...`), check whether the plugin is enabled for that world and reject with 404/403 if not.
4. Optionally support workspace‑level scoping similarly (if workspaces are first‑class elsewhere in the system).

**Status:** ☐ Not started

---

## Phase 16.7 – Path to Out‑of‑Process / Sandboxed Plugins (Future)

**Goal**  
Define a realistic path from current trusted in‑process plugins to a future model where some plugins can run out‑of‑process or in a sandboxed runtime.

**Scope**

- Design outline only; no immediate implementation required.

**Key Ideas**

- Treat the current in‑process plugin API as the **“internal plugin”** model.
- Introduce a separate category of **“remote plugins”**:
  - `kind: "remote_feature"` or similar in `PluginManifest`.
  - Implemented as services reachable over HTTP/RPC/Webhooks, not imported Python modules.
- Remote plugins would:
  - Receive structured payloads (world/session/NPC context, limited to what’s needed).
  - Return decisions or annotations (e.g. “activity suggestions”, “extra effects”) that the core engine applies.
  - Have no direct DB access; only see what the core exposes via request payloads.

**Key Steps (design only)**

1. Define a minimal “remote plugin protocol”:
   - Request/response shapes for:
     - Behavior extensions (e.g. asking a remote plugin for additional candidate activities).
     - Event handling (fire‑and‑forget webhooks).
2. Decide on execution model:
   - Synchronous for latency‑sensitive things (with strict timeouts).
   - Asynchronous/event‑driven for non‑critical hooks.
3. Ensure the **capability model stays the same**:
   - Remote plugins get permissions and capabilities, but enforced by what the core sends them, not by giving them direct services.

**Status:** ☐ Not started

---

## Success Criteria

By the end of Task 16:

- **Permissions are enforced:**
  - `PluginManifest.permissions` directly controls which capability helpers a plugin receives.
  - Plugins cannot trivially grab arbitrary internal services or raw DB sessions.
- **Behavior/NPC extensions are gated:**
  - Custom conditions/effects/scoring must be registered through `BehaviorExtensionAPI`, with clear `plugin_id` provenance and permission checks.
- **Plugins are observable:**
  - Logs and metrics clearly show which plugin is responsible for what.
  - Misbehaving plugins can be identified and disabled without affecting the core.
- **Worlds can opt in/out:**
  - Worlds can enable only a subset of plugins for their behavior/schedule logic via JSON meta.
- **Future sandboxing is feasible:**
  - The capability and permission model is clean enough that moving some plugins out‑of‑process becomes an implementation detail, not a full redesign.

