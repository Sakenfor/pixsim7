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
>
> **Doc references:**
> - `docs/MERGE_MIDDLEWARE_PLUGIN_ARCHITECTURE.md` – backend route/domain plugin auto-discovery and manifest patterns
> - `ARCHITECTURE.md` – how backend plugins fit into the overall system
> - `docs/EXTENSION_ARCHITECTURE.md` – unified extension/plugin map (once implemented by Task 29)

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

**Status:** ✅ Completed

### Inventory Results

#### Plugin Categories

| Plugin Type | Entrypoint Module | Manifest Type | Current Capabilities | Intended Use | Notes |
|-------------|-------------------|---------------|---------------------|--------------|-------|
| **Route Plugins** | `pixsim7_backend/routes/{plugin}/manifest.py` | `PluginManifest` | - Full DB access via `Depends(get_db)`<br>- Full Redis access via `Depends(get_redis_client)`<br>- Direct import of services, models, utilities<br>- FastAPI router registration<br>- Access to all internal modules | Add core API endpoints for game/business logic | Used for primary API routes (auth, generations, game_worlds, game_behavior, etc.). Currently ~25+ route plugins. |
| **Feature Plugins** | `pixsim7_backend/plugins/{plugin}/manifest.py` | `PluginManifest` | - Full DB access via `Depends(get_db)`<br>- Full Redis access<br>- Direct import of domain models (`GameSession`, etc.)<br>- FastAPI router registration<br>- Can mutate session flags, relationships directly<br>- Access to all internal services | Add optional gameplay mechanics (stealth, romance, dialogue, NPCs) | Examples: `game_stealth`, `game_romance`, `game_dialogue`, `game_npcs`. Can directly query/mutate DB and session state. Currently ~4 feature plugins. |
| **Event Handler Plugins** | `pixsim7_backend/event_handlers/{plugin}/manifest.py` | Custom `EventHandlerManifest` | - Subscribe to event patterns (`"*"` or specific types)<br>- Receive `Event` objects from event bus<br>- Can make arbitrary HTTP calls (webhooks)<br>- Can track metrics in-memory<br>- No enforced sandboxing | React to domain events (metrics, webhooks, analytics, notifications) | Examples: `metrics` (tracks event counts), `webhooks` (HTTP dispatching), `auto_retry` (retry logic). Subscribe via `event_bus.subscribe()`. Currently ~3 event handlers. |
| **Middleware Plugins** | `pixsim7_backend/middleware/{plugin}/manifest.py` | `MiddlewareManifest` | - Full HTTP request/response access<br>- Can wrap all requests via `BaseHTTPMiddleware`<br>- Priority-based ordering<br>- Environment filtering<br>- Access to app instance | Wrap HTTP requests/responses for logging, auth, rate limiting, CORS | Uses Starlette middleware pattern. Registered in reverse priority order (LIFO). Can inject headers, modify responses, etc. |
| **Behavior Extensions** (Planned) | TBD - registries in behavior system | TBD | - Custom condition evaluators (for activity selection)<br>- Custom effect handlers (for activity outcomes)<br>- Simulation tier configuration<br>- Scoring logic overrides | Extend NPC behavior system with custom conditions/effects | **Not yet implemented.** Planned for Task 13 (NPC behavior system). Would allow plugins to register custom evaluators/effects for activity graphs. |

#### What Plugins Can Currently Access

**All plugin types currently have unrestricted access to:**

- **Database:** Full async DB sessions via `get_db()` or `get_async_session()`
- **Redis:** Full Redis client access via `get_redis()` or `get_redis_client()`
- **Services:** Can import and instantiate any service:
  - `GenerationService` - submit generations
  - `ProviderService` - access AI providers
  - Session/world CRUD services
- **Domain Models:** Full import and mutation of:
  - `GameSession`, `GameWorld`, `GameNPC`, `GameScene`, etc.
  - Can directly modify `session.flags`, `session.relationships`
- **Internal Utilities:**
  - `pixsim_logging` - structured logging
  - Event bus - emit/subscribe to events
  - Settings - read app configuration
- **External Services:**
  - HTTP clients (`httpx`) - make arbitrary outbound requests
  - File system - read/write files (no restrictions)
  - Environment variables

**Permission Model:**
- `PluginManifest.permissions` exists as a list of strings but is **not enforced**
- `requires_db` and `requires_redis` are metadata only - plugins can access these regardless
- No runtime checks or capability-based access control
- Plugins execute in-process with full Python capabilities

#### Current Plugin Loading & Lifecycle

**Discovery & Registration:**
1. `PluginManager.discover_plugins()` scans directories for `manifest.py` files
2. Plugins loaded via dynamic `importlib` module loading
3. Registered with FastAPI via `app.include_router()` (for route/feature plugins)
4. Event handlers subscribe via `event_bus.subscribe(pattern, handler)`
5. Middleware added via `app.add_middleware()` in priority order

**Lifecycle Hooks (Optional):**
- `on_load(app)` - called when plugin module loaded (before app starts)
- `on_enable()` - called after app startup
- `on_disable()` - called before app shutdown

**Dependency Resolution:**
- Topological sort based on `manifest.dependencies`
- Plugins loaded in dependency order
- Circular dependencies detected and rejected

**Configuration:**
- Global enable/disable via `manifest.enabled`
- Allowlist/denylist via `settings.plugin_allowlist` / `settings.plugin_denylist`
- No per-world or per-session scoping

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

**Status:** ✅ Completed

### Implementation Summary

**Files Created:**
- `pixsim7_backend/infrastructure/plugins/permissions.py` - Complete permission system

**Permissions Defined:**

1. **World Access:** `world:read`
2. **Session Access:** `session:read`, `session:write`
3. **NPC Access:** `npc:read`, `npc:write`
4. **Behavior Extensions:** `behavior:extend_conditions`, `behavior:extend_effects`, `behavior:configure_simulation`
5. **Generation:** `generation:submit`, `generation:read`
6. **Logging:** `log:emit`
7. **Events:** `event:subscribe`, `event:emit`
8. **Admin:** `admin:routes`
9. **Database:** `db:read`, `db:write` (discouraged, use session/npc APIs instead)
10. **Redis:** `redis:read`, `redis:write`

**Permission Groups:**
- `group:readonly` - Read-only access (world, session, NPC) + logging
- `group:gameplay` - Full session/NPC read/write + logging
- `group:behavior` - Behavior extensions + read access
- `group:event_handler` - Event subscription + logging
- `group:generation` - Generation submit/read + world/session read
- `group:admin` - Admin routes + read access

**Failure Modes:**
- `PermissionDeniedBehavior.RAISE` - Raise exception (for critical operations)
- `PermissionDeniedBehavior.WARN` - Log warning and return None (for optional features)
- `PermissionDeniedBehavior.SILENT` - Silent fail (for capability checks)

**Validation:**
- Permission validation integrated into `PluginManager.load_plugin()`
- Unknown permissions logged as warnings but don't block plugin loading (allow_unknown=True)
- Permission groups automatically expanded to individual permissions
- Dangerous permissions (db:write, admin:routes) trigger warnings

**Updated Files:**
- `pixsim7_backend/infrastructure/plugins/types.py` - Added detailed permission documentation to `PluginManifest.permissions`
- `pixsim7_backend/infrastructure/plugins/manager.py` - Added permission validation during plugin load

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

4. For event handlers, pass `PluginContext` (or a subset) into callback signatures so they don't need raw DB/services.

**Status:** ✅ Completed

### Implementation Summary

**Files Created:**
- `pixsim7_backend/infrastructure/plugins/context.py` (~650 lines) - PluginContext and capability APIs
- `pixsim7_backend/infrastructure/plugins/dependencies.py` (~120 lines) - FastAPI dependency injection
- `pixsim7_backend/plugins/example_plugin_context/manifest.py` - Example plugin demonstrating new pattern

**Capability APIs Implemented:**

1. **WorldReadAPI** - Read-only world access
   - `get_world(world_id)` - Get world metadata
   - `get_world_config(world_id, key)` - Get specific config value
   - `list_world_locations(world_id)` - List all locations
   - `list_world_npcs(world_id)` - List all NPCs

2. **SessionReadAPI** - Read-only session access
   - `get_session(session_id)` - Get session state
   - `get_session_flag(session_id, flag_key)` - Get specific flag
   - `get_relationship(session_id, npc_key)` - Get relationship state

3. **SessionMutationsAPI** - Write access to session
   - `set_session_flag(session_id, flag_key, value)` - Set flag (auto-namespaced)
   - `update_relationship(session_id, npc_key, updates)` - Update relationship

4. **BehaviorExtensionAPI** - Register behavior extensions
   - `register_condition_evaluator(name, evaluator)` - Register custom condition
   - `register_effect_handler(name, handler)` - Register custom effect

5. **LoggingAPI** - Structured logging
   - `info(message, **kwargs)` - Log info (auto-tagged with plugin_id)
   - `warning(message, **kwargs)` - Log warning
   - `error(message, **kwargs)` - Log error
   - `debug(message, **kwargs)` - Log debug

**PluginContext Features:**
- Permission-aware access to all capability APIs
- Automatic permission checking before capability access
- Three failure modes: `RAISE` (exception), `WARN` (log + return None), `SILENT` (return None)
- Automatic namespacing for plugin data (flags, conditions, effects)
- Provenance tracking (all mutations logged with plugin_id)
- Plugin introspection (`has_permission()`, `require_permission()`)

**Dependency Injection:**
- `get_plugin_context(plugin_id)` - FastAPI dependency factory
- Automatically injects DB/Redis based on manifest requirements
- Plugin manager registered globally for dependency resolution
- Clean separation from direct DB/service access

**Migration Path:**

Old (unrestricted):
```python
@router.get("/endpoint")
async def endpoint(db: Session = Depends(get_db)):
    session = db.query(GameSession).filter(...).first()
    session.flags["my_key"] = "value"
    db.commit()
```

New (permission-aware):
```python
@router.get("/endpoint")
async def endpoint(ctx: PluginContext = Depends(get_plugin_context("my_plugin"))):
    await ctx.session_write.set_session_flag(session_id, "my_key", "value")
    ctx.log.info("Flag set")
```

**Updated Files:**
- `pixsim7_backend/infrastructure/plugins/__init__.py` - Export new classes
- `pixsim7_backend/main.py` - Register plugin manager for DI

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

**Status:** ✅ Completed

### Implementation Summary

**Files Created:**
- `pixsim7_backend/infrastructure/plugins/behavior_registry.py` (~550 lines) - Global behavior extension registry
- `pixsim7_backend/plugins/example_behavior_extension/manifest.py` - Example plugin with behavior extensions

**Behavior Extension Registry:**

**Core Components:**
- **BehaviorExtensionRegistry** - Thread-safe global registry for behavior extensions
  - Condition registry: `condition_id -> ConditionMetadata`
  - Effect registry: `effect_id -> EffectMetadata`
  - Simulation config registry: `provider_id -> SimulationConfigProvider`
  - Lock mechanism to prevent runtime registration after startup

**Metadata Classes:**
- **ConditionMetadata** - Stores condition ID, plugin ID, evaluator function, description, required context
- **EffectMetadata** - Stores effect ID, plugin ID, handler function, description, default params
- **SimulationConfigProvider** - Stores provider ID, plugin ID, config function, priority

**Helper Functions for Behavior System (Task 13):**
- `evaluate_condition(condition_id, context, world_enabled_plugins)` - Evaluate registered condition
  - Permission-checked (filters by world-enabled plugins)
  - Error-isolated (failed conditions return False)
  - Context validation (checks required_context keys)
- `apply_effect(effect_id, context, params, world_enabled_plugins)` - Apply registered effect
  - Permission-checked (filters by world-enabled plugins)
  - Error-isolated (failed effects return None)
  - Parameter merging (merges with default_params)
- `build_simulation_config(base_config)` - Build config by merging provider outputs
  - Priority-ordered (lower priority = earlier application)
  - Error-isolated (failed providers skipped)

**BehaviorExtensionAPI Updates:**
- `register_condition_evaluator()` - Now uses global registry
  - Auto-namespaces: `plugin:<plugin_id>:<name>`
  - Requires `behavior:extend_conditions` permission
  - Validates and registers in global registry
- `register_effect_handler()` - Now uses global registry
  - Auto-namespaces: `effect:plugin:<plugin_id>:<name>`
  - Requires `behavior:extend_effects` permission
  - Supports default_params
- `register_simulation_config()` - NEW method
  - Auto-namespaces: `plugin:<plugin_id>:<name>`
  - Requires `behavior:configure_simulation` permission
  - Priority-based merging (lower = higher priority)

**Integration:**
- Updated `main.py` to lock registry after plugin loading
  - Registry locked = no more runtime registrations
  - Logs statistics (conditions, effects, simulation configs)
- Updated `__init__.py` to export behavior registry functions
  - Task 13 implementation will import these helpers

**Example Plugin:**
Created `example_behavior_extension` demonstrating:
- Custom conditions: `has_high_intimacy`, `is_player_disguised`
- Custom effects: `mood_boost`, `relationship_impact`
- Simulation config: `performance` (optimized settings)
- Proper registration in `on_load` hook
- Permission declarations in manifest

**Key Features:**
- ✅ Permission-gated registration (via BehaviorExtensionAPI)
- ✅ Automatic namespacing (prevents ID conflicts)
- ✅ Provenance tracking (all extensions tagged with plugin_id)
- ✅ World-scoped filtering (plugins can be enabled per-world)
- ✅ Error isolation (failed extensions don't crash behavior system)
- ✅ Registry locking (prevents runtime tampering)

**Integration with Task 13:**
When Task 13 (NPC behavior system) is implemented, it will:
1. Import `evaluate_condition()` and `apply_effect()` from plugins module
2. Query registry for available conditions/effects
3. Filter by world-enabled plugins
4. Execute with error isolation
5. Merge simulation configs at startup

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
