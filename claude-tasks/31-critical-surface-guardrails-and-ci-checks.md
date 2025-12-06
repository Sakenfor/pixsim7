**Task: Critical Surface Guardrails & CI Checks (Plugins, WebSockets, Auth, Modules)**

> **For Agents (How to use this file)**
> - This task bundles **small but high-impact guardrails** to prevent subtle regressions in:
>   - Backend plugin/route registration
>   - WebSocket messaging contracts
>   - Frontend auth/redirect handling
>   - Frontend module initialization / hot-reload
> - Use it when you:
>   - Add or change route plugins or WebSocket endpoints.
>   - Touch auth/401 handling or login redirects.
>   - Introduce new frontend “modules” with initialization logic.
> - Read these first for context:
>   - `ARCHITECTURE.md` – overall system structure and services
>   - `docs/EXTENSION_ARCHITECTURE.md` – extension/plugin surfaces (backend, frontend, graph, game JSON)
>   - `docs/APP_MAP.md` – app map and critical routes
>   - `docs/archive/architecture/docs/archive/architecture/MERGE_MIDDLEWARE_PLUGIN_ARCHITECTURE.md` – backend plugin auto-discovery
>   - `docs/PLUGIN_SYSTEM_ARCHITECTURE.md` – frontend plugin system

---

## Context

Recent commits highlighted a few recurring classes of issues:

- Route plugins that failed to load due to signature/import issues, leading to **404s on critical endpoints** (e.g. logs, WebSockets).
- WebSocket handlers that assumed **all messages were JSON**, causing parsing errors on simple `pong` keep-alives.
- Frontend 401 handling that triggered **multiple redirects to `/login`**, producing a “login flash” effect.
- Module initialization code that ran multiple times under hot reload, causing **duplicate registrations** and noisy warnings.

These are all “edge of the system” problems that are easy to miss in local testing but painful in practice. The goal of this task is to add **lightweight guardrails and checks** so similar mistakes are caught early in dev/CI.

---

## Phase Checklist

- [X] **Phase 31.1 – Backend Plugin & Route Health Checks** ✅ Complete (Already Implemented)
- [X] **Phase 31.2 – WebSocket Contract & Keep-Alive Tests** ✅ Complete (Already Implemented)
- [X] **Phase 31.3 – Auth Redirect & 401 Handling Guardrails** ✅ Complete (Already Implemented)
- [X] **Phase 31.4 – Module Lifecycle & Hot-Reload Helpers** ✅ Complete (Already Implemented)

---

## Phase 31.1 – Backend Plugin & Route Health Checks

**Goal**  
Ensure critical plugins (logs, WebSocket, game APIs) are loaded correctly and their routes are reachable, with fast failures in dev/CI.

**Scope**

- Backend plugin manager and route manifests:
  - `pixsim7/backend/main/routes/*/manifest.py`
  - `pixsim7/backend/main/infrastructure/plugins/*`
- Critical endpoints:
  - `api/v1/logs/*`
  - `api/v1/ws/*`
  - Other route plugins marked as "required"

**Key Steps**

1. **Startup plugin health log**  
   - Extend the plugin manager to log a concise table of loaded route/domain plugins (id, kind, enabled, status).
   - Distinguish between “optional” and “required” plugins.
2. **Fail-fast behavior for required plugins (dev/CI mode)**  
   - In development/CI, if a required route plugin fails to load (import error, dependency failure, bad signature), fail startup with a clear error instead of silently skipping it.
3. **Orphan router detection script**
   - Add a small script under `scripts/` (or a pytest) that:
     - Scans `pixsim7/backend/main/api/v1/*.py` for `router` instances.
     - Verifies there is a corresponding `pixsim7/backend/main/routes/<feature>/manifest.py` for each "public" router, or explicitly whitelists internal-only routers.
4. **Minimal plugin smoke tests**
   - Add a small test module that:
     - Starts the app (or imports the application factory).
     - Verifies that `POST /api/v1/logs/ingest` and `GET /api/v1/ws/generations` respond correctly (no 404, no import errors).

**Status:** `[X]` ✅ Complete (Already Implemented)

**Implementation Details:**
- ✅ `print_health_table()` in plugin manager (pixsim7/backend/main/infrastructure/plugins/manager.py:343-408)
- ✅ `check_required_plugins()` with fail-fast support (manager.py:410-442)
- ✅ Called from `init_plugin_manager()` with `fail_fast=settings.debug` (main.py:99-112)
- ✅ Orphan router detection script (scripts/check_orphan_routers.py) - working, found 9 orphans
- ✅ Plugin smoke tests (tests/test_plugin_smoke.py) - comprehensive endpoint + manager tests

---

## Phase 31.2 – WebSocket Contract & Keep-Alive Tests

**Goal**  
Make WebSocket message handling robust to keep-alive frames (`ping`/`pong`) and enforce explicit message envelopes for JSON traffic.

**Scope**

- WebSocket server endpoints:
  - `pixsim7/backend/main/api/v1/websocket.py` (or equivalent)
- Frontend WebSocket hooks:
  - `apps/main/src/hooks/useGenerationWebSocket.ts`
  - Any other hooks that parse WebSocket messages

**Key Steps**

1. **Define a message envelope type**  
   - On the frontend (and optionally backend), define a simple message shape, e.g. `{ type: string; payload?: unknown }`.
   - Treat plain text `ping`/`pong` as a separate path, bypassing JSON parsing.
2. **Update WebSocket handlers to branch early**  
   - Ensure hooks check for `event.data === 'pong'` (and similar keep-alive payloads) **before** `JSON.parse`.
   - Optionally, assert that JSON messages always have a `type` field; log and ignore otherwise.
3. **Contract tests**
   - Add a test (backend or integration) that:
     - Connects to `/api/v1/ws/generations`.
     - Sends a ping and asserts a `pong` is handled without errors.
   - Add a frontend test that:
     - Mocks `ws.onmessage` with a sequence of `pong` and JSON messages.
     - Asserts no exceptions are thrown and JSON messages are handled as expected.

**Status:** `[X]` ✅ Complete (Already Implemented)

**Implementation Details:**
- ✅ Backend message envelope types (infrastructure/websocket/types.py)
- ✅ `is_keep_alive()` helper for ping/pong detection
- ✅ WebSocket handlers branch before JSON parsing (api/v1/websocket.py:64-68)
- ✅ Frontend message types (apps/main/src/types/websocket.ts)
- ✅ `parseWebSocketMessage()` returns null for ping/pong (websocket.ts:80-102)
- ✅ Hook properly skips keep-alive messages (hooks/useGenerationWebSocket.ts:48-54)
- ✅ Comprehensive contract tests (tests/test_websocket_contract.py)

---

## Phase 31.3 – Auth Redirect & 401 Handling Guardrails

**Goal**  
Prevent “redirect storms” and white-screen flashes by centralizing 401 handling and adding regression coverage.

**Scope**

- Frontend API client and auth logic:
  - `apps/main/src/lib/api/client.ts`
- Routes/components involved in login flow:
  - `apps/main/src/routes/Login.tsx` (or equivalent)

**Key Steps**

1. **Single-source 401 redirect logic**  
   - Confirm all 401 → `/login` behavior is centralized in the API client interceptor, with a guard such as `ApiClient.isRedirecting`.
   - Avoid per-feature 401 handlers that also call `window.location.href = '/login'`.
2. **Invariant: at most one redirect in flight**  
   - Document the invariant in the client module (e.g. small JSDoc comment): only one redirect is allowed at a time, and never while already on `/login`.
3. **Regression test for login flash**
   - Add a frontend test that:
     - Mocks multiple parallel 401 responses.
     - Asserts that `window.location.href` is updated to `/login` only once and no further redirects are triggered when `pathname` already starts with `/login`.

**Status:** `[X]` ✅ Complete (Already Implemented)

**Implementation Details:**
- ✅ Centralized 401 redirect in API client interceptor (apps/main/src/lib/api/client.ts:73-87)
- ✅ `isRedirecting` static guard prevents multiple redirects (client.ts:40)
- ✅ Check for already being on `/login` page (client.ts:78)
- ✅ Comprehensive JSDoc documenting invariants (client.ts:19-30, 62-72)
- ✅ Full test coverage for parallel 401s (apps/main/src/lib/api/__tests__/client.test.ts)
  - Single 401 redirect test
  - Multiple parallel 401s (only one redirect)
  - No redirect when already on /login
  - Sequential 401s with persistent flag

---

## Phase 31.4 – Module Lifecycle & Hot-Reload Helpers

**Goal**  
Standardize how frontend “modules” (e.g. game session module) handle initialization so hot-reload doesn’t cause double registration.

**Scope**

- Frontend module system:
  - `apps/main/src/modules/*` (including `game-session`)

**Key Steps**

1. **Define a module initialization helper**  
   - Introduce a small helper (e.g. `createModuleInitializer(name, initFn)`) that:
     - Tracks initialization per module key.
     - Ensures `initFn` runs at most once per page load, even under hot reload.
2. **Refactor existing modules to use the helper**  
   - Migrate `game-session` and any other modules that manually guard initialization (`helpersRegistered` flags) to use the helper for consistency.
3. **Dev-only warnings for bad patterns**  
   - In development builds, optionally:
     - Warn if a module calls `initialize()` without going through the helper.
     - Warn if a module tries to register duplicate handlers without a guard.
4. **Doc update**
   - Add a short "Module lifecycle" subsection to:
     - `docs/APP_MAP.md` (or a relevant frontend doc), briefly describing the pattern.
     - Mention that all modules should be idempotent under hot reload via the helper.

**Status:** `[X]` ✅ Complete (Already Implemented)

**Implementation Details:**
- ✅ Module lifecycle helpers (apps/main/src/modules/lifecycle.ts)
- ✅ `createModuleInitializer()` - idempotent initialization wrapper
- ✅ `isModuleInitialized()` - check initialization state
- ✅ `warnUnguardedInit()` - dev-only warnings for bad patterns
- ✅ `createModuleCleanup()` - idempotent cleanup wrapper
- ✅ Game session module migrated (modules/game-session/index.ts:24-28)
- ✅ Documentation in APP_MAP.md (docs/APP_MAP.md:385, 410-446)
  - Module best practices section
  - Hot-reload safety guidelines
  - Code examples

