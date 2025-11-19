# PixSim7 Launcher - Architecture Summary (Quick Reference)

## Where is the Launcher Code?

**Location:** `/home/user/pixsim7/scripts/launcher_gui/`

**Size:** ~9,400 lines across 23 Python files

**Main File:** `launcher.py` (1,452 lines - the monolithic core)

---

## Directory Structure

```
launcher_gui/
├── launcher.py              ← 🔴 MONOLITHIC (UI + business logic)
├── services.py              ← ✅ Service definitions
├── config.py                ← ✅ Configuration
├── processes.py             ← ⚠️ Process management (Qt-coupled)
├── health_worker.py         ← ⚠️ Health checking (Qt-coupled)
├── docker_utils.py          ← ✅ Docker utilities
├── process_utils.py         ← ✅ Process utilities
├── migration_tools.py       ← ✅ Alembic wrapper
├── theme.py                 ← ✅ Theming (well-separated)
├── database_log_viewer.py   ← 🔴 Complex widget (mixed concerns)
├── widgets/
│   └── service_card.py      ← ⚠️ Card component (Qt-coupled)
└── dialogs/
    ├── migrations_dialog.py ← 🔴 Mixed logic + UI
    ├── settings_dialog.py   ← 🔴 Mixed logic + UI
    └── ... (5 more)         ← 🔴 All mixed logic + UI
```

---

## How is it Structured?

### ✅ Well-Organized Layers (30% of code)
- **Utilities:** docker_utils, process_utils, migration_tools are pure Python
- **Data Models:** ServiceDef, Ports, HealthStatus are clean dataclasses
- **Theming:** Centralized theme.py with excellent separation
- **Configuration:** config.py handles I/O cleanly

### 🔴 Monolithic Core (70% of code)
- **launcher.py:** Single 1,452-line class that does EVERYTHING:
  - Builds all UI elements
  - Handles service lifecycle (start/stop/restart)
  - Manages health checks
  - Displays and filters logs
  - Manages state
  - Creates and manages dialogs

---

## How are UI and Core Logic Organized?

### Current Pattern: MIXED (Poor Separation)

```
┌─── launcher.py (1,452 lines) ───────────────────┐
│                                                  │
│  UI Layer:                                       │
│  ├─ _init_ui()                                  │
│  ├─ _create_console_tab()                       │
│  └─ Display logic                               │
│                                                  │
│  ⬇️  MIXED ⬇️                                    │
│                                                  │
│  Business Logic:                                 │
│  ├─ _start_service()                            │
│  ├─ _stop_service()                             │
│  ├─ start_all() (with dependency resolution)   │
│  ├─ _update_service_health()                    │
│  └─ Log filtering, searching                    │
│                                                  │
└──────────────────────────────────────────────────┘
         ⬇️  Calls directly  ⬇️
┌────────────────────────────────────────────────┐
│  processes.py                                   │
│  (ServiceProcess class - process management)   │
│                                                 │
│  ⚠️  Uses Qt (QProcess, QTimer)                 │
│      Should use subprocess module              │
└────────────────────────────────────────────────┘
         ⬇️  Signals update  ⬇️
┌────────────────────────────────────────────────┐
│  health_worker.py                              │
│  (Background health checker)                   │
│                                                 │
│  ⚠️  Uses Qt (QThread, Signal)                  │
│      Should use threading module               │
└────────────────────────────────────────────────┘
```

### Problems with Current Design

1. **Monolithic Main Window**
   - Can't test business logic without PySide6
   - Hard to reuse in CLI or web UI
   - 1,452 lines doing too many things

2. **Mixed Dialogs**
   ```python
   # migrations_dialog.py example
   class MigrationsDialog(QDialog):
       def run_migration(self):
           # Business logic mixed with UI
           result = migration_tools._run_alembic(...)  # ← Business
           self.output_text.setText(result)             # ← UI Update
   ```

3. **Qt Framework Coupling**
   - processes.py uses QProcess (should use subprocess)
   - health_worker.py uses QThread (should use threading)
   - Can't extract logic to use in non-Qt apps

4. **Scattered State**
   - Service state: in ServiceProcess objects
   - UI state: in launcher.py instance variables
   - Health status: passed via Qt signals
   - Config: read/written to files
   - No single source of truth

---

## What UI Framework is Being Used?

**PySide6** (PyQt 6 bindings for Python)

### Framework Usage
- **Layouts:** QVBoxLayout, QHBoxLayout, QGridLayout
- **Widgets:** QWidget, QFrame, QLabel, QPushButton, QTextBrowser, QTabWidget
- **Threading:** QThread, QProcess, QTimer (⚠️ Should be standard library)
- **Signals/Slots:** Qt's communication pattern
- **Styling:** Inline stylesheets + theme.py constants

### Good News: Theming is Decoupled
```python
# theme.py - Pure data, no UI framework dependencies
BG_PRIMARY = "#1e1e1e"
ACCENT_PRIMARY = "#5a9fd4"
SPACING_MD = 8

def get_base_stylesheet():
    return f"QWidget {{ background-color: {BG_PRIMARY}; }}"
```

---

## How Tightly Coupled is the UI to Business Logic?

### Coupling Score: 3/10 (Badly Coupled)

| Aspect | Score | Status |
|--------|-------|--------|
| **UI-Business Logic Separation** | 2/10 | 🔴 Monolithic |
| **Layering** | 3/10 | 🔴 Mixed concerns |
| **Reusability** | 4/10 | 🔴 Can't reuse logic |
| **Testability** | 2/10 | 🔴 Qt-dependent tests |
| **Theme Separation** | 9/10 | ✅ Excellent |
| **Data Model Clarity** | 7/10 | ✅ Good |
| **Framework Agnosticism** | 3/10 | 🔴 Qt-dependent |

### What's Decoupled (Good)

```python
# services.py - Pure data
@dataclass
class ServiceDef:
    key: str
    title: str
    program: str
    args: List[str]
    cwd: str
    env_overrides: Optional[Dict[str, str]] = None
    # No PySide6 imports!

# config.py - Pure functions
def read_env_ports() -> Ports:
    # Read from file, return data
    
def write_env_ports(ports: Ports):
    # Write to file

# Utilities - Pure functions
docker_utils.compose_ps(file)
process_utils.find_pid_by_port(port)
migration_tools._run_alembic(*args)
```

### What's Tightly Coupled (Bad)

```python
# launcher.py - UI + Logic mixed
class LauncherWindow(QWidget):
    def _start_service(self, key: str):  # ← Business logic in UI class
        sp = self.processes.get(key)
        if not sp.tool_available:
            QMessageBox.warning(...)      # ← UI directly in logic
        sp.start()
    
    def _init_ui(self):                   # ← UI creation
        # 300+ lines of layout building
        
    def _update_service_health(self, ...): # ← More business logic
        # Update card, update buttons, etc.

# processes.py - Qt-coupled
from PySide6.QtCore import QProcess, QTimer  # ← Should be subprocess
class ServiceProcess:
    def start(self):
        self.proc = QProcess()

# dialogs - All mixed concerns
class MigrationsDialog(QDialog):
    def run_migration(self):
        result = migration_tools._run_alembic(...)  # Business
        self.output_text.setText(result)             # UI
```

---

## Key Findings

### Strengths ✅
1. **Good utility modules** - Pure Python for Docker, processes, migrations
2. **Clean service definitions** - ServiceDef is a pure dataclass
3. **Excellent theming** - Separated from UI logic
4. **Structured logging** - Dedicated logger module
5. **Modular dialogs** - Different features in separate files

### Weaknesses 🔴
1. **Monolithic launcher.py** - 1,452 lines of mixed code
2. **Qt framework coupling** - QProcess, QThread, Signals throughout
3. **No business logic layer** - Logic directly in UI class
4. **Scattered state** - No centralized state management
5. **Mixed concerns in dialogs** - Each dialog is UI + business logic
6. **Hard to test** - Can't test logic without Qt framework
7. **Can't reuse code** - Logic tightly tied to PySide6

---

## Decoupling Opportunity

### Current (Bad)
```
CLI wants to start backend  →  ❌ Can't use launcher logic (Qt-dependent)
Web UI needs service status →  ❌ Can't use launcher logic (Qt-dependent)
Tests need process logic    →  ❌ Can't test without Qt framework
```

### Target (Good - After Decoupling)
```
CLI wants to start backend  →  ✅ Uses ProcessManager
Web UI needs service status →  ✅ Uses ProcessManager + HealthManager
Tests need process logic    →  ✅ Pure Python tests, no Qt
Launcher UI                 →  ✅ Uses same ProcessManager
```

---

## The Current Decoupling Branch

**Branch:** `claude/decouple-launcher-ui-01JQr3R5Rja11Cti3N2BEULB`

This branch is active work on decoupling the launcher UI. Recent work includes:
- Plugin system integration
- Component extraction to @pixsim7/ui package
- Health check settings improvements
- Structured logging enhancements

---

## Recommended Decoupling Path

### Phase 1: Extract Service Layer (High Impact)
Extract from launcher.py:
- `ProcessManager` - Start, stop, restart services
- `HealthManager` - Monitor service health
- `LogManager` - Filter, search, format logs
- `StateManager` - Centralize service state

### Phase 2: Remove Qt Framework Coupling
- Replace `QProcess` with `subprocess.Popen`
- Replace `QThread` with `threading.Thread`
- Replace `Signals` with callback functions

### Phase 3: Dependency Injection
- Pass ProcessManager to UI, not vice versa
- UI observes state changes, doesn't direct them
- Testable without Qt framework

### Phase 4: Event System
- Services emit events (started, stopped, health_changed)
- UI subscribes to events
- Could drive multiple UIs from same logic

---

## Summary

**The launcher UI is currently TIGHTLY COUPLED to its business logic.**

The 1,452-line monolithic `launcher.py` contains:
- All UI creation and management
- Service lifecycle (start/stop/restart)
- Health checking logic
- Log filtering and display
- State management

A well-designed architecture would **extract business logic into separate, testable service classes** that can be used by multiple UIs (Qt, web, CLI) without PySide6 dependencies.

The utilities and data models are well-designed and reusable, but they're overwhelmed by the monolithic main window that doesn't use them properly.

