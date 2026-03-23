"""Console interaction mixin.

Extracts link click handling, field action popups, filter/style change
callbacks, scroll tracking, pause/resume, and attach-logs from
``LauncherWindow``.
"""
import webbrowser
import traceback
from PySide6.QtWidgets import QApplication, QMenu
from PySide6.QtCore import Qt, QTimer, QUrl
from PySide6.QtGui import QAction, QCursor
from urllib.parse import quote
from ..logger import launcher_logger as _launcher_logger
try:
    from ..config import save_ui_state
    from ..clickable_fields import get_field, ActionType
except ImportError:
    from config import save_ui_state
    from clickable_fields import get_field, ActionType


class ConsoleInteractionMixin:
    def _on_console_link_clicked(self, url: QUrl):
        """Handle clickable links in the console view (e.g., ID filters, show dropdown menu)."""
        try:
            scheme = url.scheme()

            # Show dropdown menu with field actions (same as DB logs)
            if scheme == "click":
                field_name = url.host()
                raw_value = url.path().lstrip("/")
                field_value = QUrl.fromPercentEncoding(raw_value.encode("utf-8"))
                if field_name and field_value:
                    self._show_console_field_action_popup(field_name, field_value)
                return

            # Legacy: Pivot into DB logs with a pre-applied field filter
            if scheme == "dbfilter":
                field_name = url.host()
                value = url.path().lstrip("/")
                if not field_name or not value:
                    return

                # Switch to DB logs tab (keeps current service selection in sync)
                self._open_db_logs_for_current_service()

                # Delay filter application to avoid threading race conditions during tab switch
                if hasattr(self, "db_log_viewer") and self.db_log_viewer:
                    def apply_filter():
                        try:
                            filter_url = QUrl(f"filter://{field_name}/{value}")
                            self.db_log_viewer._on_log_link_clicked(filter_url)
                        except Exception:
                            # Best-effort; ignore if viewer isn't ready yet
                            pass
                    QTimer.singleShot(100, apply_filter)
                return

            # Fallback: open regular web links in browser
            if scheme in {"http", "https"}:
                try:
                    webbrowser.open(url.toString())
                except Exception:
                    pass
        except Exception as e:
            try:
                if _launcher_logger:
                    _launcher_logger.warning("console_link_click_failed", error=str(e), url=url.toString())
            except Exception:
                pass

    def _show_console_field_action_popup(self, field_name: str, field_value: str):
        """Show popup menu with actions for a clickable field in console logs."""
        if not field_name or not field_value:
            return
        field_def = get_field(field_name)

        menu = QMenu(self)
        # Keep a reference so the menu isn't GC'd while visible.
        self._active_field_menu = menu
        menu.aboutToHide.connect(lambda: setattr(self, "_active_field_menu", None))
        menu.setStyleSheet("""
            QMenu {
                background-color: #2d2d2d;
                color: #e0e0e0;
                border: 1px solid #555;
                padding: 4px;
            }
            QMenu::item {
                padding: 6px 20px 6px 10px;
                border-radius: 3px;
            }
            QMenu::item:selected {
                background-color: #5a9fd4;
            }
            QMenu::separator {
                height: 1px;
                background-color: #555;
                margin: 4px 8px;
            }
        """)

        if field_def:
            # Add header with field info
            display_name = field_def.display_name
            truncated = field_value[:20] + "..." if len(field_value) > 20 else field_value
            header_action = QAction(f"{display_name}: {truncated}", self)
            header_action.setEnabled(False)
            header_font = header_action.font()
            header_font.setBold(True)
            header_action.setFont(header_font)
            menu.addAction(header_action)
            menu.addSeparator()

            # Add actions from registry
            for action_def in field_def.actions:
                icon = action_def.icon + " " if action_def.icon else ""
                action = QAction(f"{icon}{action_def.label}", self)

                if action_def.tooltip:
                    action.setToolTip(action_def.tooltip)

                # Connect based on action type
                if action_def.action_type == ActionType.FILTER:
                    action.triggered.connect(
                        lambda checked=False, fn=field_name, fv=field_value:
                        self._apply_console_field_filter(fn, fv)
                    )
                elif action_def.action_type == ActionType.COPY:
                    action.triggered.connect(
                        lambda checked=False, v=field_value:
                        self._copy_to_clipboard(v)
                    )
                elif action_def.action_type == ActionType.TRACE:
                    action.triggered.connect(
                        lambda checked=False, fn=field_name, fv=field_value:
                        self._apply_console_trace_action(fn, fv)
                    )

                menu.addAction(action)

            # Convenience: open request trace JSON for request_id values
            if field_name == "request_id":
                menu.addSeparator()
                open_trace_action = QAction("Show request trace", self)
                api_url = getattr(getattr(self, "db_log_viewer", None), "api_url", "http://localhost:8001")
                open_trace_action.triggered.connect(
                    lambda checked=False, rid=str(field_value): (
                        self.db_log_viewer.show_request_trace_popup(rid)
                        if getattr(self, "db_log_viewer", None)
                        else webbrowser.open(
                            f"{api_url}/api/v1/logs/trace/request/{quote(str(field_value), safe='')}"
                        )
                    )
                )
                menu.addAction(open_trace_action)
        else:
            # Fallback for unregistered fields
            filter_action = QAction(f"🔍 Filter by {field_name}", self)
            filter_action.triggered.connect(
                lambda: self._apply_console_field_filter(field_name, field_value)
            )
            menu.addAction(filter_action)

            copy_action = QAction(f"📋 Copy value", self)
            copy_action.triggered.connect(
                lambda: self._copy_to_clipboard(field_value)
            )
            menu.addAction(copy_action)

        # Pause log refresh while menu is visible to avoid re-render races.
        timer = getattr(self, "console_refresh_timer", None)
        try:
            if timer:
                timer.stop()
            menu.popup(QCursor.pos())
        except Exception:
            # Fallback to copy to clipboard rather than crashing.
            try:
                self._copy_to_clipboard(field_value)
            except Exception:
                pass
        finally:
            if timer:
                # Resume after a short delay so the menu can process the click event cleanly.
                QTimer.singleShot(250, timer.start)

    def _apply_console_field_filter(self, field_name: str, field_value: str):
        """Apply field filter by switching to DB logs tab."""
        self._open_db_logs_for_current_service()

        # Apply the filter in DB logs viewer
        if hasattr(self, "db_log_viewer") and self.db_log_viewer:
            def apply_filter():
                try:
                    filter_url = QUrl(f"filter://{field_name}/{field_value}")
                    self.db_log_viewer._on_log_link_clicked(filter_url)
                except Exception:
                    pass
            QTimer.singleShot(100, apply_filter)

    def _apply_console_trace_action(self, field_name: str, field_value: str):
        """Apply trace action by switching to DB logs and showing full trace."""
        self._open_db_logs_for_current_service()

        # Apply the filter in DB logs viewer
        if hasattr(self, "db_log_viewer") and self.db_log_viewer:
            def apply_trace():
                try:
                    # Use click:// to trigger the trace action in DB logs
                    click_url = QUrl(f"click://{field_name}/{field_value}")
                    self.db_log_viewer._on_log_link_clicked(click_url)
                except Exception:
                    pass
            QTimer.singleShot(100, apply_trace)

    def _copy_to_clipboard(self, text: str):
        """Copy text to clipboard."""
        clipboard = QApplication.clipboard()
        clipboard.setText(text)

    def _on_autoscroll_changed(self, state):
        self.autoscroll_enabled = (state == Qt.Checked)
        self.ui_state.autoscroll_enabled = self.autoscroll_enabled
        save_ui_state(self.ui_state)
        # Update log view widget
        if hasattr(self, 'log_view'):
            self.log_view.set_autoscroll(self.autoscroll_enabled)

    def _on_pause_logs_changed(self, checked):
        """Pause/resume log updates."""
        # Debug: capture what triggered this toggle
        if checked:
            import traceback
            trigger_trace = ''.join(traceback.format_stack()[-5:-1])
            if _launcher_logger:
                try:
                    _launcher_logger.warning("pause_toggled_on",
                                             trigger=trigger_trace.strip())
                except Exception:
                    pass
            # Also inject into the selected service's console buffer
            sp = self.processes.get(self.selected_service_key) if self.selected_service_key else None
            if sp:
                import datetime
                ts = datetime.datetime.now().strftime("%H:%M:%S")
                sp.log_buffer.append(
                    f"[{ts}] [LAUNCHER] ⚠ Console paused — trigger trace:\n{trigger_trace.strip()}"
                )
        # Update log view widget
        if hasattr(self, 'log_view'):
            self.log_view.set_paused(checked)

        if hasattr(self, 'pause_logs_button'):
            if checked:
                self.pause_logs_button.setText('▶ Resume')
                self.pause_logs_button.setToolTip("Resume log updates")
            else:
                self.pause_logs_button.setText('⏸ Pause')
                self.pause_logs_button.setToolTip("Pause log updates to scroll through history")
                # Refresh logs immediately when resuming
                self._refresh_console_logs(force=True)

    def _on_console_scroll(self, value):
        """Track scroll position when user manually scrolls."""
        if self.selected_service_key and not self.autoscroll_enabled:
            self.service_scroll_positions[self.selected_service_key] = value

    def _on_filter_changed(self, text):
        self.log_filter = text.lower()
        # No-op; file log filter removed
        pass

    def _on_console_filter_changed(self):
        """React immediately to console filter changes."""
        # Save filter settings
        if hasattr(self, 'console_level_combo'):
            self.ui_state.console_level_filter = self.console_level_combo.currentText()
        if hasattr(self, 'console_scope_actions'):
            # Store as comma-separated list of checked scope keys
            active = [key for key, act in self.console_scope_actions.items() if act.isChecked()]
            self.ui_state.console_scope_filter = ','.join(active) if active else ''
        if hasattr(self, 'console_search_input'):
            self.ui_state.console_search_text = self.console_search_input.text()
        save_ui_state(self.ui_state)
        self._refresh_console_logs(force=True)

    def _on_console_style_changed(self, checked: bool):
        """Swap between classic and enhanced console layouts."""
        self.console_style_enhanced = bool(checked)
        self.ui_state.console_style_enhanced = self.console_style_enhanced
        save_ui_state(self.ui_state)
        self._refresh_console_logs(force=True)

    def _on_attach_logs_clicked(self):
        """Attach console view to the selected service's log file.

        This is useful when the service was started outside the launcher
        but is still writing to the canonical console log directory.
        """
        if not self.selected_service_key or self.selected_service_key not in self.processes:
            return

        sp = self.processes[self.selected_service_key]
        # Not all process adapters may implement attach_logs; guard accordingly.
        attach_fn = getattr(sp, "attach_logs", None)
        if callable(attach_fn):
            attach_fn()
            # Refresh immediately so the label/empty-state messaging updates
            self._refresh_console_logs(force=True)
