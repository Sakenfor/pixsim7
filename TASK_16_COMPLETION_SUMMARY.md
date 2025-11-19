# Task 16: Backend Plugin Capabilities & Sandboxing - COMPLETE ✅

## Summary

Successfully implemented a comprehensive permission-aware plugin system that:
- ✅ Replaces unrestricted DB/service access with narrow capability APIs
- ✅ Enforces permissions at runtime with three failure modes
- ✅ Auto-namespaces plugin data for isolation
- ✅ Tracks provenance for all plugin actions
- ✅ Provides complete observability (metrics, health monitoring, diagnostics)
- ✅ Supports per-world plugin enablement
- ✅ Lays foundation for future sandboxed/out-of-process plugins

---

## Phase 16.5 - Plugin Observability & Failure Isolation ✅

**Status:** COMPLETE

### Files Created
- `observability.py` (~400 lines) - Metrics tracking and health monitoring
- `admin_plugins.py` (~200 lines) - Admin diagnostics API
- `routes/admin_plugins/` - Admin route registration

### Implementation

**Metrics Tracking:**
- PluginMetrics: Per-plugin metrics (requests, errors, latencies, health)
- PluginMetricsTracker: Global metrics collection and aggregation
- RequestTimer: Context manager for request timing
- Automatic health monitoring based on error rates

**Admin Endpoints:**
- GET `/admin/plugins/list` - List all plugins
- GET `/admin/plugins/metrics` - Get all plugin metrics
- GET `/admin/plugins/metrics/{plugin_id}` - Get specific plugin metrics
- GET `/admin/plugins/health` - Health status for all plugins
- GET `/admin/plugins/behavior-extensions` - List registered extensions
- GET `/admin/plugins/{plugin_id}/details` - Detailed plugin info
- POST `/admin/plugins/metrics/reset` - Reset metrics

**Integration:**
- Metrics automatically tracked in behavior_registry (conditions/effects)
- Health status auto-calculated (unhealthy if error rates exceed thresholds)
- Admin diagnostics configured in main.py

---

## Phase 16.6 - World/Workspace-Scoped Plugin Enablement ✅

**Status:** COMPLETE

### Files Created
- `world_scoping.py` (~150 lines) - World-scoped plugin configuration

### Implementation

**Helper Functions:**
- `get_enabled_plugins_for_world(world_meta)` - Get enabled plugin list
- `is_plugin_enabled_for_world(plugin_id, world_meta)` - Check if plugin enabled
- `set_enabled_plugins_for_world(world_meta, plugin_ids)` - Set enabled plugins
- `add_enabled_plugin_for_world(world_meta, plugin_id)` - Enable a plugin
- `remove_enabled_plugin_for_world(world_meta, plugin_id)` - Disable a plugin

**World Configuration Schema:**
```json
{
  "behavior": {
    "enabledPlugins": ["game-stealth", "game-romance"],
    "simulationConfig": {...}
  }
}
```

**Behavior:**
- No config = all plugins enabled (default)
- Empty array = no plugins enabled
- Explicit list = only those plugins enabled

**Integration:**
- Already supported in behavior_registry helpers
- `evaluate_condition()` and `apply_effect()` filter by `world_enabled_plugins`
- Exported from plugins module for use in Task 13

---

## Phase 16.7 - Design Path to Out-of-Process Plugins ✅

**Status:** COMPLETE (Design Only)

### Design Overview

**Current State:**
- In-process plugins execute as Python modules within the app
- Full access to capability APIs via PluginContext
- Permission-checked at capability level

**Future Remote Plugin Model:**

**1. Plugin Categories:**
- **Internal Plugins** (current): In-process, trusted, full capability API access
- **Remote Plugins** (future): Out-of-process, HTTP/RPC/WebSocket communication

**2. Remote Plugin Protocol:**

```typescript
// Remote plugin manifest
{
  "kind": "remote_feature",
  "id": "remote-analytics",
  "endpoint": "https://plugin-service.example.com",
  "permissions": ["session:read", "world:read"],
  "protocol": "http" | "websocket" | "grpc"
}

// Request to remote plugin (behavior condition)
POST /evaluate-condition
{
  "condition_id": "can_access_area",
  "context": {
    "npc_id": 123,
    "location_id": 456,
    "session_state": {...}  // Only what permission allows
  },
  "timeout_ms": 100
}

// Response from remote plugin
{
  "result": true,
  "metadata": {...}
}
```

**3. Security Model:**
- Remote plugins receive **filtered context** (only what permissions allow)
- No direct DB/Redis access
- Strict timeouts (synchronous calls)
- Rate limiting per remote plugin
- Request/response validation (Pydantic schemas)

**4. Execution Models:**

**Synchronous (latency-sensitive):**
- Behavior conditions (must return quickly)
- Strict timeouts (100-500ms)
- Fallback on timeout (condition = False)

**Asynchronous (non-critical):**
- Event handlers (fire-and-forget webhooks)
- Analytics/metrics collection
- Background processing

**5. Implementation Path:**

**Step 1: Add Remote Plugin Support to PluginManager**
```python
class RemotePluginManifest(PluginManifest):
    kind: Literal["remote_feature"] = "remote_feature"
    endpoint: str
    protocol: Literal["http", "websocket", "grpc"]
    timeout_ms: int = 500
```

**Step 2: Create Remote Capability Adapters**
```python
class RemoteBehaviorExtensionAPI:
    """
    Adapter that translates local capability calls to remote requests.
    """
    async def evaluate_condition(self, condition_id, context):
        # Filter context based on permissions
        filtered_context = self._filter_context(context, self.permissions)

        # Call remote endpoint
        response = await httpx.post(
            f"{self.endpoint}/evaluate-condition",
            json={"condition_id": condition_id, "context": filtered_context},
            timeout=self.timeout_ms / 1000
        )

        return response.json()["result"]
```

**Step 3: Update BehaviorExtensionRegistry**
- Support both local and remote extension types
- Route calls to appropriate handler (in-process vs HTTP)
- Track metrics separately for remote plugins

**6. Benefits of Current Design:**
- ✅ Capability APIs are already clean interfaces (easy to serialize)
- ✅ Permission model applies equally to local/remote
- ✅ Context filtering already happens (just need to serialize)
- ✅ Namespacing prevents conflicts
- ✅ Provenance tracking ready for remote plugins
- ✅ Metrics/observability infrastructure in place

**7. Trade-offs:**

**Remote Plugins:**
- (+) True sandboxing (process isolation)
- (+) Language-agnostic (Python, JS, Go, Rust)
- (+) Scalable (can run on separate infrastructure)
- (+) Security (no direct system access)
- (-) Latency (network overhead)
- (-) Complexity (service discovery, monitoring, deployment)
- (-) Reliability (network failures, timeouts)

**In-Process Plugins:**
- (+) Low latency
- (+) Simple deployment
- (+) Easy debugging
- (-) Security (same process)
- (-) Language-locked (Python only)

**8. Recommendation:**
- **Internal/trusted plugins**: Keep in-process (low latency, trusted code)
- **Community/untrusted plugins**: Use remote model when needed
- **Hybrid approach**: Support both models with same capability API

---

## Success Criteria - ALL MET ✅

- ✅ **Permissions are enforced:** Capability APIs check permissions, no raw DB access
- ✅ **Behavior extensions are gated:** BehaviorExtensionAPI enforces permissions and namespacing
- ✅ **Plugins are observable:** Comprehensive metrics, health monitoring, admin diagnostics
- ✅ **Worlds can opt in/out:** Per-world plugin configuration via `world.meta.behavior.enabledPlugins`
- ✅ **Future sandboxing is feasible:** Clean capability APIs ready for remote plugin adaptation

---

## Files Created (Total)

**Phase 16.1:**
- Task documentation updates

**Phase 16.2:**
- `permissions.py` (~500 lines) - Permission system

**Phase 16.3:**
- `context.py` (~650 lines) - PluginContext & capability APIs
- `dependencies.py` (~120 lines) - FastAPI dependency injection
- `plugins/example_plugin_context/` - Example plugin

**Phase 16.4:**
- `behavior_registry.py` (~550 lines) - Behavior extension registry
- `plugins/example_behavior_extension/` - Example behavior plugin

**Phase 16.5:**
- `observability.py` (~400 lines) - Metrics & health monitoring
- `api/v1/admin_plugins.py` (~200 lines) - Admin diagnostics API
- `routes/admin_plugins/` - Admin route

**Phase 16.6:**
- `world_scoping.py` (~150 lines) - World-scoped configuration

**Phase 16.7:**
- Design documentation (this file)

**Total:** ~2,500 lines of production code + comprehensive documentation

---

## Integration Points for Future Tasks

**Task 13 (NPC Behavior System):**
```python
from pixsim7_backend.infrastructure.plugins import (
    evaluate_condition,
    apply_effect,
    build_simulation_config,
    get_enabled_plugins_for_world,
)

# When evaluating activities
world = await db.get(GameWorld, world_id)
enabled_plugins = get_enabled_plugins_for_world(world.meta)

# Evaluate custom conditions
can_do = await evaluate_condition(
    "plugin:game-stealth:has_disguise",
    context,
    world_enabled_plugins=enabled_plugins
)

# Apply custom effects
result = await apply_effect(
    "effect:plugin:game-romance:arousal_boost",
    context,
    params={"amount": 0.2},
    world_enabled_plugins=enabled_plugins
)

# Build simulation config
config = build_simulation_config(base_config=world.meta.get("behavior", {}))
```

**Existing Plugins Migration:**
Current plugins (game_stealth, game_romance, etc.) can be gradually migrated to use PluginContext:
- Update permissions in manifest
- Replace `Depends(get_db)` with `Depends(get_plugin_context("plugin-id"))`
- Use capability APIs instead of raw DB queries
- Benefits: better observability, permission enforcement, provenance tracking

---

## Next Steps

1. **Migrate existing plugins** (optional but recommended):
   - Update game_stealth, game_romance to use PluginContext
   - Add proper permissions to manifests
   - Use capability APIs for cleaner separation

2. **Task 13 integration**:
   - Use behavior registry helpers in NPC behavior system
   - Implement world-scoped plugin filtering
   - Merge simulation configs from plugins

3. **Monitoring setup**:
   - Set up alerts for unhealthy plugins
   - Dashboard for plugin metrics
   - Regular health checks

4. **Future enhancements** (if needed):
   - Implement remote plugin support (Phase 16.7 design)
   - Add more capability APIs (generation, events, admin)
   - Plugin versioning and dependencies

---

**Task 16 Status: COMPLETE ✅**

All 7 phases successfully implemented with comprehensive functionality, documentation, and future-proofing for sandboxed plugins.
