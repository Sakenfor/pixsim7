# PixSim7 Launcher - Architecture

Technical overview of the launcher's architecture and code organization.

**Location:** `/home/user/pixsim7/scripts/launcher_gui/`
**Size:** ~9,400 lines across 23 Python files
**UI Framework:** PySide6 (Qt for Python)

---

## Directory Structure

```
launcher_gui/
├── launcher.py              # Main window (1,452 lines - monolithic core)
├── services.py              # Service definitions & configuration
├── config.py                # Configuration and environment handling
├── processes.py             # ServiceProcess class - process management
├── health_worker.py         # Background health checking
├── docker_utils.py          # Docker compose utilities
├── process_utils.py         # PID detection, process management
├── migration_tools.py       # Alembic wrapper utilities
├── database_log_viewer.py   # Database logging widget
├── theme.py                 # Centralized theming
├── widgets/
│   └── service_card.py      # ServiceCard widget component
└── dialogs/
    ├── env_editor_dialog.py       # .env file editor
    ├── ports_dialog.py            # Port configuration
    ├── settings_dialog.py         # Launcher settings
    ├── migrations_dialog.py       # Database migrations UI
    ├── git_tools_dialog.py        # Git commit helper
    └── log_management_dialog.py   # Log archival & export
```

---

## Architecture Layers

### Well-Organized Components (30% of code)

**Utilities** - Pure Python, no Qt dependencies:
- `docker_utils.py` - Docker compose wrapper functions
- `process_utils.py` - PID lookup, process killing
- `migration_tools.py` - Alembic migration wrapper

**Data Models** - Clean dataclasses:
```python
@dataclass
class ServiceDef:
    key: str
    title: str
    program: str
    args: List[str]
    cwd: str
    env_overrides: Optional[Dict[str, str]] = None
```

**Theming** - Centralized constants:
```python
# theme.py - Pure data, no Qt dependencies
BG_PRIMARY = "#1e1e1e"
ACCENT_PRIMARY = "#5a9fd4"
SPACING_MD = 8
```

### Monolithic Core (70% of code)

**`launcher.py`** - Single 1,452-line class handling:
- All UI creation and layout
- Service lifecycle (start/stop/restart)
- Dependency resolution
- Health status updates
- Log filtering and display
- State management
- Dialog creation

**Problem:** Business logic mixed with UI code, can't be reused without Qt.

---

## UI Framework

**PySide6** (PyQt 6 bindings)

### Components Used
- **Layouts:** QVBoxLayout, QHBoxLayout, QGridLayout, QSplitter
- **Widgets:** QWidget, QLabel, QPushButton, QTextBrowser, QTabWidget
- **Threading:** QThread (health worker), QProcess (service processes)
- **Communication:** Qt Signals/Slots pattern

### Qt Coupling Issues

**processes.py** - Uses QProcess instead of subprocess:
```python
from PySide6.QtCore import QProcess

class ServiceProcess:
    def start(self):
        self.proc = QProcess()  # ❌ Should use subprocess.Popen
```

**health_worker.py** - Uses QThread instead of threading:
```python
from PySide6.QtCore import QThread, Signal

class HealthWorker(QThread):  # ❌ Should use threading.Thread
    health_update = Signal(...)
```

---

## Coupling Analysis

### Coupling Score: 3/10 (Tightly Coupled)

| Aspect | Score | Status |
|--------|-------|--------|
| UI-Business Separation | 2/10 | 🔴 Monolithic, mixed concerns |
| Layering | 3/10 | 🔴 No service layer |
| Reusability | 4/10 | 🔴 Can't reuse logic in CLI/web |
| Testability | 2/10 | 🔴 Qt-dependent tests |
| Theme Separation | 9/10 | ✅ Excellent |
| Data Models | 7/10 | ✅ Good |
| Framework Agnosticism | 3/10 | 🔴 Qt-dependent |

### What's Well Decoupled ✅

**Pure Python utilities:**
```python
# docker_utils.py
def compose_ps(compose_file: str) -> List[Dict]:
    # Pure function, no Qt

# config.py
def read_env_ports() -> Ports:
    # Pure I/O, no Qt

# migration_tools.py
def _run_alembic(*args) -> str:
    # Pure subprocess call, no Qt
```

### What's Tightly Coupled 🔴

**Business logic in UI class:**
```python
class LauncherWindow(QWidget):
    def _start_service(self, key: str):
        sp = self.processes.get(key)
        if not sp.tool_available:
            QMessageBox.warning(...)  # ❌ UI in business logic
        sp.start()
```

**Qt-coupled process management:**
```python
# processes.py
from PySide6.QtCore import QProcess  # ❌ Should use subprocess

class ServiceProcess:
    def start(self):
        self.proc = QProcess()
        self.proc.start(self.program, self.args)
```

---

## Current State

### Strengths ✅

1. **Good utility modules** - Docker, process, migration utilities are pure Python
2. **Clean service definitions** - ServiceDef is a well-designed dataclass
3. **Excellent theming** - Centralized theme.py with no Qt dependencies
4. **Structured logging** - Dedicated logger module
5. **Modular dialogs** - Different features separated into files

### Weaknesses 🔴

1. **Monolithic launcher.py** - 1,452 lines doing too many things
2. **Qt framework coupling** - QProcess, QThread throughout
3. **No business logic layer** - Logic mixed directly in UI class
4. **Scattered state** - No centralized state management
5. **Mixed concerns in dialogs** - Each dialog contains UI + business logic
6. **Hard to test** - Can't test logic without Qt framework
7. **Can't reuse code** - Logic tightly tied to PySide6

---

## Decoupling Recommendations

### Current (Bad)
```
CLI wants to start backend  →  ❌ Can't use launcher logic (Qt-dependent)
Web UI needs service status →  ❌ Can't use launcher logic (Qt-dependent)
Tests need process logic    →  ❌ Can't test without Qt framework
```

### Target (Good)
```
CLI wants to start backend  →  ✅ Uses ProcessManager
Web UI needs service status →  ✅ Uses ProcessManager + HealthManager
Tests need process logic    →  ✅ Pure Python tests, no Qt
Launcher UI                 →  ✅ Uses same ProcessManager
```

### Recommended Decoupling Path

**Phase 1: Extract Service Layer**
- Create `ProcessManager` - Start, stop, restart services
- Create `HealthManager` - Monitor service health
- Create `LogManager` - Filter, search, format logs
- Create `StateManager` - Centralize service state

**Phase 2: Remove Qt Framework Coupling**
- Replace `QProcess` with `subprocess.Popen`
- Replace `QThread` with `threading.Thread`
- Replace Qt `Signals` with callback functions or event system

**Phase 3: Dependency Injection**
- Pass managers to UI, not vice versa
- UI observes state changes via callbacks
- Business logic testable without Qt

**Phase 4: Event System**
- Services emit events (started, stopped, health_changed)
- UI subscribes to events
- Could drive multiple UIs from same logic

---

## Summary

The launcher is **TIGHTLY COUPLED** (3/10) with a 1,452-line monolithic `launcher.py` that mixes UI and business logic.

**Key Issue:** All service lifecycle, health checking, and log management logic is embedded in the Qt UI class, making it:
- Impossible to test without PySide6
- Impossible to reuse in CLI or web interfaces
- Difficult to maintain and extend

**Solution:** Extract business logic into pure Python service classes that can be used by multiple UIs (Qt, web, CLI) without framework dependencies.

The utilities and data models are well-designed, but they're underutilized due to the monolithic main window that doesn't properly separate concerns.

---

## See Also

- **LAUNCHER.md** - User guide for running and using the launcher
- **LAUNCHER_INTEGRATION_TESTING.md** - Testing guide
- **docs/archive/launcher/** - Detailed architecture analysis (archived)
