"""Console log display and filtering mixin.

Extracts console log refresh, filtering, scope menu rebuilding, and
clipboard/clear helpers from ``LauncherWindow``.
"""
from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QTimer
from ..trace import _startup_trace
from ..logger import launcher_logger as _launcher_logger
try:
    from ..console_utils import (
        detect_console_level, detect_console_domain, detect_console_service,
        strip_ansi, format_console_log_html_classic, format_console_log_html_enhanced,
    )
    from ..status import HealthStatus
except ImportError:
    from console_utils import (
        detect_console_level, detect_console_domain, detect_console_service,
        strip_ansi, format_console_log_html_classic, format_console_log_html_enhanced,
    )
    from status import HealthStatus


class ConsoleLogMixin:
    # ── Incremental rendering state ──
    # Tracks how many lines (from the filtered buffer) were last rendered
    # for the currently selected service, enabling append-only updates when
    # only new lines arrived and filters haven't changed.
    _console_rendered_count: int = 0
    _console_rendered_filter_sig: object = None
    _console_rendered_service: str = ""

    def _refresh_console_logs(self, force: bool = False):
        """Refresh the console log display with service output (only when changed)."""
        _startup_trace("_refresh_console_logs start")

        # Guard: if log_view is paused but the button isn't checked, something
        # desynchronised — force-unpause to self-heal.
        if hasattr(self, 'log_view') and hasattr(self, 'pause_logs_button'):
            if self.log_view.is_paused() and not self.pause_logs_button.isChecked():
                self.log_view.set_paused(False)

        if not self.selected_service_key:
            _startup_trace("_refresh_console_logs skipped (no selection)")
            return

        sp = self.processes.get(self.selected_service_key)
        if not sp:
            _startup_trace("_refresh_console_logs skipped (no service)")
            return

        # Update service label (include basic attach state)
        service_title = next((s.title for s in self.services if s.key == self.selected_service_key), self.selected_service_key)
        attached_suffix = ""
        if getattr(sp, "externally_managed", False):
            attached_suffix = " – attached"
        self.log_service_label.setText(f"({service_title}{attached_suffix})")

        # Calculate hash of current log buffer to detect changes
        if sp.log_buffer:
            n = len(sp.log_buffer)
            tail_count = min(n, 10)
            last_lines = tuple(sp.log_buffer[n - tail_count + i] for i in range(tail_count))
            buffer_signature = hash((n, last_lines))
        else:
            buffer_signature = hash((sp.status.value, sp.health.value if sp.health else None))
        filter_signature = self._console_filter_signature()
        current_hash = (buffer_signature, filter_signature)

        # Only update UI if logs changed
        if not force and self.last_log_hash.get(self.selected_service_key) == current_hash:
            _startup_trace("_refresh_console_logs no changes")
            return

        self.last_log_hash[self.selected_service_key] = current_hash

        # Get logs from buffer and update using LogViewWidget
        if sp.log_buffer:
            filtered_buffer = self._filter_console_buffer(sp.log_buffer)

            RENDER_CAP = 150
            if len(filtered_buffer) > RENDER_CAP:
                skipped = len(filtered_buffer) - RENDER_CAP
                render_buffer = filtered_buffer[-RENDER_CAP:]
            else:
                skipped = 0
                render_buffer = filtered_buffer

            # ── Incremental path ──
            # If same service, same filters, and buffer only grew (append-only),
            # format just the new lines and use append_html() instead of full rebuild.
            same_service = (self._console_rendered_service == self.selected_service_key)
            same_filters = (self._console_rendered_filter_sig == filter_signature)
            can_incremental = (
                same_service and same_filters and not force
                and skipped == 0  # incremental only when showing full buffer
                and self._console_rendered_count > 0
                and len(render_buffer) > self._console_rendered_count
            )

            enhanced = getattr(self, "console_style_enhanced", True)

            if can_incremental:
                # Only format the new lines
                new_lines = render_buffer[self._console_rendered_count:]
                _startup_trace(f"_refresh_console_logs incremental +{len(new_lines)} lines")
                try:
                    if enhanced:
                        delta_html = format_console_log_html_enhanced(new_lines)
                    else:
                        delta_html = format_console_log_html_classic(new_lines)
                    self.log_view.append_html(delta_html)
                except Exception:
                    can_incremental = False  # fall through to full rebuild

            if not can_incremental:
                # ── Full rebuild ──
                _startup_trace(f"_refresh_console_logs full rebuild {len(render_buffer)} lines")
                try:
                    if enhanced:
                        log_html = format_console_log_html_enhanced(render_buffer)
                    else:
                        log_html = format_console_log_html_classic(render_buffer)
                except Exception as fmt_err:
                    if _launcher_logger:
                        try:
                            _launcher_logger.warning("console_format_error", error=str(fmt_err))
                        except Exception:
                            pass
                    log_html = "<pre>" + "\n".join(
                        str(line).replace("&", "&amp;").replace("<", "&lt;")
                        for line in render_buffer
                    ) + "</pre>"

                if skipped > 0:
                    log_html = (
                        f'<div style="color: #888; padding: 4px 8px; font-size: 8pt; border-bottom: 1px solid #444;">'
                        f'{skipped} older lines not shown (scroll up in full buffer with copy button)'
                        f'</div>\n'
                    ) + log_html

                self.log_view.update_content(log_html, force=force)

            # Update incremental tracking
            self._console_rendered_count = len(render_buffer)
            self._console_rendered_filter_sig = filter_signature
            self._console_rendered_service = self.selected_service_key
            _startup_trace("_refresh_console_logs done")
        else:
            # No logs - show appropriate message
            if sp.status.value in ("running", "starting"):
                if sp.health == HealthStatus.HEALTHY:
                    msg = (
                        f'<div style="color: #888; padding: 20px;">'
                        f'Service <strong>{service_title}</strong> is running (detected from previous session).'
                        f'<br><br>'
                        f'Note: Console output is only captured automatically when services are started from this launcher.'
                        f'<br>'
                        f'If you started this service externally, click <strong>Attach</strong> to tail its log file.'
                        f'</div>'
                    )
                else:
                    msg = f'<div style="color: #888; padding: 20px;">Service <strong>{service_title}</strong> is starting up...<br>Waiting for output...</div>'
            else:
                msg = f'<div style="color: #888; padding: 20px;">Service <strong>{service_title}</strong> is not running.<br><br>Click <strong>Start</strong> to launch this service.</div>'

            self.log_view.update_content(msg, force=True)

    def _rebuild_scope_menus_from_buffer(self, sp):
        """Scan a service's log buffer and rebuild scope menu items to show
        only domains/services that actually appear in its logs."""
        if not sp or not sp.log_buffer:
            return

        seen_domains = set()
        seen_services = set()
        # Cap scan to last 200 lines to avoid freezing on large buffers.
        buf = sp.log_buffer
        scan = buf[-200:] if len(buf) > 200 else buf
        for record in scan:
            fields = record.fields if hasattr(record, 'fields') else {}
            if fields:
                d = fields.get("domain")
                if d:
                    seen_domains.add(d)
                s = fields.get("service")
                if s:
                    seen_services.add(s)
            else:
                line_str = str(record)
                d = detect_console_domain(line_str)
                if d:
                    seen_domains.add(d)
                s = detect_console_service(line_str)
                if s:
                    seen_services.add(s)

        domain_btn = getattr(self, 'console_domain_button', None)
        if domain_btn and hasattr(domain_btn, '_rebuild_items'):
            domain_btn._rebuild_items(sorted(seen_domains))

        service_btn = getattr(self, 'console_service_button', None)
        if service_btn and hasattr(service_btn, '_rebuild_items'):
            service_btn._rebuild_items(sorted(seen_services))

    def _filter_console_buffer(self, buffer):
        """Filter log records by level, scope, and search text.

        Uses pre-parsed ``LogRecord.fields`` for structured lines (fast
        dict lookup) and falls back to heuristic regex for non-JSON lines.
        """
        if not buffer:
            return buffer

        # Determine active filters
        level_filter = None
        if hasattr(self, 'console_level_combo'):
            lvl = self.console_level_combo.currentText()
            if lvl and lvl != "All":
                level_filter = lvl.lower()

        # Scope filters from multi-toggle menus
        active_domains = set()
        active_services = set()
        if hasattr(self, 'console_scope_actions'):
            for key, act in self.console_scope_actions.items():
                kind, value = key.split(':', 1)
                if kind == 'domain' and act.isChecked():
                    active_domains.add(value)
                elif kind == 'service' and act.isChecked():
                    active_services.add(value)

        search_filter = None
        if hasattr(self, 'console_search_input'):
            text = self.console_search_input.text().strip()
            if text:
                search_filter = text.lower()

        # Fast path: no filters — return last RENDER_CAP lines directly
        if not level_filter and not active_domains and not active_services and not search_filter:
            try:
                return list(buffer[-500:]) if len(buffer) > 500 else list(buffer)
            except Exception:
                return []

        filtered = []
        for record in buffer:
            line_str = str(record)
            fields = record.fields if hasattr(record, 'fields') else {}

            # Level check — prefer structured field, fall back to heuristic
            if level_filter:
                rec_level = (fields.get("level") or "").lower() if fields else None
                if not rec_level:
                    detected = detect_console_level(line_str)
                    rec_level = detected.lower() if detected else None
                if not rec_level or rec_level != level_filter:
                    continue

            # Scope inclusion filter — domain and service are OR'd together.
            # Tagged lines must match at least one active filter; untagged
            # lines pass through so context isn't silently lost.
            if active_domains or active_services:
                rec_domain = fields.get("domain") if fields else None
                if rec_domain is None:
                    rec_domain = detect_console_domain(line_str)
                rec_service = fields.get("service") if fields else None
                if rec_service is None:
                    rec_service = detect_console_service(line_str)

                has_tag = bool(rec_domain or rec_service)
                if has_tag:
                    matched = False
                    if rec_domain and rec_domain in active_domains:
                        matched = True
                    if not matched and rec_service:
                        for sv in active_services:
                            if sv.endswith(".*"):
                                if rec_service.startswith(sv[:-2]):
                                    matched = True
                                    break
                            elif rec_service == sv:
                                matched = True
                                break
                    if not matched:
                        continue

            if search_filter and search_filter not in line_str.lower():
                continue

            filtered.append(record)

        return filtered

    def _console_filter_signature(self):
        """Return current console filter settings as a comparable tuple."""
        level = self.console_level_combo.currentText() if hasattr(self, 'console_level_combo') else "All"
        scopes = tuple(
            (key, act.isChecked())
            for key, act in self.console_scope_actions.items()
        ) if hasattr(self, 'console_scope_actions') else ()
        search = self.console_search_input.text().strip().lower() if hasattr(self, 'console_search_input') else ""
        return (level, scopes, search)

    def _copy_console_logs_plain(self):
        """Copy visible console logs as plain text to clipboard."""
        if not self.selected_service_key:
            return
        sp = self.processes.get(self.selected_service_key)
        if not sp or not sp.log_buffer:
            return

        filtered = self._filter_console_buffer(sp.log_buffer)
        if not filtered:
            return

        plain_lines = [strip_ansi(str(line)) for line in filtered]
        text = '\n'.join(plain_lines)

        clipboard = QApplication.clipboard()
        clipboard.setText(text)

        # Brief visual feedback
        prev_text = self.status_label.text()
        self.status_label.setText(f'Copied {len(plain_lines)} lines to clipboard')
        QTimer.singleShot(1500, lambda: self.status_label.setText(prev_text))

    def _clear_console_display(self):
        """Clear the console log display and persisted logs."""
        if self.selected_service_key and self.selected_service_key in self.processes:
            try:
                self.facade.clear_service_logs(self.selected_service_key)
            except Exception:
                # Fallback: clear the in-memory buffer directly
                state = self.processes.get(self.selected_service_key)
                if state and hasattr(state, 'log_buffer'):
                    state.log_buffer.clear()
        self.log_view.clear()

    def _refresh_db_logs(self):
        # DB logs are now handled by the React webview — no-op.
        pass

    def refresh_logs(self):
        pass
