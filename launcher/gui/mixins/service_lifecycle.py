"""Service lifecycle mixin.

Extracts service start/stop/restart, bulk operations, database management,
and port editing from ``LauncherWindow``.

All process management goes through ``self.facade`` (LauncherFacade).
"""
import os
import time
import threading
from PySide6.QtWidgets import QMessageBox
from PySide6.QtCore import QTimer, Signal, QMetaObject, Qt, Q_ARG, Slot
from ..logger import launcher_logger as _launcher_logger
try:
    from ..config import ROOT, read_env_ports, write_env_ports, save_ui_state
    from ..status import HealthStatus
    from ..docker_utils import compose_down
    from ..services import build_services_from_manifests
    from ..dialogs.ports_dialog import show_ports_dialog
    from ..widgets.service_card_state import build_card_state
except ImportError:
    from config import ROOT, read_env_ports, write_env_ports, save_ui_state
    from status import HealthStatus
    from docker_utils import compose_down
    from services import build_services_from_manifests
    from dialogs.ports_dialog import show_ports_dialog
    from widgets.service_card_state import build_card_state


def _is_running(state) -> bool:
    return state.status.value in ("running", "starting")


class ServiceLifecycleMixin:
    def _start_service(self, key: str):
        """Start a specific service."""
        # Embedded API: control the in-process uvicorn server
        if key == "launcher-api":
            self.start_embedded_api()
            return

        state = self.processes.get(key)
        if not state:
            return
        if not state.tool_available:
            QMessageBox.warning(self, 'Tool Not Available', state.tool_check_message)
            return

        missing_dep_keys = self._missing_dependency_keys(key)
        if missing_dep_keys:
            missing_deps = []
            for dep_key in missing_dep_keys:
                dep_service = next((s for s in self.services if s.key == dep_key), None)
                missing_deps.append(dep_service.title if dep_service else dep_key)
            deps_list = ", ".join(missing_deps)
            title = state.definition.title
            QMessageBox.warning(
                self, 'Missing Dependencies',
                f'{title} requires these services to be running first:\n\n{deps_list}'
            )
            return

        self._clear_auto_restart_state(key, clear_cooldown=True)

        # Clear previous log buffer on start/restart (if enabled)
        if getattr(self.ui_state, 'clear_logs_on_restart', True):
            try:
                state.log_buffer.clear()
            except Exception:
                pass

        if self.facade.start_service(key):
            self._refresh_console_logs()
            if _launcher_logger:
                try:
                    _launcher_logger.info("service_started", service_key=key, pid=state.pid)
                except Exception:
                    pass

    def _stop_service(self, key: str):
        """Stop a specific service."""
        if key == "launcher-api":
            self.stop_embedded_api()
            self._update_service_health(key, HealthStatus.STOPPED)
            return
        if not self.processes.get(key):
            return
        self._begin_async_stop(key, graceful=True, from_bulk=False)

    def _force_stop_service(self, key: str):
        """Force stop a specific service."""
        if key == "launcher-api":
            self.stop_embedded_api()
            self._update_service_health(key, HealthStatus.STOPPED)
            return
        if not self.processes.get(key):
            return
        self._begin_async_stop(key, graceful=False, from_bulk=False)

    def _begin_async_stop(self, key: str, graceful: bool, *, from_bulk: bool) -> bool:
        """Dispatch service stop to a background thread."""
        if key in self._stop_in_progress_keys:
            return False

        self._clear_auto_restart_state(key, clear_cooldown=True)
        self._stop_in_progress_keys.add(key)
        if from_bulk:
            self._bulk_stop_pending_keys.add(key)

        # Update card to show stopping state
        state = self.processes.get(key)
        card = self.cards.get(key)
        if card and state:
            try:
                card.apply_state(build_card_state(state, stopping=True))
            except Exception:
                pass

        # Run stop in a daemon thread to keep UI responsive.
        # Temporarily disconnect facade event signals to avoid cross-thread
        # Qt signal emission deadlocks during the stop operation.
        window = self

        def _do_stop():
            try:
                window.facade.stop_service(key, graceful=graceful)
            except Exception:
                pass
            # Dispatch completion to main thread
            QMetaObject.invokeMethod(
                window, "_on_stop_finished_slot",
                Qt.QueuedConnection,
                Q_ARG(str, key),
                Q_ARG(bool, graceful),
            )

        t = threading.Thread(target=_do_stop, daemon=True, name=f"stop-{key}")
        t.start()
        return True

    @Slot(str, bool)
    def _on_stop_finished_slot(self, key: str, graceful: bool):
        """Qt slot for cross-thread dispatch from _do_stop."""
        self._on_stop_finished(key, graceful)

    def _on_stop_finished(self, key: str, graceful: bool):
        """Handle stop completion on the main thread."""
        self._stop_in_progress_keys.discard(key)

        state = self.processes.get(key)
        still_running = bool(state and _is_running(state))

        if state:
            status = state.health if still_running else HealthStatus.STOPPED
            self._update_service_health(key, status)

        if _launcher_logger:
            try:
                if still_running:
                    _launcher_logger.warning("service_stop_requested_still_running",
                                             service_key=key, graceful=graceful)
                else:
                    _launcher_logger.info("service_stopped", service_key=key)
            except Exception:
                pass

        if key in self._bulk_stop_pending_keys:
            self._bulk_stop_pending_keys.discard(key)
        if self._bulk_stop_active and not self._bulk_stop_pending_keys:
            self._bulk_stop_active = False
            self._bulk_stop_until = max(self._bulk_stop_until, time.monotonic() + 3.0)
            self._set_bulk_buttons_enabled(True)
            self._restore_status_label()

        self._refresh_console_logs()

    def _restart_service(self, key: str):
        """Restart a specific service."""
        state = self.processes.get(key)
        if not state or not _is_running(state):
            return
        if _launcher_logger:
            try:
                _launcher_logger.info("service_restart", service_key=key)
            except Exception:
                pass
        if self._begin_async_stop(key, graceful=True, from_bulk=False):
            QTimer.singleShot(250, lambda: self._restart_when_stopped(key))

    def _restart_when_stopped(self, key: str):
        if key in self._stop_in_progress_keys:
            QTimer.singleShot(250, lambda: self._restart_when_stopped(key))
            return
        QTimer.singleShot(400, lambda: self._delayed_restart(key))

    def _delayed_restart(self, key: str):
        state = self.processes.get(key)
        if state and state.tool_available:
            self._clear_auto_restart_state(key, clear_cooldown=True)
            self.facade.start_service(key)
            self._refresh_console_logs()

    def start_all(self):
        """Start all services in dependency order."""
        self._set_bulk_buttons_enabled(False)
        self.status_label.setText("Starting all services...")

        started = set()
        if getattr(self.ui_state, "use_local_datastores", False):
            started.add("db")

        def can_start(k):
            state = self.processes.get(k)
            if not state or not state.tool_available:
                return False
            deps = getattr(state.definition, "depends_on", None) or []
            return all(d in started for d in deps)

        max_iterations = len(self.processes) * 2
        for _ in range(max_iterations):
            made_progress = False
            for key, state in self.processes.items():
                if key in started or _is_running(state):
                    continue
                if key == "db" and getattr(self.ui_state, "use_local_datastores", False):
                    started.add(key)
                    continue
                if not state.tool_available:
                    started.add(key)
                    continue
                if can_start(key):
                    self.facade.start_service(key)
                    started.add(key)
                    made_progress = True
            if not made_progress:
                break

        self._refresh_console_logs()
        QTimer.singleShot(500, lambda: (
            self._set_bulk_buttons_enabled(True),
            self._restore_status_label()
        ))

    def stop_all(self, synchronous: bool = False):
        if synchronous:
            self._bulk_stop_active = True
            self._bulk_stop_until = time.monotonic() + 8.0
            try:
                for key in self.processes:
                    self._clear_auto_restart_state(key, clear_cooldown=True)
                    self.facade.stop_service(key, graceful=True)
                self._refresh_console_logs()
            finally:
                self._bulk_stop_active = False
                self._bulk_stop_pending_keys.clear()
                self._bulk_stop_until = max(self._bulk_stop_until, time.monotonic() + 3.0)
            return

        self._bulk_stop_active = True
        self._bulk_stop_until = time.monotonic() + 20.0
        self._bulk_stop_pending_keys.clear()
        dispatched = False
        for key in self.processes:
            self._clear_auto_restart_state(key, clear_cooldown=True)
            if self._begin_async_stop(key, graceful=True, from_bulk=True):
                dispatched = True
        self._refresh_console_logs()
        if not dispatched:
            self._bulk_stop_active = False
            self._bulk_stop_until = max(self._bulk_stop_until, time.monotonic() + 3.0)
            self._set_bulk_buttons_enabled(True)
            self._restore_status_label()

    def _stop_all_with_confirmation(self):
        running_count = sum(1 for s in self.processes.values() if _is_running(s))
        if running_count == 0:
            return
        reply = QMessageBox.question(
            self, 'Confirm Stop All',
            f'Stop all {running_count} running service{"s" if running_count != 1 else ""}?',
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            self._set_bulk_buttons_enabled(False)
            self.status_label.setText("Stopping all services...")
            self.stop_all()

    def _restart_all(self):
        running_keys = [k for k, s in self.processes.items() if _is_running(s)]
        if not running_keys:
            return
        reply = QMessageBox.question(
            self, 'Confirm Restart All',
            f'Restart all {len(running_keys)} running service{"s" if len(running_keys) != 1 else ""}?',
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            self._set_bulk_buttons_enabled(False)
            self.status_label.setText("Restarting all services...")
            self.stop_all()
            QTimer.singleShot(2000, lambda: self._delayed_restart_all(running_keys))

    def _delayed_restart_all(self, keys):
        if any(key in self._stop_in_progress_keys for key in keys):
            QTimer.singleShot(300, lambda: self._delayed_restart_all(keys))
            return
        for key in keys:
            state = self.processes.get(key)
            if state and state.tool_available:
                self.facade.start_service(key)
        self._refresh_console_logs()
        QTimer.singleShot(500, lambda: (
            self._set_bulk_buttons_enabled(True),
            self._restore_status_label()
        ))

    def stop_databases(self):
        """Stop databases using docker-compose down."""
        try:
            ok, out = compose_down(os.path.join(ROOT, 'docker-compose.db-only.yml'))
            if ok:
                self.notify('Databases have been stopped.')
                db_state = self.processes.get('db')
                if db_state:
                    from launcher.core.types import ServiceStatus
                    db_state.status = ServiceStatus.STOPPED
                    db_state.health = HealthStatus.STOPPED
            else:
                QMessageBox.warning(self, 'Error', f'Failed to stop databases:\n{out}')
        except Exception as e:
            QMessageBox.warning(self, 'Error', f'Failed to stop databases: {e}')

    def edit_ports(self):
        """Open ports editor dialog."""
        current = read_env_ports()
        result = show_ports_dialog(self, current)
        if result is not None:
            try:
                write_env_ports(result)
                self.update_ports_label()
                reply = QMessageBox.question(
                    self, 'Restart Services?',
                    'Port configuration saved. Restart running services to apply changes?',
                    QMessageBox.Yes | QMessageBox.No
                )
                if reply == QMessageBox.Yes:
                    running_keys = [k for k, s in self.processes.items() if _is_running(s)]
                    self.stop_all(synchronous=True)
                    QTimer.singleShot(2000, lambda: self._restart_services(running_keys))
            except Exception as e:
                QMessageBox.critical(self, 'Error', f'Failed to save ports: {e}')

    def _restart_services(self, keys):
        """Restart specified services after config update."""
        # Stop managers before rebuild
        self.facade.stop_all_managers()

        # Rebuild facade with new service definitions
        from .launcher_facade import LauncherFacade
        self.facade = LauncherFacade(parent=self)
        self.processes = self.facade.process_mgr.states

        # Reconnect signals
        self.facade.health_update.connect(self._update_service_health)
        self.facade.process_started.connect(
            lambda k, d: self._update_service_health(k, HealthStatus.STARTING))
        self.facade.process_stopped.connect(
            lambda k, d: self._update_service_health(k, HealthStatus.STOPPED))

        # Start requested services
        for key in keys:
            if key in self.processes:
                self.facade.start_service(key)

        self.facade.start_all_managers()

        # Refresh cards
        for key, card in self.cards.items():
            state = self.processes.get(key)
            if state:
                try:
                    card.apply_state(build_card_state(state))
                except Exception:
                    pass

        self._refresh_db_logs()
