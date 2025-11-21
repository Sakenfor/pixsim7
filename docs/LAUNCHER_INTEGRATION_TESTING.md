# Launcher Integration Testing Guide

## Phase 2 Complete: Core Managers Integrated with Qt Launcher

The pure Python `launcher_core` managers are now integrated into the existing Qt launcher through a compatibility layer. The launcher will **automatically use the new core** if available, or fall back to the old implementation.

---

## What Changed

### Architecture Before:
```
Qt Launcher
├── ServiceProcess (Qt-coupled)
├── HealthWorker (QThread-based)
└── Direct process management
```

### Architecture Now:
```
Qt Launcher (UI unchanged)
    ↓
ServiceProcessAdapter (compatibility)
    ↓
LauncherFacade (Qt wrapper)
    ↓
launcher_core (pure Python)
    ├── ProcessManager
    ├── HealthManager
    └── LogManager
```

---

## How to Test

### 1. Basic Smoke Test

**Start the launcher:**
```bash
cd scripts
python -m launcher_gui.launcher
```

**Expected behavior:**
- Launcher window opens normally
- All service cards appear
- Services can be started/stopped
- Health indicators update
- Logs appear in console

**Check the logs:**
Look for this message in `data/logs/launcher/launcher.log`:
```json
{"event": "launcher_using_new_core", "message": "Using launcher_core managers"}
```

If you see this, the new core is active! ✅

If instead you see:
```json
{"event": "launcher_using_old_core", "message": "Falling back to old ServiceProcess implementation"}
```

Then there's an import error with launcher_core (check Python path).

### 2. Functionality Tests

Test each major feature:

#### ✅ Service Start/Stop
1. Click "Start" on backend service
2. Wait for health to show green (HEALTHY)
3. Click "Stop"
4. Verify health shows gray (STOPPED)

#### ✅ Health Monitoring
1. Start backend service
2. Watch health status change: STARTING → HEALTHY
3. Stop backend
4. Watch health change: HEALTHY → STOPPED

#### ✅ Logs
1. Start backend service
2. Select backend in UI
3. Verify logs appear in console panel
4. Type "error" in filter box
5. Verify only error lines show

#### ✅ Global Controls
1. Click "Start All"
2. Wait for all services to start
3. Click "Stop All"
4. Verify all services stop

#### ✅ Service Restart
1. Start backend
2. Right-click → Restart
3. Verify service restarts (brief STOPPED, then STARTING)

### 3. Regression Tests

Verify existing features still work:

#### ✅ Git Tools
- Menu → Tools → Git Tools
- Verify dialog opens

#### ✅ Migrations
- Menu → Tools → Database Migrations
- Verify dialog opens

#### ✅ Database Logs
- Start db service
- Open database log viewer
- Verify logs stream

#### ✅ Settings
- Click settings ⚙ icon
- Change health check interval
- Save
- Restart launcher
- Verify setting persisted

### 4. Error Handling

Test error scenarios:

#### ✅ Missing Tools
1. In `services.py`, add a service with `required_tool="nonexistent"`
2. Restart launcher
3. Verify service shows tool error

#### ✅ Port Conflicts
1. Start backend (port 8000)
2. Manually run `python -m uvicorn pixsim7.backend.main.main:app --port 8000`
3. In launcher, try to start backend
4. Verify appropriate error handling

#### ✅ Crash Recovery
1. Start all services
2. Kill launcher (Ctrl+C or force quit)
3. Restart launcher
4. Verify services are detected as "already running"
5. Verify can still stop them

### 5. Performance Tests

#### ✅ Health Check Performance
- Start all 7 services
- Observe health check updates
- Verify:
  - Fast polling during startup (~0.5s)
  - Slow polling when stable (~5s)
  - No UI lag/freezing

#### ✅ Log Performance
- Start backend
- Generate lots of logs (make API calls)
- Verify:
  - Logs appear in real-time
  - No memory leaks
  - UI remains responsive

---

## What to Look For

### ✅ Good Signs

- Log message: `"launcher_using_new_core"`
- All services start/stop normally
- Health monitoring works
- Logs appear in console
- No Python exceptions
- UI responsive

### ❌ Bad Signs

- Log message: `"launcher_using_old_core"` (unless intentional)
- Services fail to start
- Health status stuck on "STARTING"
- No logs appear
- Python tracebacks in logs
- UI freezes or lags

---

## Troubleshooting

### Problem: "launcher_using_old_core"

**Cause:** Import error with launcher_core

**Fix:**
1. Check Python path includes project root
2. Verify `pixsim7/launcher_core/__init__.py` exists
3. Try: `python -c "from pixsim7.launcher_core import ProcessManager"`

### Problem: Services won't start

**Check:**
1. Look at service-specific logs in `data/logs/console/`
2. Check `data/logs/launcher/launcher.log` for errors
3. Verify required tools installed (docker, pnpm, python)

### Problem: Health always shows "STARTING"

**Check:**
1. Is the service actually running? (check task manager / ps)
2. Is the health URL responding? `curl http://localhost:8000/health`
3. Check firewall not blocking localhost

### Problem: No logs appear

**Check:**
1. Select a service (click service card)
2. Check log files exist: `data/logs/console/backend.log`
3. Try starting service from command line to verify it outputs

---

## Comparison: Old vs New

| Feature | Old Implementation | New Implementation |
|---------|-------------------|-------------------|
| Process Management | Qt QProcess | Python subprocess |
| Health Monitoring | QThread + QTimer | threading.Thread |
| Log Management | In-memory only | Persistent + in-memory |
| Testability | Requires Qt | Pure Python |
| Reusability | Qt-only | Qt, Web, CLI |
| Code Size | 1450 lines monolithic | ~800 lines split |
| Dependencies | PySide6 | stdlib only |

---

## Next Steps After Testing

Once testing confirms everything works:

### Option A: Remove Old Code (Clean Architecture)
Remove `ServiceProcess` and `HealthWorker` classes entirely, forcing use of new core.

**Pros:** Clean architecture, less code to maintain
**Cons:** No fallback if issues found

### Option B: Keep Both (Safe Transition)
Keep old code as fallback, toggle via config.

**Pros:** Safe, can revert if needed
**Cons:** Maintains duplicate code

### Option C: Move Forward (Recommended)
Keep compatibility layer for now, proceed to Phase 3-6:
- Phase 3: REST API using same core
- Phase 4: Svelte web UI
- Phase 5: Remove old code after web UI proven

---

## Success Criteria

Phase 2 is **successful** if:

1. ✅ Launcher starts without errors
2. ✅ Log shows "launcher_using_new_core"
3. ✅ All services can start/stop
4. ✅ Health monitoring works
5. ✅ Logs appear in console
6. ✅ No regressions in existing features
7. ✅ UI remains responsive

If all criteria met, Phase 2 is **COMPLETE** and ready to proceed to Phase 3 (REST API).

---

## Quick Test Script

Run this to verify basic functionality:

```bash
# Test 1: Import works
python -c "from pixsim7.launcher_core import ProcessManager, HealthManager, LogManager" && echo "✅ Core imports OK"

# Test 2: Facade works
python -c "from scripts.launcher_gui.launcher_facade import LauncherFacade" && echo "✅ Facade imports OK"

# Test 3: Adapter works
python -c "from scripts.launcher_gui.service_adapter import ServiceProcessAdapter" && echo "✅ Adapter imports OK"

# Test 4: Bridge works
python -c "from scripts.launcher_gui.qt_bridge import QtEventBridge" && echo "✅ Bridge imports OK"

# If all pass, integration is ready!
```

---

**Status:** Phase 2 integration complete, ready for testing
**Date:** 2025-11-17
**Commit:** `193ea6d` - Phase 2: Integrate launcher_core with Qt launcher
