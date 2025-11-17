# PixSim7 Launcher - Decoupling Strategy with Code Examples

## Overview

This document shows concrete examples of how to decouple the launcher's business logic from its PySide6 UI framework.

---

## Problem: Current Tight Coupling

### Example 1: Service Start Logic is Mixed with UI

**Current Code (launcher.py - 1,452 lines):**
```python
class LauncherWindow(QWidget):
    def _start_service(self, key: str):
        # Business logic + UI logic mixed together
        sp = self.processes.get(key)
        if not sp:
            return
        
        # Dependency checking (business logic)
        if sp.defn.depends_on:
            missing_deps = []
            for dep_key in sp.defn.depends_on:
                dep_process = self.processes.get(dep_key)
                if not dep_process or not dep_process.running:
                    # ... build missing_deps list
            
            if missing_deps:
                # UI code in business logic!
                QMessageBox.warning(
                    self,
                    'Missing Dependencies',
                    f'{service_title} requires these services...'
                )
                return
        
        # Start the process
        sp.start()
        self._refresh_console_logs()  # UI refresh
```

**Problems:**
- Can't test without PySide6
- Can't reuse in CLI or REST API
- UI imports mixed with logic
- Hard to understand what's happening

### Example 2: Health Checking Uses Qt Signals

**Current Code (health_worker.py):**
```python
from PySide6.QtCore import QThread, Signal

class HealthWorker(QThread):
    health_update = Signal(str, HealthStatus)  # ← Qt framework dependency
    
    def run(self):
        while not self._stop:
            # ... check health ...
            self.health_update.emit(service_key, status)  # ← Qt-specific
            time.sleep(self.interval)
```

**Problems:**
- Can't use in non-Qt application
- Tight coupling to signal/slot mechanism
- Need to run in QThread (not flexible)

### Example 3: Process Management Uses QProcess

**Current Code (processes.py):**
```python
from PySide6.QtCore import QProcess, QTimer

class ServiceProcess:
    def __init__(self, defn: ServiceDef):
        self.proc: Union[QProcess, subprocess.Popen] = None
        self._log_monitor_timer: Optional[QTimer] = None
    
    def start(self):
        self.proc = QProcess()  # ← Qt-specific
        self.proc.start(...)
        self._start_log_monitor()
    
    def _start_log_monitor(self):
        self._log_monitor_timer = QTimer()  # ← Qt-specific
        self._log_monitor_timer.timeout.connect(self._read_new_log_lines)
```

**Problems:**
- Can't use outside Qt application
- Creates two code paths (QProcess vs subprocess.Popen)
- Tightly coupled to Qt timing mechanisms

---

## Solution: Layer-Based Architecture

### Target Structure

```
┌─────────────────────────────────────┐
│    UI Layer (PySide6)               │
│  ┌─────────────────────────────┐   │
│  │ LauncherWindow (Qt-aware)   │   │
│  │ - Observes state            │   │
│  │ - Emits user actions        │   │
│  │ - Updates displays          │   │
│  └─────────────────────────────┘   │
└──────────────────────────────────────┘
         ⬇️  Uses
┌──────────────────────────────────────┐
│  Business Logic Layer (Pure Python)  │
│  ┌──────────────┬──────────────┐    │
│  │ProcessManager│ HealthManager│    │
│  │  LogManager  │ StateManager │    │
│  └──────────────┴──────────────┘    │
│                                      │
│  - No UI imports                     │
│  - Testable without Qt               │
│  - Reusable in any app               │
└──────────────────────────────────────┘
         ⬇️  Uses
┌──────────────────────────────────────┐
│  Infrastructure Layer                │
│  - Config, Docker, Processes, etc.   │
│  - Pure utilities (no Qt)            │
└──────────────────────────────────────┘
```

---

## Phase 1: Extract Business Logic Service Classes

### Step 1: Create ProcessManager (No Qt)

**File: `launcher_gui/services/process_manager.py`**

```python
"""
Process management business logic - ZERO Qt framework dependencies.
"""
from typing import Dict, Callable, Optional, List
from dataclasses import dataclass
from enum import Enum
import subprocess
import os

from ..services import ServiceDef
from ..status import HealthStatus


@dataclass
class ServiceStartResult:
    """Result of attempting to start a service."""
    success: bool
    error: Optional[str] = None
    pid: Optional[int] = None


class ProcessManager:
    """Manages service processes - testable without Qt framework."""
    
    def __init__(self, processes: Dict[str, 'ServiceProcess']):
        """
        Args:
            processes: Dict of service key -> ServiceProcess objects
        """
        self.processes = processes
        # Callbacks instead of Qt signals
        self.on_service_started: Optional[Callable[[str, int], None]] = None
        self.on_service_stopped: Optional[Callable[[str], None]] = None
        self.on_error: Optional[Callable[[str, str], None]] = None
    
    def start_service(self, key: str) -> ServiceStartResult:
        """
        Start a single service with dependency checking.
        
        Pure business logic - no UI imports or calls.
        
        Returns:
            ServiceStartResult with success status
        """
        sp = self.processes.get(key)
        if not sp:
            return ServiceStartResult(False, error="Service not found")
        
        if not sp.tool_available:
            return ServiceStartResult(
                False,
                error=f"Required tool not available: {sp.tool_check_message}"
            )
        
        # Check dependencies
        missing_deps = self._check_dependencies(key)
        if missing_deps:
            dep_names = ", ".join(missing_deps)
            return ServiceStartResult(
                False,
                error=f"Missing dependencies: {dep_names}"
            )
        
        # Actually start the process
        try:
            sp.start()
            # Emit callback instead of Qt signal
            if self.on_service_started:
                self.on_service_started(key, sp.process.pid if sp.process else None)
            return ServiceStartResult(True, pid=sp.process.pid if sp.process else None)
        except Exception as e:
            if self.on_error:
                self.on_error(key, str(e))
            return ServiceStartResult(False, error=str(e))
    
    def stop_service(self, key: str) -> ServiceStartResult:
        """Stop a service."""
        sp = self.processes.get(key)
        if not sp:
            return ServiceStartResult(False, error="Service not found")
        
        try:
            sp.stop(graceful=True)
            if self.on_service_stopped:
                self.on_service_stopped(key)
            return ServiceStartResult(True)
        except Exception as e:
            return ServiceStartResult(False, error=str(e))
    
    def start_all(self) -> Dict[str, ServiceStartResult]:
        """Start all services in dependency order - pure algorithm."""
        results = {}
        started = set()
        max_iterations = len(self.processes) * 2
        iteration = 0
        
        while iteration < max_iterations:
            made_progress = False
            
            for key, sp in self.processes.items():
                if key in started or sp.running:
                    continue
                
                if not sp.tool_available:
                    started.add(key)
                    continue
                
                # Check if dependencies are met
                if self._dependencies_met(key, started):
                    result = self.start_service(key)
                    results[key] = result
                    if result.success:
                        started.add(key)
                        made_progress = True
            
            if not made_progress:
                break
            
            iteration += 1
        
        return results
    
    def _check_dependencies(self, key: str) -> List[str]:
        """Check which dependencies are missing."""
        sp = self.processes.get(key)
        if not sp or not sp.defn.depends_on:
            return []
        
        missing = []
        for dep_key in sp.defn.depends_on:
            dep_process = self.processes.get(dep_key)
            if not dep_process or not dep_process.running:
                missing.append(dep_key)
        
        return missing
    
    def _dependencies_met(self, key: str, started: set) -> bool:
        """Check if all dependencies for a service have been started."""
        sp = self.processes.get(key)
        if not sp or not sp.defn.depends_on:
            return True
        
        return all(dep in started for dep in sp.defn.depends_on)
```

### Benefits of ProcessManager

✅ **No Qt imports** - Can be tested with pytest without PySide6
✅ **Testable** - Pure functions with inputs/outputs
✅ **Reusable** - Can use in CLI, REST API, web app, etc.
✅ **Clear API** - Methods return results, emit callbacks
✅ **Callback-based** - Works with any UI framework

### Usage in Tests

```python
# tests/test_process_manager.py - NO Qt NEEDED!
import pytest
from launcher_gui.services.process_manager import ProcessManager

def test_start_service_missing_tool(mock_process):
    """Test that starting without tool available fails gracefully."""
    mock_process.tool_available = False
    mock_process.tool_check_message = "Docker not found"
    
    pm = ProcessManager({"backend": mock_process})
    result = pm.start_service("backend")
    
    assert not result.success
    assert "Docker not found" in result.error
    # No Qt required! Pure Python testing.
```

---

## Phase 2: Replace Qt Framework Dependencies

### Current Problem: processes.py Uses QProcess

```python
from PySide6.QtCore import QProcess, QTimer

class ServiceProcess:
    def start(self):
        self.proc = QProcess()  # ← Qt-specific, inflexible
        self.proc.start(self.defn.program, self.defn.args)
```

### Solution: Use subprocess (Standard Library)

**File: `launcher_gui/services/service_process.py`**

```python
"""
Service process management using standard library (not Qt).
"""
import subprocess
import threading
import time
from typing import Optional, Callable
import os

from ..services import ServiceDef


class ServiceProcess:
    """Manages a single service process."""
    
    def __init__(self, defn: ServiceDef):
        self.defn = defn
        self.proc: Optional[subprocess.Popen] = None  # ← Standard library
        self.running = False
        self.log_buffer: list[str] = []
        self._log_monitor_thread: Optional[threading.Thread] = None
        self._stop_log_monitor = False
        
        # Callbacks instead of Qt signals
        self.on_stdout: Optional[Callable[[str], None]] = None
        self.on_stderr: Optional[Callable[[str], None]] = None
    
    def start(self) -> bool:
        """Start the service process."""
        if self.running:
            return False
        
        try:
            env = os.environ.copy()
            if self.defn.env_overrides:
                env.update(self.defn.env_overrides)
            
            # Use subprocess instead of QProcess
            self.proc = subprocess.Popen(
                [self.defn.program] + self.defn.args,
                cwd=self.defn.cwd,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1  # Line buffered
            )
            
            self.running = True
            
            # Start log monitor in background thread
            self._start_log_monitor()
            
            return True
        except Exception as e:
            if self.on_stderr:
                self.on_stderr(f"Failed to start: {str(e)}")
            return False
    
    def stop(self, graceful: bool = True) -> bool:
        """Stop the service process."""
        if not self.running or not self.proc:
            return False
        
        self._stop_log_monitor = True
        
        try:
            if graceful:
                self.proc.terminate()
                try:
                    self.proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.proc.kill()
            else:
                self.proc.kill()
            
            self.running = False
            return True
        except Exception:
            return False
    
    def _start_log_monitor(self):
        """Start monitoring logs in background thread (not Qt)."""
        self._stop_log_monitor = False
        self._log_monitor_thread = threading.Thread(
            target=self._monitor_logs,
            daemon=True
        )
        self._log_monitor_thread.start()
    
    def _monitor_logs(self):
        """Monitor process output in background thread."""
        if not self.proc:
            return
        
        # Monitor stdout
        while not self._stop_log_monitor and self.running:
            try:
                # Use select or polling to avoid blocking
                # This is simplified; in production use more sophisticated approach
                line = self.proc.stdout.readline() if self.proc.stdout else ""
                if line:
                    self.log_buffer.append(line.rstrip())
                    if self.on_stdout:
                        self.on_stdout(line.rstrip())
                else:
                    time.sleep(0.1)
            except Exception:
                break
```

### Benefits

✅ **No Qt framework** - Pure Python subprocess
✅ **Standard library** - subprocess is built-in
✅ **Reusable** - Works in any Python application
✅ **Testable** - Can mock subprocess.Popen in tests
✅ **Flexible** - Not tied to Qt's threading model

---

## Phase 3: Extract Health Checking (No Qt Signals)

### Current Problem: Uses QThread and Qt Signals

```python
from PySide6.QtCore import QThread, Signal

class HealthWorker(QThread):
    health_update = Signal(str, HealthStatus)  # ← Qt-specific
    
    def run(self):
        self.health_update.emit(key, status)  # ← Qt signal emission
```

### Solution: Use threading.Thread with Callbacks

**File: `launcher_gui/services/health_manager.py`**

```python
"""
Health checking - pure Python, no Qt framework.
"""
import threading
import time
from typing import Dict, Callable, Optional

from ..status import HealthStatus


class HealthManager:
    """Monitors service health in background thread."""
    
    def __init__(
        self,
        processes: Dict[str, object],
        on_health_changed: Optional[Callable[[str, HealthStatus], None]] = None,
        interval: float = 2.0
    ):
        self.processes = processes
        self.on_health_changed = on_health_changed
        self.interval = interval
        
        self._monitor_thread: Optional[threading.Thread] = None
        self._stop = False
        self.failure_counts: Dict[str, int] = {}
    
    def start(self):
        """Start health monitoring."""
        self._stop = False
        self._monitor_thread = threading.Thread(
            target=self._run,
            daemon=True
        )
        self._monitor_thread.start()
    
    def stop(self):
        """Stop health monitoring."""
        self._stop = True
        if self._monitor_thread:
            self._monitor_thread.join(timeout=5)
    
    def _run(self):
        """Health monitoring loop."""
        while not self._stop:
            for key, sp in self.processes.items():
                status = self._check_health(sp)
                
                # Emit callback instead of Qt signal
                if self.on_health_changed:
                    self.on_health_changed(key, status)
            
            time.sleep(self.interval)
    
    def _check_health(self, service_process) -> HealthStatus:
        """Check health of a single service."""
        if not service_process.running:
            return HealthStatus.STOPPED
        
        if hasattr(service_process.defn, 'health_url') and service_process.defn.health_url:
            # Try HTTP health check
            try:
                import requests
                response = requests.get(
                    service_process.defn.health_url,
                    timeout=2
                )
                if response.status_code == 200:
                    self.failure_counts[service_process.defn.key] = 0
                    return HealthStatus.HEALTHY
            except Exception:
                pass
            
            # Track failures
            key = service_process.defn.key
            self.failure_counts[key] = self.failure_counts.get(key, 0) + 1
            
            if self.failure_counts[key] >= 5:
                return HealthStatus.UNHEALTHY
            else:
                return HealthStatus.STARTING
        
        return HealthStatus.UNKNOWN
```

### Benefits

✅ **No Qt framework** - Pure threading.Thread
✅ **Standard library** - threading is built-in
✅ **Simple callbacks** - Easy to connect to any UI
✅ **Testable** - Mock the callback in tests
✅ **Flexible** - Not tied to Qt's event loop

---

## Phase 4: Update UI to Use These Services

### New UI Code (launcher.py - Simplified)

```python
from PySide6.QtWidgets import QWidget

from .services.process_manager import ProcessManager
from .services.health_manager import HealthManager


class LauncherWindow(QWidget):
    def __init__(self):
        super().__init__()
        
        # Create business logic layer
        self.process_manager = ProcessManager(self.processes)
        self.process_manager.on_error = self._on_process_error  # Callback
        
        self.health_manager = HealthManager(
            self.processes,
            on_health_changed=self._on_health_changed  # Callback
        )
        
        self._init_ui()
        
        # Start health monitoring
        self.health_manager.start()
    
    def _on_button_start_clicked(self, service_key: str):
        """Handle UI button click - calls business logic."""
        # Business logic handles everything
        result = self.process_manager.start_service(service_key)
        
        if not result.success:
            # UI just displays the error
            self._show_error(result.error)
    
    def _on_health_changed(self, key: str, status: HealthStatus):
        """Callback from HealthManager - update UI."""
        card = self.cards.get(key)
        if card:
            card.update_status(status)  # Just update display
    
    def _on_process_error(self, key: str, error: str):
        """Callback from ProcessManager - show error."""
        self._show_error(f"{key}: {error}")
```

### Benefits

✅ **Separation of concerns** - UI only handles display
✅ **Testable** - Business logic works without UI
✅ **Reusable** - Services can be used by CLI, web API, etc.
✅ **Clear flow** - UI → Business logic → Infrastructure
✅ **Easy to maintain** - Each layer has clear responsibility

---

## Testing the Decoupled Code

### Test Example 1: ProcessManager (No Qt!)

```python
# tests/test_process_manager.py
import pytest
from unittest.mock import Mock, MagicMock
from launcher_gui.services.process_manager import ProcessManager


def test_start_service_with_missing_dependency():
    """Test dependency checking - NO Qt required!"""
    # Create mock processes
    mock_backend = Mock()
    mock_backend.running = False
    mock_backend.tool_available = True
    mock_backend.defn.depends_on = ["db"]
    
    mock_db = Mock()
    mock_db.running = False  # DB not running
    mock_db.tool_available = True
    mock_db.defn.depends_on = []
    
    # Create manager
    pm = ProcessManager({"backend": mock_backend, "db": mock_db})
    
    # Try to start backend (should fail - db not running)
    result = pm.start_service("backend")
    
    assert not result.success
    assert "Dependencies" in result.error
    assert not mock_backend.start.called  # Should not call start()
```

### Test Example 2: HealthManager (No Qt!)

```python
# tests/test_health_manager.py
import pytest
from unittest.mock import Mock
from launcher_gui.services.health_manager import HealthManager
from launcher_gui.status import HealthStatus


def test_health_monitoring_updates_callback():
    """Test health monitoring - NO Qt required!"""
    # Create mock process
    mock_process = Mock()
    mock_process.running = True
    mock_process.defn.key = "backend"
    mock_process.defn.health_url = "http://localhost:8001/health"
    
    # Track callback invocations
    health_updates = []
    def on_health_changed(key, status):
        health_updates.append((key, status))
    
    # Create manager
    hm = HealthManager(
        {"backend": mock_process},
        on_health_changed=on_health_changed,
        interval=0.1
    )
    
    # Start monitoring
    hm.start()
    
    # Wait a bit
    import time
    time.sleep(0.3)
    
    # Check that callback was called
    assert len(health_updates) > 0
    hm.stop()
```

---

## Summary: Before vs After

### Before: Tightly Coupled

```
launcher.py (1,452 lines)
├─ UI code (300 lines)
├─ Business logic (400 lines) ← Mixed with UI!
├─ PySide6 imports throughout
└─ Not testable without Qt framework

processes.py
├─ from PySide6.QtCore import QProcess, QTimer
└─ Can't reuse outside Qt

health_worker.py
├─ from PySide6.QtCore import QThread, Signal
└─ Can't reuse outside Qt
```

### After: Decoupled

```
launcher.py (600 lines)
├─ UI code only
├─ Calls ProcessManager, HealthManager
└─ Easy to test by mocking services

services/process_manager.py
├─ Pure Python (no Qt imports)
├─ Testable with pytest
└─ Reusable in CLI, REST API, etc.

services/health_manager.py
├─ Pure Python (no Qt imports)
├─ Uses threading (standard library)
└─ Works with any UI framework

services/service_process.py
├─ Uses subprocess (standard library)
├─ No Qt dependencies
└─ Reusable everywhere
```

---

## Migration Path

1. **Create services/ directory** with business logic classes
2. **Extract ProcessManager** - move start/stop/restart logic
3. **Extract HealthManager** - move health checking logic
4. **Update processes.py** - remove QProcess/QTimer dependencies
5. **Update launcher.py** - call services, handle callbacks
6. **Add tests** - pure Python unit tests (no Qt needed)
7. **Verify** - ensure all functionality still works
8. **Remove old code** - clean up Qt-dependent implementations

---

## Benefits Summary

✅ **Testable** - Pure Python logic testable without PySide6
✅ **Reusable** - Use business logic in CLI, REST API, web UI
✅ **Maintainable** - Clear separation of concerns
✅ **Extensible** - Easy to add new features (logging, analytics, etc.)
✅ **Flexible** - Could replace PySide6 with different UI framework
✅ **Professional** - Industry-standard layered architecture

