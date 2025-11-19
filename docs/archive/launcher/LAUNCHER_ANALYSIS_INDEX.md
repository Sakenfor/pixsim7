# PixSim7 Launcher - Architecture Analysis Index

**Analysis Date:** November 17, 2025  
**Current Branch:** `claude/decouple-launcher-ui-01JQr3R5Rja11Cti3N2BEULB`

This analysis explores the launcher's architecture, focusing on how tightly coupled the UI is to the core business logic.

---

## 📋 Documents in This Analysis

### 1. [LAUNCHER_ARCHITECTURE_SUMMARY.md](./LAUNCHER_ARCHITECTURE_SUMMARY.md) - START HERE ⭐
**Best for:** Quick understanding of the current state  
**Length:** ~11KB, 5-minute read

**Contents:**
- Where is the launcher code located
- Directory structure overview
- How the UI and core logic are organized
- What UI framework is being used
- Coupling score and analysis
- Key findings (strengths & weaknesses)
- Decoupling opportunity overview

**TL;DR:** The launcher is **TIGHTLY COUPLED (3/10)** - a 1,452-line monolithic `launcher.py` file mixes UI code with business logic.

---

### 2. [LAUNCHER_ARCHITECTURE_ANALYSIS.md](./LAUNCHER_ARCHITECTURE_ANALYSIS.md) - DEEP DIVE
**Best for:** Comprehensive understanding  
**Length:** ~19KB, 15-minute read

**Contents:**
- Complete directory structure and file inventory
- Detailed architecture diagrams
- In-depth coupling analysis with code examples
- Per-module coupling breakdown
- Current patterns (API layers, state management, communication)
- Strengths and weaknesses
- Detailed recommendations for decoupling
- Coupling metrics table
- Current branch status and related work

**TL;DR:** Explores every file, every coupling point, and specific recommendations for improvement.

---

### 3. [LAUNCHER_DECOUPLING_STRATEGY.md](./LAUNCHER_DECOUPLING_STRATEGY.md) - PRACTICAL GUIDE
**Best for:** Implementation and testing  
**Length:** ~24KB, 20-minute read

**Contents:**
- Problem statement with specific code examples
- Target layered architecture diagram
- **Phase 1:** Extract ProcessManager (no Qt)
- **Phase 2:** Remove Qt framework dependencies
- **Phase 3:** Extract HealthManager
- **Phase 4:** Update UI to use services
- Concrete code examples for new architecture
- Testing examples (pure Python, no Qt needed)
- Before/after comparison
- Migration path
- Benefits summary

**TL;DR:** Step-by-step guide with working code examples showing how to decouple each component.

---

## 🎯 Key Findings Summary

### Current State
- **Location:** `/home/user/pixsim7/scripts/launcher_gui/`
- **Size:** ~9,400 lines across 23 Python files
- **UI Framework:** PySide6 (Qt for Python)
- **Coupling Score:** 3/10 (badly coupled)
- **Monolithic Core:** 1,452-line `launcher.py` file

### Coupling Breakdown
| Component | Coupling | Status |
|-----------|----------|--------|
| launcher.py (main UI) | 10/10 | 🔴 MONOLITHIC |
| processes.py | 7/10 | ⚠️ Uses QProcess/QTimer |
| health_worker.py | 8/10 | ⚠️ Uses QThread/Signals |
| dialogs | 9/10 | 🔴 Mixed logic + UI |
| services.py | 0/10 | ✅ PURE DATA |
| config.py | 0/10 | ✅ PURE UTILITIES |
| theme.py | 1/10 | ✅ EXCELLENT |
| docker_utils.py | 0/10 | ✅ PURE UTILITIES |

### Main Problems ❌
1. **Monolithic Main Window** - 1,452 lines mixing UI and business logic
2. **Qt Framework Coupling** - QProcess, QThread, Signals throughout
3. **Scattered State** - Service state, UI state, health status in different places
4. **Untestable** - Can't test logic without PySide6
5. **Not Reusable** - Can't use business logic in CLI, web UI, or REST API

### Existing Strengths ✅
1. **Good Utilities** - Pure Python: docker_utils, process_utils, migration_tools
2. **Clean Data Models** - ServiceDef, Ports, HealthStatus are well-designed
3. **Excellent Theming** - Centralized, well-separated theme.py
4. **Structured Logging** - Separate logger module
5. **Modular Dialogs** - Features in separate dialog files (though mixed concerns)

---

## 🛠️ Recommended Decoupling Path

### Phase 1: Extract Service Layer (HIGH IMPACT)
Create `launcher_gui/services/` directory with:
- `ProcessManager` - Start, stop, restart services (with dependency resolution)
- `HealthManager` - Monitor service health
- `LogManager` - Filter, search, format logs
- `StateManager` - Centralize service state

**Impact:** Reduces launcher.py from 1,452 to ~600 lines

### Phase 2: Remove Qt Framework Coupling (HIGH IMPACT)
- Replace `QProcess` with `subprocess.Popen` in processes.py
- Replace `QThread` with `threading.Thread`
- Replace Qt `Signals` with callback functions

**Impact:** Makes business logic reusable in non-Qt applications

### Phase 3: Implement Dependency Injection (MEDIUM IMPACT)
- Pass managers to UI, not vice versa
- UI observes state changes via callbacks
- Testable without Qt framework

**Impact:** Improves testability and maintainability

### Phase 4: Event System (NICE TO HAVE)
- Services emit events (started, stopped, health_changed)
- UI subscribes to events
- Could drive multiple UIs from same logic

**Impact:** Enables future web/CLI UIs

---

## 📊 Architecture Comparison

### Current (Bad)
```
┌─────────────────────────────────────┐
│    LauncherWindow (1,452 lines)     │
│  ├─ UI Layout Building              │
│  ├─ Service Lifecycle (start/stop)  │
│  ├─ Health Checking                 │
│  ├─ Log Display & Filtering         │
│  └─ State Management                │
│  ❌ Everything mixed together       │
│  ❌ Can't test without Qt           │
│  ❌ Can't reuse logic               │
└─────────────────────────────────────┘
```

### Target (Good - After Decoupling)
```
┌─────────────────────────────────────┐
│    LauncherWindow (600 lines)       │
│  ├─ UI Layout Building              │
│  └─ Handle User Actions             │
│  ✅ Only UI concerns                │
└─────────────────────────────────────┘
         ⬇️  Uses
┌─────────────────────────────────────┐
│    ProcessManager (No Qt)           │
│    HealthManager (No Qt)            │
│    LogManager (No Qt)               │
│    StateManager (No Qt)             │
│  ✅ Pure Python                     │
│  ✅ Testable with pytest            │
│  ✅ Reusable in any app             │
└─────────────────────────────────────┘
```

---

## 🧪 Testing Before & After

### Before: Hard to Test
```python
# Can't test without PySide6!
from launcher_gui.launcher import LauncherWindow

def test_start_service():
    window = LauncherWindow()  # ❌ Needs X11/display, Qt event loop
    # Messy...
```

### After: Easy to Test
```python
# Pure Python - no Qt needed!
from launcher_gui.services.process_manager import ProcessManager

def test_start_service_with_missing_dependency():
    pm = ProcessManager({"backend": mock_backend, "db": mock_db})
    result = pm.start_service("backend")
    
    assert not result.success
    assert "Dependencies" in result.error
    # ✅ Simple and fast!
```

---

## 📈 Expected Benefits After Decoupling

| Benefit | Current | After Decoupling |
|---------|---------|------------------|
| **Testability** | 2/10 | 9/10 |
| **Reusability** | 1/10 | 8/10 |
| **Maintainability** | 3/10 | 8/10 |
| **Code Organization** | 2/10 | 8/10 |
| **Framework Agnosticism** | 1/10 | 8/10 |
| **Extensibility** | 3/10 | 8/10 |

---

## 🔗 Related Work

### Current Branch
**Branch:** `claude/decouple-launcher-ui-01JQr3R5Rja11Cti3N2BEULB`

This appears to be an active work-in-progress for launcher UI decoupling.

### Recent Related Commits
- Plugin system integration (auto-discovery)
- Input/Select component extraction to @pixsim7/ui
- Health check settings UI improvements
- Structured logging enhancements

---

## 📚 How to Use These Documents

1. **If you have 5 minutes:** Read LAUNCHER_ARCHITECTURE_SUMMARY.md
2. **If you have 15 minutes:** Read LAUNCHER_ARCHITECTURE_ANALYSIS.md
3. **If you're ready to implement:** Read LAUNCHER_DECOUPLING_STRATEGY.md
4. **If you want everything:** Read all three in order

---

## ❓ Quick Questions & Answers

**Q: Is the launcher badly designed?**  
A: Not badly, just monolithic. The utilities are good, but the main window tries to do too much.

**Q: Can I use the launcher logic in a CLI?**  
A: Not currently - it's tied to PySide6. After decoupling, yes.

**Q: How long would decoupling take?**  
A: Phase 1-2 (high impact): ~20-30 development hours  
Phase 3-4 (nice to have): ~10-20 additional hours

**Q: Will decoupling break existing functionality?**  
A: No, it should be transparent to users. We can refactor incrementally.

**Q: What about the theme.py and utilities?**  
A: They're already well-decoupled! Focus on launcher.py, processes.py, health_worker.py.

---

## 🎬 Next Steps

1. **Review** the three analysis documents above
2. **Discuss** the decoupling strategy with team
3. **Create** new service classes in `launcher_gui/services/`
4. **Test** the new services with pytest
5. **Refactor** launcher.py to use the new services
6. **Verify** all functionality still works
7. **Update** any documentation

---

**Generated:** 2025-11-17  
**Analysis Tool:** Claude Code (File Search Specialist)  
**Documentation:** Complete architecture exploration with concrete examples
