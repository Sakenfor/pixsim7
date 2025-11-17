# PixSim7 Launcher - Architecture Analysis

**Analysis Date:** 2025-11-17  
**Codebase Location:** `/home/user/pixsim7/scripts/launcher_gui/`  
**Total Lines of Code:** ~9,398 lines across 23 Python files  
**UI Framework:** PySide6 (Qt for Python)  
**Current Branch:** `claude/decouple-launcher-ui-01JQr3R5Rja11Cti3N2BEULB`

---

## 1. LAUNCHER CODE LOCATION & STRUCTURE

### Root Directory
```
/home/user/pixsim7/scripts/launcher_gui/
├── launcher.py                    # Main window (1,452 lines) - MONOLITHIC
├── services.py                    # Service definitions & configuration
├── config.py                      # Config, UI state, environment handling
├── processes.py                   # ServiceProcess class - process management
├── health_worker.py               # Background health checking thread
├── docker_utils.py                # Docker compose utilities
├── process_utils.py               # PID detection, process killing
├── migration_tools.py             # Alembic wrapper utilities
├── database_log_viewer.py         # Database logging widget (37KB)
├── theme.py                       # Centralized theming system
├── status.py                      # HealthStatus enum & colors
├── logger.py                      # Structured logging setup
├── constants.py                   # Max log lines, etc.
├── widgets/
│   └── service_card.py            # ServiceCard widget (reusable component)
└── dialogs/
    ├── env_editor_dialog.py       # .env file editor
    ├── ports_dialog.py            # Port configuration
    ├── settings_dialog.py         # Launcher settings
    ├── migrations_dialog.py        # Database migrations UI
    ├── git_tools_dialog.py         # Git utilities
    ├── simple_git_dialog.py        # Simplified git interface
    └── log_management_dialog.py    # Log archival & export
```

### Data Directory
```
/home/user/pixsim7/data/launcher/
└── db_browser_widget.py           # Database browsing widget
```

---

## 2. DIRECTORY STRUCTURE & ORGANIZATION

### Current Architecture (TIGHTLY COUPLED)

```
┌─────────────────────────────────────────────────────┐
│              PySide6 UI Layer                        │
│  ┌──────────────┬──────────────┬──────────────┐    │
│  │ LauncherMain │   Dialogs    │   Widgets    │    │
│  │ (1452 lines) │ (6 files)    │ (1 file)     │    │
│  └──────────────┴──────────────┴──────────────┘    │
│                        ▼                             │
├─────────────────────────────────────────────────────┤
│         Business Logic (MIXED IN MONOLITH)          │
│  ┌──────────────┬──────────────┬──────────────┐    │
│  │ Process Mgmt │ Health Check │ Log Display  │    │
│  │ (launcher.py)│ (health_wkr) │ (launcher.py)│    │
│  └──────────────┴──────────────┴──────────────┘    │
│                        ▼                             │
├─────────────────────────────────────────────────────┤
│        Infrastructure & Utilities                   │
│  ┌──────────────┬──────────────┬──────────────┐    │
│  │ Services Cfg │ Docker Utils │ Process Utils│    │
│  │ Config, Env  │ Docker PS    │ PID Lookup   │    │
│  └──────────────┴──────────────┴──────────────┘    │
│                        ▼                             │
├─────────────────────────────────────────────────────┤
│          External Dependencies                      │
│  Docker | PostgreSQL | Redis | File System          │
└─────────────────────────────────────────────────────┘
```

---

## 3. UI & CORE LOGIC ORGANIZATION

### UI Organization - MONOLITHIC APPROACH

**`launcher.py` (Main Window) - 1,452 lines**
- Single `LauncherWindow(QWidget)` class handling ALL UI and business logic
- Directly creates and manages all UI components:
  - Service cards layout
  - Console log viewer
  - Database logs viewer
  - Tools tab with migrations, git tools
  - Settings tab
- Direct event handling (signals/slots) for service lifecycle
- State management (selected service, log filters, autoscroll)
- Performs business operations:
  - Calls `sp.start()`, `sp.stop()` directly
  - Manages dependency resolution
  - Handles health updates
  - Refreshes console displays

**Widgets - MINIMAL**
- Only 1 reusable component: `ServiceCard` (150 lines)
  - Encapsulates service status display
  - Emits signals for start/stop/restart
  - Still tightly coupled to PySide6

**Dialogs - MIXED CONCERNS**
- Dialog files (`settings_dialog.py`, `migrations_dialog.py`, etc.)
- Each dialog both:
  - Builds UI layout
  - Implements business logic (migrations, env editing, etc.)
- Some call backend utilities (migration_tools.py)
- Heavy use of inline business logic

### Business Logic Organization - DECENTRALIZED

| Module | Purpose | Coupling to UI |
|--------|---------|----------------|
| `services.py` | Service definitions (port config, args, env vars) | ✅ DECOUPLED - Pure data |
| `config.py` | Config parsing, port/env management | ✅ DECOUPLED - Pure utilities |
| `processes.py` | ServiceProcess class - lifecycle management | ⚠️ PARTIALLY COUPLED - Uses QProcess, QTimer |
| `health_worker.py` | Health checking thread | ⚠️ PARTIALLY COUPLED - QThread, emits Signals |
| `docker_utils.py` | Docker subprocess wrappers | ✅ DECOUPLED - Pure subprocess utilities |
| `process_utils.py` | PID detection, process killing | ✅ DECOUPLED - Pure subprocess utilities |
| `migration_tools.py` | Alembic command wrappers | ✅ DECOUPLED - Pure subprocess utilities |
| `database_log_viewer.py` | Database logging widget | ❌ TIGHTLY COUPLED - UI component |
| `theme.py` | Styling constants & functions | ✅ DECOUPLED - Pure data/functions |
| `status.py` | Health status enums & colors | ✅ DECOUPLED - Pure data |

---

## 4. UI FRAMEWORK

**Framework: PySide6 (PyQt 6 bindings for Python)**

### Key Components Used:
- **Layouts:** QVBoxLayout, QHBoxLayout, QGridLayout
- **Widgets:** QWidget, QFrame, QLabel, QPushButton, QTextEdit, QTextBrowser
- **Dialogs:** QDialog, QMessageBox, QFileDialog
- **Tabs:** QTabWidget
- **Input:** QLineEdit, QCheckBox, QSpinBox, QDoubleSpinBox, QComboBox
- **Threading:** QThread (for HealthWorker), QProcess (for service execution), QTimer
- **Signals/Slots:** Custom signals for communication (e.g., `health_check_signal`)
- **Styling:** Inline stylesheets + centralized `theme.py` module

### Theming
- Centralized `theme.py` with:
  - Color constants (dark theme)
  - Spacing system
  - Font sizing
  - Border radius definitions
  - Helper functions for component stylesheets
- **Note:** Excellent separation for styling, but NOT for logic

---

## 5. COUPLING ANALYSIS - HOW TIGHTLY COUPLED IS IT?

### ✅ DECOUPLED ELEMENTS (Good Separation)

1. **Service Definitions** (`services.py`)
   - Pure data classes (ServiceDef, Ports)
   - No UI imports
   - Could work with any UI framework

2. **Configuration Management** (`config.py`)
   - File I/O utilities (read_env_ports, write_env_ports, etc.)
   - UI State management (but only as data)
   - No PySide6 dependencies

3. **Infrastructure Utilities**
   - `docker_utils.py` - Pure subprocess wrappers
   - `process_utils.py` - PID detection, killing
   - `migration_tools.py` - Alembic CLI wrappers
   - All are language/framework agnostic

4. **Theming System** (`theme.py`)
   - Complete separation of styling
   - Easy to swap with different color schemes
   - Could be used by other UIs

5. **Data Models** (`status.py`)
   - HealthStatus enum
   - Status colors/text (could be theme-agnostic)

### ⚠️ PARTIALLY COUPLED ELEMENTS (Some Coupling)

1. **Process Management** (`processes.py`)
   ```python
   from PySide6.QtCore import QProcess, QTimer
   ```
   - Uses QProcess (Qt's process runner)
   - Could use subprocess.Popen instead
   - Uses QTimer for log monitoring
   - **Could be decoupled:** Replace QProcess with subprocess, 
     use threading.Timer or signal callbacks

2. **Health Worker** (`health_worker.py`)
   ```python
   from PySide6.QtCore import QThread, Signal
   ```
   - Inherits from QThread
   - Emits `health_update` signals
   - **Could be decoupled:** Use threading.Thread + callback system

### ❌ TIGHTLY COUPLED ELEMENTS (Poor Separation)

1. **Main Window** (`launcher.py` - 1,452 lines)
   - **MONOLITHIC:** All UI AND business logic in one class
   - Creates all UI elements directly
   - Handles service lifecycle methods
   - Implements log filtering, search, formatting
   - Manages state (selected service, console filters, etc.)
   - Contains logic for:
     - Dependency resolution (start_all, _start_service)
     - Health monitoring (update_service_health)
     - Log display and filtering
     - Dialog creation and callbacks
   - **Tightly coupled example:**
     ```python
     def _start_service(self, key: str):
         sp = self.processes.get(key)
         # Business logic mixed with UI logic
         if not sp.tool_available:
             QMessageBox.warning(...)  # UI directly called from logic
         sp.start()  # Service lifecycle
     ```

2. **Dialogs** (`dialogs/*.py`)
   - Each dialog has mixed concerns:
     - UI layout construction
     - Business logic (migrations, env editing, git tools)
     - Direct database/file access
   - Example: `migrations_dialog.py`
     ```python
     def run_migration(self):
         result = migration_tools._run_alembic(...)  # Business logic
         self.output_text.setText(result)  # UI update in same method
     ```

3. **Database Log Viewer** (`database_log_viewer.py` - 37KB)
   - Complex widget with:
     - UI logic (layout, styling)
     - Database query logic
     - SQL construction
     - All mixed together
   - Tightly coupled to PySide6

4. **Service Card Widget** (`widgets/service_card.py`)
   - While somewhat encapsulated, still tightly coupled:
     - Receives both `ServiceDef` and `ServiceProcess`
     - Directly updates UI based on process state
     - Could be decoupled from data layer

### COUPLING METRICS

| Aspect | Score | Notes |
|--------|-------|-------|
| **UI-Business Logic Separation** | 2/10 | Monolithic launcher.py mixes concerns |
| **Layering** | 3/10 | Utilities layer OK, but UI layer has business logic |
| **Reusability** | 4/10 | Service definitions reusable; UI not |
| **Testability** | 2/10 | Hard to test logic without UI framework |
| **Theme Separation** | 9/10 | Excellent - centralized theme.py |
| **Data Model Clarity** | 7/10 | Good data structures (ServiceDef, HealthStatus) |
| **Framework Agnosticism** | 3/10 | Would be difficult to replace PySide6 |

---

## 6. PATTERNS OBSERVED

### API/Service Layers
- ✅ **`services.py`** - Service definition layer (ServiceDef dataclass)
- ⚠️ **`processes.py`** - Process management layer (but tightly coupled to Qt)
- ⚠️ **`health_worker.py`** - Health checking layer (but uses QThread/Signals)

### UI Components vs Business Logic
- **Bad:** Business logic (start_service, dependency resolution) in launcher.py UI class
- **Good:** Utilities (docker_utils, process_utils, migration_tools) are pure
- **Mixed:** Dialogs embed business logic + UI

### State Management
- **Console logs:** Stored in `ServiceProcess.log_buffer` (in-memory)
- **Service state:** Stored in `ServiceProcess` objects
- **UI state:** Stored in config file via `UIState` dataclass
- **Health status:** Passed via signals from HealthWorker
- **No centralized store:** State is scattered across classes

### Communication Patterns
- **Signals/Slots:** Qt signals for UI updates (launcher ← HealthWorker)
- **Direct calls:** launcher.py calls process.start() directly
- **Callbacks:** Dialog callbacks passed as lambda to button clicks
- **File-based config:** Config changes via read/write functions

### Separation of Concerns Issues

1. **launcher.py combines:**
   - Event handling (button clicks)
   - State management (selected service)
   - Service lifecycle (start/stop/restart)
   - Display logic (log filtering, formatting)
   - Dependency resolution
   - Health monitoring

2. **Dialogs combine:**
   - Layout building
   - Business logic execution
   - I/O operations (files, migrations)
   - Error handling

3. **database_log_viewer.py combines:**
   - Query construction
   - Database access
   - UI rendering

---

## 7. CURRENT ARCHITECTURE SUMMARY

### Strengths ✅
1. **Clear utility libraries** - docker, process, migration tools are pure Python
2. **Centralized theming** - Good separation of styling concerns
3. **Service definitions** - Clean, reusable ServiceDef and Ports dataclasses
4. **Configuration management** - Separate config.py with read/write utilities
5. **Structured logging** - Logger setup in separate module
6. **Health checking** - Background thread for monitoring (though Qt-coupled)
7. **Modular dialogs** - Different features in separate dialog files (though mixed concerns)

### Weaknesses ❌
1. **Monolithic main window** - 1,452 lines of mixed UI/business logic
2. **Qt framework coupling** - Hard to reuse business logic with different UI
3. **Scattered state** - Service state, UI state, health status in different places
4. **Mixed concerns in dialogs** - Each dialog has UI + business logic
5. **Tight coupling in processes.py** - Uses QProcess instead of subprocess
6. **Database log viewer** - 37KB monolithic widget with all concerns mixed
7. **No abstraction layers** - UI calls process/service code directly
8. **Testing difficulty** - UI logic tightly coupled to Qt framework

---

## 8. RECOMMENDATIONS FOR DECOUPLING

### Phase 1: Extract Business Logic Layer (Priority: HIGH)
1. **Create `services/` directory:**
   - `service_manager.py` - ServiceManager class (currently in launcher.py)
   - `process_manager.py` - Process lifecycle (start, stop, restart)
   - `health_manager.py` - Health checking logic
   - `log_manager.py` - Log filtering/search logic

2. **Move logic from launcher.py:**
   - `_start_service`, `start_all`, `stop_all` → ProcessManager
   - `_update_service_health` → Health notification system
   - Log filtering/searching → LogManager

### Phase 2: Decuple Qt Framework (Priority: HIGH)
1. **Replace QProcess with subprocess:**
   - `processes.py` should use `subprocess.Popen`
   - Keep log monitoring as generic threading

2. **Replace QThread/Signals with callbacks:**
   - HealthWorker emits signals → callback functions
   - Allows different UI frameworks to use the same logic

3. **Extract DatabaseLogViewer logic:**
   - SQL building → database service
   - Rendering → separate UI component

### Phase 3: State Management (Priority: MEDIUM)
1. **Centralize state:**
   - Create StateManager for service state
   - Create UIStateManager for UI preferences
   - Publish state changes as events

2. **Event-driven architecture:**
   - Services emit events (started, stopped, health_changed)
   - UI subscribes to events (framework-agnostic)

### Phase 4: Dependency Inversion (Priority: MEDIUM)
1. **Inject dependencies:**
   - ProcessManager should not know about LauncherWindow
   - HealthWorker should call callbacks, not emit Qt signals
   - Dialogs should receive services, not create them

---

## 9. DECOUPLING OPPORTUNITY AREAS

### Highest Impact Changes (80/20)
1. **Extract launcher.py logic → business layer** (saves 600+ lines)
2. **Replace QProcess/QThread with subprocess/threading** (enables reuse)
3. **Create state management layer** (unify scattered state)
4. **Create event system** (replace signal/slot coupling)

### Quick Wins
1. Extract log filtering logic to LogManager (pure functions)
2. Extract dependency resolution to separate module
3. Move dialog business logic to service classes

### Long-term Benefits
- **Reusable backend** - Could drive web UI, REST API, CLI
- **Testable** - Logic testable without Qt framework
- **Swappable UI** - Could use web frontend, different Qt app, etc.
- **Better maintainability** - Clear separation of concerns

---

## 10. BRANCH STATUS

**Current Branch:** `claude/decouple-launcher-ui-01JQr3R5Rja11Cti3N2BEULB`

This appears to be a work-in-progress branch for decoupling the launcher UI. The presence of this branch indicates that decoupling is a planned initiative.

### Recent Related Work:
- Plugin system integration (auto-discovery)
- Input/Select component extraction to @pixsim7/ui
- Health check settings UI
- Structured logging additions

---

## CONCLUSION

**Current State: TIGHTLY COUPLED (Score: 3/10)**

The launcher has some well-organized utility modules but suffers from monolithic UI code that mixes business logic, state management, and presentation. The main barriers to decoupling are:

1. **Monolithic LauncherWindow class** (1,452 lines)
2. **Direct Qt framework usage** in core logic (QProcess, QThread, Signals)
3. **Scattered state management**
4. **Mixed concerns in dialogs and widgets**

**Decoupling Strategy:**
1. Extract business logic to service layer (non-Qt)
2. Replace Qt-specific classes with standard library
3. Create event/callback system instead of Qt signals
4. Centralize state management
5. Dependency injection for testability

This would enable the launcher logic to be reused in web UI, CLI, or other frontends while maintaining the current PySide6 GUI.

