# Recent System Changes - January 2025

**Last Updated**: 2025-01-21
**Status**: Active Development

---

> **📝 STAGING DOCUMENT**
>
> This file is a **staging log** for recent changes. Once changes settle and are
> validated, they must be reflected in the canonical documentation:
>
> - **Architecture:** `ARCHITECTURE.md`
> - **Development:** `DEVELOPMENT_GUIDE.md`
> - **Application Map:** `docs/APP_MAP.md`
> - **Services:** `docs/backend/SERVICES.md`
> - **Components:** `docs/frontend/COMPONENTS.md`
> - **Major Decisions:** `docs/decisions/*.md` (ADRs)
>
> See `DOCUMENTATION_CHANGELOG.md` for the full documentation lifecycle.

---

## Overview

This document tracks recent architectural changes and fixes applied to the PixSim7 system.

---

## 1. Admin App Migration to Main App

**Date**: 2025-01-XX (commit d25894c)
**Impact**: High - UI structure consolidation

### Changes
- Moved all admin app files from `apps/admin/` to `apps/main/`
- Consolidated two separate frontends into a single unified application
- Maintained all admin functionality within the main application structure

### Benefits
- Simpler project structure (one frontend instead of two)
- Shared components and state management
- Easier development and deployment

### Migration Path
```
apps/admin/  →  apps/main/
  ├── src/components/        →  src/components/
  ├── src/lib/               →  src/lib/
  └── package.json           →  package.json (merged)
```

---

## 2. Backend Route Plugin System Enhancements

**Date**: 2025-01-21
**Impact**: Medium - Backend API reliability

### 2.1 WebSocket Route Plugin Creation

**Problem**: WebSocket endpoint `/api/v1/ws/generations` returned 404
**Root Cause**: WebSocket router existed (`api/v1/websocket.py`) but wasn't registered as a route plugin

**Solution**: Created route plugin manifest

**Files Created**:
- `pixsim7/backend/main/routes/websocket/__init__.py`
- `pixsim7/backend/main/routes/websocket/manifest.py`

**Manifest**:
```python
manifest = PluginManifest(
    id="websocket",
    name="WebSocket API",
    version="1.0.0",
    description="WebSocket endpoints for real-time updates (generations, events)",
    kind="route",
    prefix="/api/v1",
    tags=["websocket", "realtime"],
    dependencies=["auth"],
    enabled=True,
)
```

**Endpoints Now Available**:
- `ws://localhost:8000/api/v1/ws/generations` - Real-time generation updates
- `ws://localhost:8000/api/v1/ws/events` - General event stream

---

### 2.2 Logs Route Plugin Fixes

**Problem**: Logs endpoint `/api/v1/logs/ingest` returned 404
**Root Cause**: Multiple syntax errors prevented the logs route plugin from loading

**Issues Fixed**:
1. **FastAPI Dependency Syntax Error**
   - `admin: CurrentAdminUser = Depends()` conflicted with `Annotated[User, Depends(...)]`
   - Solution: Changed to explicit `admin: User = Depends(get_current_admin_user)`

2. **Python Parameter Ordering**
   - Parameters without defaults cannot follow parameters with defaults
   - Solution: Moved dependency parameters (`admin`, `db`) to start of function signatures

**Files Modified**:
- `pixsim7/backend/main/api/v1/logs.py` - Fixed all endpoint signatures
- `pixsim7/backend/main/routes/logs/manifest.py` - Already existed, no changes needed

**Endpoints Now Working**:
- `POST /api/v1/logs/ingest` - Single log entry ingestion
- `POST /api/v1/logs/ingest/batch` - Batch log ingestion
- `GET /api/v1/logs/query` - Query logs with filters
- `GET /api/v1/logs/trace/job/{job_id}` - Get job trace
- Additional endpoints for log analysis

---

## 3. Frontend Auth & WebSocket Improvements

**Date**: 2025-01-21
**Impact**: High - User experience reliability

### 3.1 Login Flash Loop Fix

**Problem**: Multiple 401 responses caused repeated redirects to `/login`, creating white screen flashing
**Root Cause**: Multiple parallel API requests all triggered `window.location.href = '/login'` independently

**Solution**: Added redirect guard in API client

**File**: `apps/main/src/lib/api/client.ts`

**Changes**:
```typescript
class ApiClient {
  private static isRedirecting = false;

  // In response interceptor:
  if (error.response?.status === 401) {
    // Redirect once (prevent flash loops from parallel requests)
    if (!window.location.pathname.startsWith('/login') && !ApiClient.isRedirecting) {
      ApiClient.isRedirecting = true;
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
  }
}
```

**Benefits**:
- No more login screen flashing
- Single redirect even with many parallel 401 errors
- Cleaner user experience on token expiration

---

### 3.2 WebSocket Pong Message Handling

**Problem**: WebSocket received "pong" as plain text but tried to JSON.parse() it first, causing errors
**Root Cause**: Message handler tried to parse all messages as JSON before checking for ping/pong

**Solution**: Check for plain text messages before JSON parsing

**File**: `apps/main/src/hooks/useGenerationWebSocket.ts`

**Changes**:
```typescript
ws.onmessage = (event) => {
  try {
    // Handle ping/pong keep-alive (plain text) BEFORE JSON parsing
    if (event.data === 'pong') {
      return;
    }

    const message = JSON.parse(event.data);
    // ... handle JSON messages
  } catch (err) {
    console.error('[WebSocket] Failed to parse message:', err);
  }
};
```

---

## 4. Frontend Module System Hot-Reload Guard

**Date**: 2025-01-21
**Impact**: Low - Developer experience (reduces console noise)

### Problem
During development with hot-reload, the game session module would re-initialize, causing helpers to be registered multiple times with warning messages:
```
Helper "getFlag" already registered, overwriting
Helper "setFlag" already registered, overwriting
... (35 warnings)
```

### Solution
Added initialization guard to prevent double registration

**File**: `apps/main/src/modules/game-session/index.ts`

**Changes**:
```typescript
// Guard against double initialization (hot-reload)
let helpersRegistered = false;

export const gameSessionModule: Module = {
  async initialize() {
    // Only register once to prevent hot-reload warnings
    if (helpersRegistered) {
      return;
    }

    registerBuiltinHelpers();
    registerCustomHelpers();

    helpersRegistered = true;
  },
};
```

**Benefits**:
- Cleaner console during development
- No functional impact (warnings were harmless)
- Prevents confusion about duplicate registrations

---

## 5. UI Icon Fix

**Date**: 2025-01-21
**Impact**: Trivial - UI consistency

**Problem**: Icon "book" not found in icon registry
**Solution**: Changed to "fileText" (which exists)

**File**: `apps/main/src/routes/Home.tsx:113`

```typescript
// Before:
<Icon name="book" size={18} />

// After:
<Icon name="fileText" size={18} />
```

---

## Testing & Verification

### Backend Route Plugins
```bash
# Verify WebSocket endpoint
curl -i http://localhost:8000/api/v1/ws/generations
# Should upgrade to WebSocket (101 Switching Protocols)

# Verify logs endpoint
curl -X POST http://localhost:8000/api/v1/logs/ingest \
  -H "Content-Type: application/json" \
  -d '{"level":"INFO","service":"test","msg":"test"}'
# Should return: {"success":true,"log_id":...}
```

### Frontend
```bash
# Check browser console - no errors for:
# - Login redirects (no flashing)
# - WebSocket pong messages
# - Helper registration (no "already registered" warnings)
```

---

## Architecture Impact

### Route Plugin System
The route plugin system is now fully operational with:
- **53+ route plugins** auto-discovered from `pixsim7/backend/main/routes/`
- **WebSocket support** via dedicated route plugin
- **Logs API** fully functional for centralized logging

### Frontend Module System
Module initialization is now hot-reload safe:
- Guards prevent duplicate registrations
- Development experience improved
- Production behavior unchanged

---

## Related Documentation

- `docs/MERGE_MIDDLEWARE_PLUGIN_ARCHITECTURE.md` - Route plugin system architecture
- `docs/PLUGIN_SYSTEM_ARCHITECTURE.md` - Frontend plugin system
- `pixsim7/backend/main/api/v1/websocket.py` - WebSocket endpoints
- `pixsim7/backend/main/api/v1/logs.py` - Logging API

---

## Next Steps

### Recommended Improvements

1. **WebSocket Authentication**
   - Currently uses placeholder `user_id = 1`
   - TODO: Implement proper JWT token validation from query params

2. **Logs Database**
   - Currently uses main database (fallback)
   - TODO: Set up dedicated TimescaleDB instance via `LOG_DATABASE_URL`

3. **Custom Node Renderers**
   - 5 node types currently use `DefaultNodeRenderer`
   - TODO: Create custom renderers:
     - `NpcResponseNodeRenderer`
     - `IntimacySceneNodeRenderer`
     - `RelationshipGateNodeRenderer`
     - `ProgressionStageNodeRenderer`
     - `IntimacyGenerationNodeRenderer`

4. **Route Plugin Documentation**
   - Add examples of creating new route plugins
   - Document manifest options and patterns

---

## Commit References

- `d25894c` - Move admin app files to main app directory
- `08efc38` - Add api_keys column and improve account caching
- `bc7b6e5` - Refactor admin dependency in logs API endpoints
- Session fixes (not yet committed):
  - WebSocket route plugin creation
  - Logs API syntax fixes
  - Frontend auth/WebSocket improvements
  - Hot-reload guards
