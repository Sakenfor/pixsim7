"""Service lifecycle mixin.

Extracts service start/stop/restart, bulk operations, database management,
and port editing from ``LauncherWindow``.
"""
import os
import time
from PySide6.QtWidgets import QMessageBox
from PySide6.QtCore import QTimer
from ..logger import launcher_logger as _launcher_logger
try:
    from ..config import ROOT, read_env_ports, write_env_ports, save_ui_state
    from ..status import HealthStatus
    from ..docker_utils import compose_down
    from ..services import build_services_from_manifests
    from ..dialogs.ports_dialog import show_ports_dialog
except ImportError:
    from config import ROOT, read_env_ports, write_env_ports, save_ui_state
    from status import HealthStatus
    from docker_utils import compose_down
    from services import build_services_from_manifests
    from dialogs.ports_dialog import show_ports_dialog


class ServiceLifecycleMixin:
    def _start_service(self, key: str):
        """Start a specific service."""
        sp = self.processes.get(key)
        if not sp:
            return
        if not sp.tool_available:
            QMessageBox.warning(self, 'Tool Not Available', sp.tool_check_message)
            if _launcher_logger:
                try:
                    _launcher_logger.warning("service_blocked_start", service_key=key, reason=sp.tool_check_message)
                except Exception:
                    pass
            return

        # Check dependencies before starting
        missing_dep_keys = self._missing_dependency_keys(key)
        if missing_dep_keys:
            missing_deps = []
            for dep_key in missing_dep_keys:
                dep_service = next((s for s in self.services if s.key == dep_key), None)
                dep_title = dep_service.title if dep_service else dep_key
                missing_deps.append(dep_title)

            deps_list = ", ".join(missing_deps)
            service_title = sp.defn.title
            QMessageBox.warning(
                self,
                'Missing Dependencies',
                f'{service_title} requires these services to be running first:\n\n{deps_list}\n\nPlease start them before starting {service_title}.'
            )
            if _launcher_logger:
                try:
                    _launcher_logger.warning("service_blocked_dependencies", service_key=key, missing=missing_deps)
                except Exception:
                    pass
            return

        self._clear_auto_restart_state(key, clear_cooldown=True)

        if sp.start():
            self._refresh_console_logs()
            # Log service start
            if _launcher_logger:
                try:
                    pid = getattr(sp, "started_pid", None)
                    _launcher_logger.info("service_started", service_key=key, pid=pid)
                except Exception:
                    pass

    def _stop_service(self, key: str):
        """Stop a specific service."""
        sp = self.processes.get(key)
        if not sp:
            return
        self._begin_async_stop(key, graceful=True, from_bulk=False)

    def _force_stop_service(self, key: str):
        """Force stop a specific service (kill all processes)."""
        sp = self.processes.get(key)
        if not sp:
            return
        self._begin_async_stop(key, graceful=False, from_bulk=False)

    def _begin_async_stop(self, key: str, graceful: bool, *, from_bulk: bool) -> bool:
        """Dispatch service stop work to a background thread."""
        sp = self.processes.get(key)
        if not sp:
            return False
        if key in self._stop_in_progress_keys:
            return False

        self._clear_auto_restart_state(key, clear_cooldown=True)
        self._stop_in_progress_keys.add(key)
        if from_bulk:
            self._bulk_stop_pending_keys.add(key)

        card = self.cards.get(key)
        if card and hasattr(card, "set_stopping"):
            try:
                card.set_stopping(True)
            except Exception:
                pass

        from ..launcher import ServiceStopWorker
        worker = ServiceStopWorker(key, sp, graceful, self)
        self._active_stop_workers[key] = worker
        worker.stop_finished.connect(self._on_async_stop_finished)
        worker.finished.connect(worker.deleteLater)
        worker.start()
        return True

    def _on_async_stop_finished(self, key: str, graceful: bool, still_running: bool, error: str):
        """Handle completion of async stop work on the UI thread."""
        self._stop_in_progress_keys.discard(key)
        worker = self._active_stop_workers.pop(key, None)
        if worker:
            try:
                worker.stop_finished.disconnect(self._on_async_stop_finished)
            except Exception:
                pass

        card = self.cards.get(key)
        if card and hasattr(card, "set_stopping"):
            try:
                card.set_stopping(False)
            except Exception:
                pass

        sp = self.processes.get(key)
        if sp:
            if still_running:
                sp.running = True
                status = getattr(sp, "health_status", HealthStatus.UNHEALTHY)
                if status == HealthStatus.STOPPED:
                    status = HealthStatus.UNHEALTHY
                self._update_service_health(key, status)
            else:
                sp.running = False
                self._update_service_health(key, HealthStatus.STOPPED)

        if _launcher_logger:
            try:
                if error:
                    _launcher_logger.error(
                        "service_stop_failed_async",
                        service_key=key,
                        graceful=graceful,
                        error=error,
                    )
                elif still_running:
                    _launcher_logger.warning(
                        "service_stop_requested_still_running",
                        service_key=key,
                        graceful=graceful,
                        health_status=getattr(getattr(sp, "health_status", None), "value", str(getattr(sp, "health_status", None))) if sp else None,
                    )
                elif graceful:
                    _launcher_logger.info("service_stopped", service_key=key)
                else:
                    _launcher_logger.info("service_force_stopped", service_key=key)
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
        sp = self.processes.get(key)
        if not sp or not sp.running:
            return

        service_title = next((s.title for s in self.services if s.key == key), key)
        if _launcher_logger:
            try:
                _launcher_logger.info("service_restart", service_key=key)
            except Exception:
                pass

        # Stop asynchronously, then restart when stop completes.
        if self._begin_async_stop(key, graceful=True, from_bulk=False):
            QTimer.singleShot(250, lambda: self._restart_when_stopped(key))

    def _restart_when_stopped(self, key: str):
        """Wait until stop operation finishes, then perform delayed restart."""
        if key in self._stop_in_progress_keys:
            QTimer.singleShot(250, lambda: self._restart_when_stopped(key))
            return
        QTimer.singleShot(400, lambda: self._delayed_restart(key))

    def _delayed_restart(self, key: str):
        """Restart service after a short delay."""
        sp = self.processes.get(key)
        if sp and sp.tool_available:
            self._clear_auto_restart_state(key, clear_cooldown=True)
            sp.start()
            self._refresh_console_logs()

    def start_all(self):
        """Start all services in dependency order."""
        # Disable bulk buttons and update status during operation
        self._set_bulk_buttons_enabled(False)
        self.status_label.setText("Starting all services...")

        # Build dependency graph and start in correct order
        started = set()
        if getattr(self.ui_state, "use_local_datastores", False):
            started.add("db")

        def can_start(service_key):
            """Check if a service's dependencies are satisfied."""
            sp = self.processes.get(service_key)
            if not sp or not sp.tool_available:
                return False
            if sp.defn.depends_on:
                return all(dep in started for dep in sp.defn.depends_on)
            return True

        # Keep trying to start services until no more can be started
        max_iterations = len(self.processes) * 2  # Prevent infinite loops
        iteration = 0

        while iteration < max_iterations:
            made_progress = False

            for key, sp in self.processes.items():
                if key in started or sp.running:
                    continue

                if key == "db" and getattr(self.ui_state, "use_local_datastores", False):
                    started.add(key)
                    continue

                if not sp.tool_available:
                    if _launcher_logger:
                        try:
                            _launcher_logger.info("service_skip_start", service_key=key, reason=sp.tool_check_message)
                        except Exception:
                            pass
                    started.add(key)  # Mark as "started" to avoid retrying
                    continue

                if can_start(key):
                    sp.start()
                    started.add(key)
                    made_progress = True

            if not made_progress:
                break  # No more services can be started

            iteration += 1

        self._refresh_console_logs()
        # Re-enable buttons and restore status after a short delay
        QTimer.singleShot(500, lambda: (
            self._set_bulk_buttons_enabled(True),
            self._restore_status_label()
        ))

    def stop_all(self, synchronous: bool = False):
        if synchronous:
            self._bulk_stop_active = True
            self._bulk_stop_until = time.monotonic() + 8.0
            try:
                for key, sp in self.processes.items():
                    self._clear_auto_restart_state(key, clear_cooldown=True)
                    sp.stop(graceful=True)
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
        for key, sp in self.processes.items():
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
        """Stop all services with confirmation dialog."""
        # Count running services
        running_count = sum(1 for sp in self.processes.values() if sp.running)
        if running_count == 0:
            return

        reply = QMessageBox.question(
            self, 'Confirm Stop All',
            f'Stop all {running_count} running service{"s" if running_count != 1 else ""}?',
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            # Disable bulk buttons and update status during operation
            self._set_bulk_buttons_enabled(False)
            self.status_label.setText("Stopping all services...")
            self.stop_all()

    def _restart_all(self):
        """Restart all currently running services."""
        running_keys = [k for k, sp in self.processes.items() if sp.running]
        if not running_keys:
            return

        reply = QMessageBox.question(
            self, 'Confirm Restart All',
            f'Restart all {len(running_keys)} running service{"s" if len(running_keys) != 1 else ""}?',
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            if _launcher_logger:
                try:
                    _launcher_logger.info("restart_all", count=len(running_keys))
                except Exception:
                    pass

            # Disable bulk buttons and update status during operation
            self._set_bulk_buttons_enabled(False)
            self.status_label.setText("Restarting all services...")

            # Stop all running services
            self.stop_all()

            # Wait before restarting
            QTimer.singleShot(2000, lambda: self._delayed_restart_all(running_keys))

    def _delayed_restart_all(self, keys):
        """Restart services after delay."""
        if any(key in self._stop_in_progress_keys for key in keys):
            QTimer.singleShot(300, lambda: self._delayed_restart_all(keys))
            return

        for key in keys:
            sp = self.processes.get(key)
            if sp and sp.tool_available:
                sp.start()
        self._refresh_console_logs()
        # Re-enable buttons and restore status after restart
        QTimer.singleShot(500, lambda: (
            self._set_bulk_buttons_enabled(True),
            self._restore_status_label()
        ))

    def stop_databases(self):
        """Stop databases using docker-compose down."""
        try:
            if _launcher_logger:
                try:
                    _launcher_logger.info('stop_databases_start')
                except Exception:
                    pass
            ok, out = compose_down(os.path.join(ROOT, 'docker-compose.db-only.yml'))
            if ok:
                if _launcher_logger:
                    try:
                        _launcher_logger.info('stop_databases_success')
                    except Exception:
                        pass
                self.notify('Databases have been stopped.')
                # Update DB process status
                if 'db' in self.processes:
                    self.processes['db'].running = False
                    self.processes['db'].health_status = HealthStatus.STOPPED
            else:
                if _launcher_logger:
                    try:
                        _launcher_logger.error('stop_databases_failed', error=out)
                    except Exception:
                        pass
                QMessageBox.warning(self, 'Error', f'Failed to stop databases:\n{out}')
        except Exception as e:
            if _launcher_logger:
                try:
                    _launcher_logger.error('stop_databases_exception', error=str(e))
                except Exception:
                    pass
            QMessageBox.warning(self, 'Error', f'Failed to stop databases: {e}')

    def edit_ports(self):
        """Open ports editor dialog."""
        current = read_env_ports()
        result = show_ports_dialog(self, current)
        if result is not None:
            try:
                write_env_ports(result)
                self.update_ports_label()
                if _launcher_logger:
                    try:
                        _launcher_logger.info('ports_updated', ports=str(result))
                    except Exception:
                        pass

                # Ask if user wants to restart affected services
                reply = QMessageBox.question(
                    self, 'Restart Services?',
                    'Port configuration saved. Restart running services to apply changes?',
                    QMessageBox.Yes | QMessageBox.No
                )
                if reply == QMessageBox.Yes:
                    # Rebuild services and restart running ones
                    running_keys = [k for k, sp in self.processes.items() if sp.running]
                    self.stop_all(synchronous=True)
                    QTimer.singleShot(2000, lambda: self._restart_services(running_keys))
            except Exception as e:
                QMessageBox.critical(self, 'Error', f'Failed to save ports: {e}')
                if _launcher_logger:
                    try:
                        _launcher_logger.error('ports_update_failed', error=str(e))
                    except Exception:
                        pass

    def _restart_services(self, keys):
        """Restart specified services after config update."""
        # Stop health bridge before rebuilding processes to avoid race condition
        if hasattr(self, 'health_bridge'):
            try:
                self.health_bridge.stop()
            except Exception:
                pass

        # Rebuild services and processes
        self.services = build_services_from_manifests()
        self._rebuild_processes_from_services(preserve_state=True)

        # Start requested services
        for key in keys:
            if key in self.processes:
                self.processes[key].start()

        # Restart health bridge with new process dict
        self.health_bridge.rebuild_states(self.processes)
        self.health_bridge.start()

        # Rebind existing cards to the rebuilt process instances.
        for key, card in self.cards.items():
            sp = self.processes.get(key)
            if not sp:
                continue
            card.service_process = sp
            try:
                card.update_status(sp.health_status)
            except Exception:
                pass

        # Schedule deferred init for new worker processes
        for sp in self.processes.values():
            schedule = getattr(sp, "schedule_deferred_init", None)
            if callable(schedule):
                schedule()

        # Update UI (cards will be updated via health_update signals)
        self._refresh_db_logs()
