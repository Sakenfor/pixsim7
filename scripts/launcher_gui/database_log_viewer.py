"""
Database log viewer widget for launcher.
Queries structured logs from TimescaleDB via API.
Uses QThread for non-blocking HTTP requests.
"""
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTextBrowser,
    QPushButton, QComboBox, QLineEdit, QLabel, QCheckBox, QFrame, QMenu
)
from PySide6.QtCore import QTimer, QThread, Signal, QUrl, Qt
from PySide6.QtGui import QFont, QTextCharFormat, QColor, QTextCursor, QAction, QClipboard, QShortcut, QKeySequence
import requests
from datetime import datetime, timedelta

# Import formatting and metadata modules
try:
    from .log_formatter import format_log_line_html
    from .log_styles import LOG_ROW_STYLES
    from .field_metadata import get_field_metadata, discover_fields
except ImportError:
    from log_formatter import format_log_line_html
    from log_styles import LOG_ROW_STYLES
    from field_metadata import get_field_metadata, discover_fields


class LogFetchWorker(QThread):
    """Worker thread for fetching logs from API without blocking UI."""

    # Signals to communicate with main thread
    logs_fetched = Signal(dict)  # Emits the response data
    error_occurred = Signal(str)  # Emits error message

    def __init__(self, api_url, params):
        super().__init__()
        self.api_url = api_url
        self.params = params

    def run(self):
        """Fetch logs in background thread."""
        try:
            response = requests.get(
                f"{self.api_url}/api/v1/logs/query",
                params=self.params,
                timeout=5
            )
            response.raise_for_status()
            self.logs_fetched.emit(response.json())
        except requests.exceptions.ConnectionError:
            self.error_occurred.emit('Cannot connect to API (is it running?)')
        except requests.exceptions.Timeout:
            self.error_occurred.emit('API request timed out')
        except Exception as e:
            self.error_occurred.emit(f'{type(e).__name__}: {str(e)}')


class FieldDiscoveryWorker(QThread):
    """Worker thread for discovering fields from API without blocking UI."""

    # Signals
    fields_discovered = Signal(str, list)  # service_name, fields
    discovery_failed = Signal(str)  # service_name

    def __init__(self, api_url, service_name, cache):
        super().__init__()
        self.api_url = api_url
        self.service_name = service_name
        self.cache = cache

    def run(self):
        """Discover fields in background thread."""
        fields = discover_fields(self.service_name, self.api_url, self.cache, timeout=1)
        if fields:
            self.fields_discovered.emit(self.service_name, fields)
        else:
            self.discovery_failed.emit(self.service_name)


class DatabaseLogViewer(QWidget):
    """Widget to view structured logs from database."""

    def __init__(self, api_url="http://localhost:8001"):
        super().__init__()
        self.api_url = api_url
        self.auto_refresh_enabled = False  # Disabled by default to avoid lag
        self.worker = None  # Current worker thread
        self.field_worker = None  # Field discovery worker thread
        self._fields_cache = {}  # Cache field discovery results
        self._metadata_cache = {}  # Cache field metadata to avoid redundant API calls
        self._field_relationships = {}  # Cache field relationships for contextual display
        self._initial_load_done = False  # Track if we've loaded logs once
        self._worker_generation = 0  # Track worker generation to ignore stale results
        self._pending_service_change = None  # Track pending service change
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)

        # Compact single-row filter bar
        filter_bar = QHBoxLayout()
        filter_bar.setSpacing(8)

        # Service
        filter_bar.addWidget(QLabel('Service:'))
        self.service_combo = self._styled_combo(['All', 'api', 'worker', 'game', 'test', 'launcher'])
        self.service_combo.setMinimumWidth(100)
        self.service_combo.currentTextChanged.connect(self._on_service_changed_fast)
        filter_bar.addWidget(self.service_combo)

        # Level
        filter_bar.addWidget(QLabel('Level:'))
        self.level_combo = self._styled_combo(['All', 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'])
        self.level_combo.setMinimumWidth(90)
        filter_bar.addWidget(self.level_combo)

        # Time
        filter_bar.addWidget(QLabel('Time:'))
        self.time_combo = self._styled_combo(['Last 5 min', 'Last 15 min', 'Last hour', 'Last 6 hours', 'Last 24 hours', 'All time'])
        self.time_combo.setCurrentText('Last hour')
        self.time_combo.setMinimumWidth(110)
        filter_bar.addWidget(self.time_combo)

        # Limit
        filter_bar.addWidget(QLabel('Limit:'))
        self.limit_combo = self._styled_combo(['50', '100', '200', '500', '1000'])
        self.limit_combo.setCurrentText('100')
        self.limit_combo.setMinimumWidth(70)
        filter_bar.addWidget(self.limit_combo)

        # Search
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText('Search...')
        self.search_input.setMinimumWidth(150)
        self.search_input.setStyleSheet("""
            QLineEdit {
                background-color: #3d3d3d;
                color: #e0e0e0;
                border: 1px solid #555;
                border-radius: 4px;
                padding: 4px 8px;
            }
            QLineEdit:focus {
                border: 1px solid #5a9fd4;
            }
        """)
        filter_bar.addWidget(self.search_input)

        filter_bar.addStretch()
        layout.addLayout(filter_bar)

        # Dynamic Service-Specific Filters
        self.service_filter_widget = QWidget()
        self.service_filter_layout = QHBoxLayout(self.service_filter_widget)
        self.service_filter_layout.setContentsMargins(0, 4, 0, 4)
        self.service_filter_layout.setSpacing(8)
        self.service_filter_layout.addWidget(QLabel('Filters:'))
        self.service_filter_layout.addStretch()

        self.service_filter_widget.setVisible(False)  # Hidden by default
        self.dynamic_filter_inputs = {}  # Track dynamically created inputs
        layout.addWidget(self.service_filter_widget)

        # Control buttons
        btn_row = QHBoxLayout()

        self.refresh_btn = QPushButton('🔄 Refresh')
        self.refresh_btn.clicked.connect(self.refresh_logs)
        self.refresh_btn.setToolTip("Refresh logs with current filters (F5)")
        btn_row.addWidget(self.refresh_btn)

        self.reset_btn = QPushButton('↺ Reset Filters')
        self.reset_btn.clicked.connect(self._reset_filters)
        self.reset_btn.setToolTip("Reset all filters to default values (Ctrl+R)")
        self.reset_btn.setStyleSheet("""
            QPushButton {
                background-color: #555;
                color: #e0e0e0;
                border: 1px solid #666;
            }
            QPushButton:hover {
                background-color: #666;
                border: 1px solid #777;
            }
            QPushButton:pressed {
                background-color: #444;
            }
        """)
        btn_row.addWidget(self.reset_btn)

        self.clear_btn = QPushButton('🗑 Clear Display')
        self.clear_btn.clicked.connect(self.clear_display)
        self.clear_btn.setToolTip("Clear the log display (Ctrl+L)")
        btn_row.addWidget(self.clear_btn)

        btn_row.addSpacing(15)

        self.auto_refresh_checkbox = QCheckBox('Auto-refresh (10s)')
        self.auto_refresh_checkbox.setChecked(False)  # Disabled by default
        self.auto_refresh_checkbox.setToolTip("Automatically refresh logs every 10 seconds")
        self.auto_refresh_checkbox.stateChanged.connect(self._toggle_auto_refresh)
        btn_row.addWidget(self.auto_refresh_checkbox)

        btn_row.addStretch()

        # Status label
        self.status_label = QLabel('Ready - Select service and click Refresh')
        self.status_label.setStyleSheet("color: #a0a0a0; font-size: 9pt; font-weight: 500;")
        btn_row.addWidget(self.status_label)

        layout.addLayout(btn_row)

        # Log display - Use QTextBrowser for clickable links
        self.log_display = QTextBrowser()
        self.log_display.setReadOnly(True)
        self.log_display.setOpenLinks(False)  # Handle clicks manually
        self.log_display.anchorClicked.connect(self._on_log_link_clicked)
        self._expanded_rows = set()  # Track which rows are expanded
        self.log_display.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.log_display.customContextMenuRequested.connect(self._show_context_menu)
        self.log_display.setStyleSheet("""
            QTextBrowser {
                background-color: #1e1e1e;
                color: #d4d4d4;
                font-family: 'Consolas', 'Courier New', monospace;
                font-size: 9pt;
                border: 1px solid #ccc;
                border-radius: 4px;
            }
        """)
        layout.addWidget(self.log_display)

        # Auto-refresh timer
        self.timer = QTimer()
        self.timer.timeout.connect(self.refresh_logs)

        # Keyboard shortcuts
        self.refresh_shortcut = QShortcut(QKeySequence('F5'), self)
        self.refresh_shortcut.activated.connect(self.refresh_logs)
        self.clear_shortcut = QShortcut(QKeySequence('Ctrl+L'), self)
        self.clear_shortcut.activated.connect(self.clear_display)
        self.reset_shortcut = QShortcut(QKeySequence('Ctrl+R'), self)
        self.reset_shortcut.activated.connect(self._reset_filters)
        # Search focus shortcut
        self.search_focus_shortcut = QShortcut(QKeySequence('Ctrl+F'), self)
        self.search_focus_shortcut.activated.connect(lambda: self.search_input.setFocus())

    def _toggle_auto_refresh(self, state):
        """Enable/disable auto-refresh."""
        self.auto_refresh_enabled = bool(state)
        if self.auto_refresh_enabled:
            self.timer.start(10000)  # 10 seconds
            self.refresh_logs()  # Immediate refresh when enabled
        else:
            self.timer.stop()

    def clear_display(self):
        """Clear the log display."""
        self.log_display.clear()
        self._expanded_rows.clear()  # Reset expansion state
        self.status_label.setText('Display cleared - Ready to load logs')

    def _reset_filters(self):
        """Reset all filters to default values."""
        self.service_combo.setCurrentText('All')
        self.level_combo.setCurrentText('All')
        self.time_combo.setCurrentText('Last hour')
        self.limit_combo.setCurrentText('100')
        self.search_input.clear()

        # Clear dynamic filter inputs
        for widget in self.dynamic_filter_inputs.values():
            widget.clear()

        self.log_display.clear()
        self._expanded_rows.clear()  # Reset expansion state
        self.status_label.setText('Filters reset - Click Refresh to load logs')

    def refresh_logs(self):
        """Query logs from API and display (non-blocking)."""
        # Increment generation to mark previous workers as stale
        self._worker_generation += 1
        current_generation = self._worker_generation

        # Don't wait for existing worker - let it finish and ignore results
        # This prevents UI blocking when rapidly switching services

        try:
            # Build query parameters
            params = {'limit': int(self.limit_combo.currentText())}

            # Service filter
            service = self.service_combo.currentText()
            if service != 'All':
                params['service'] = service.lower()

            # Level filter
            level = self.level_combo.currentText()
            if level != 'All':
                params['level'] = level

            # Dynamic filter inputs
            for field_name, widget in self.dynamic_filter_inputs.items():
                value = widget.text().strip()
                if value:
                    # Handle numeric fields (try to convert, fallback to string)
                    if field_name in ['job_id', 'user_id', 'asset_id', 'artifact_id', 'attempt']:
                        try:
                            params[field_name] = int(value)
                        except ValueError:
                            params[field_name] = value
                    else:
                        params[field_name] = value

            # Search filter
            search = self.search_input.text().strip()
            if search:
                params['search'] = search

            # Time range filter
            time_range = self.time_combo.currentText()
            if time_range != 'All time':
                now = datetime.utcnow()
                if time_range == 'Last 5 min':
                    start_time = now - timedelta(minutes=5)
                elif time_range == 'Last 15 min':
                    start_time = now - timedelta(minutes=15)
                elif time_range == 'Last hour':
                    start_time = now - timedelta(hours=1)
                elif time_range == 'Last 6 hours':
                    start_time = now - timedelta(hours=6)
                elif time_range == 'Last 24 hours':
                    start_time = now - timedelta(hours=24)
                params['start_time'] = start_time.isoformat()

            # Update status with more informative message
            filter_info = []
            if service != 'All':
                filter_info.append(f"service={service}")
            if level != 'All':
                filter_info.append(f"level={level}")
            if search:
                filter_info.append(f"search='{search}'")
            filter_str = ', '.join(filter_info) if filter_info else 'no filters'
            self.status_label.setText(f'Loading logs ({filter_str})...')
            self.refresh_btn.setEnabled(False)

            # Create and start worker thread
            self.worker = LogFetchWorker(self.api_url, params)
            # Store generation in worker so callbacks can check if stale
            self.worker.generation = current_generation
            self.worker.logs_fetched.connect(lambda data, gen=current_generation: self._on_logs_received(data, gen))
            self.worker.error_occurred.connect(lambda err, gen=current_generation: self._on_error(err, gen))
            self.worker.start()

        except Exception as e:
            self.status_label.setText(f"Error: {type(e).__name__}")

    def _on_service_changed_fast(self, service: str):
        """Fast service change handler - builds dynamic filters based on discovered fields."""
        # Clear existing dynamic filters immediately for responsive UI
        self._clear_dynamic_filters()

        if service == 'All':
            self.service_filter_widget.setVisible(False)
            self.status_label.setText('Service changed to All - Click Refresh to load logs')
            return

        # Check cache first for instant response
        if service in self._fields_cache:
            fields = self._fields_cache[service]
            if fields:
                self._build_dynamic_filters(fields, service)
                self.service_filter_widget.setVisible(True)
            else:
                self.service_filter_widget.setVisible(False)
            self.status_label.setText(f'Service changed to {service} - Click Refresh to load logs')
            return

        # Cache miss - use worker thread for non-blocking discovery
        self.status_label.setText(f'Service changed to {service} - Loading filters...')
        self._pending_service_change = service

        # Cancel existing field worker if still running
        if self.field_worker and self.field_worker.isRunning():
            self.field_worker.terminate()
            self.field_worker.wait(100)

        # Start new field discovery worker
        self.field_worker = FieldDiscoveryWorker(self.api_url, service, self._fields_cache)
        self.field_worker.fields_discovered.connect(self._on_fields_discovered)
        self.field_worker.discovery_failed.connect(self._on_field_discovery_failed)
        self.field_worker.start()

    def _clear_dynamic_filters(self):
        """Remove all dynamically created filter widgets."""
        for widget in self.dynamic_filter_inputs.values():
            widget.deleteLater()
        self.dynamic_filter_inputs.clear()

        # Remove all widgets except the label and stretch
        while self.service_filter_layout.count() > 2:  # Keep "Filters:" label and stretch
            item = self.service_filter_layout.takeAt(1)  # Always remove item after label
            if item.widget():
                item.widget().deleteLater()

    def _build_dynamic_filters(self, fields, service):
        """Build dynamic filter inputs based on available fields.
        Shows primary fields first, then contextually reveals others."""
        # Get field metadata (categories and relationships)
        metadata = self._get_field_metadata(fields, service)

        primary = metadata['primary']
        contextual = metadata['contextual']
        self._field_relationships = metadata['relationships']

        # Build primary filters (always visible)
        insert_position = 1  # After "Filters:" label
        for field in primary[:3]:  # Limit to 3 primary fields to avoid clutter
            widget = self._create_filter_input(field, is_primary=True)
            self.service_filter_layout.insertWidget(insert_position, widget)
            self.dynamic_filter_inputs[field] = widget
            insert_position += 1

        # Build contextual filters (initially hidden, shown when relevant)
        for field in contextual:
            widget = self._create_filter_input(field, is_primary=False)
            widget.setVisible(False)  # Start hidden
            self.service_filter_layout.insertWidget(insert_position, widget)
            self.dynamic_filter_inputs[field] = widget
            insert_position += 1

        # Connect text change events to handle contextual visibility
        for field_name, widget in self.dynamic_filter_inputs.items():
            if field_name in primary:  # Only primary fields trigger visibility changes
                widget.textChanged.connect(self._update_contextual_filters)

    def _create_filter_input(self, field_name, is_primary=True):
        """Create a styled filter input for a field."""
        widget = QLineEdit()
        widget.setObjectName(field_name)  # Store field name for later retrieval
        widget.setProperty('is_primary', is_primary)  # Track if primary or contextual
        # Create nice placeholder text
        placeholder = field_name.replace('_', ' ').title()
        widget.setPlaceholderText(f'{placeholder}...')
        widget.setMaximumWidth(110)

        # Different border color for contextual fields when visible
        border_color = '#555' if is_primary else '#4CAF50'
        widget.setStyleSheet(f"""
            QLineEdit {{
                background-color: #3d3d3d;
                color: #e0e0e0;
                border: 1px solid {border_color};
                border-radius: 3px;
                padding: 3px 6px;
                font-size: 9pt;
            }}
            QLineEdit:focus {{
                border: 1px solid #5a9fd4;
            }}
        """)
        return widget

    def _get_field_metadata(self, fields, service):
        """Get field metadata from API or infer it intelligently.
        Returns dict with 'primary', 'contextual', and 'relationships' keys."""
        # Check cache first to avoid redundant API calls
        cache_key = f"{service}:{','.join(sorted(fields))}"
        if cache_key in self._metadata_cache:
            return self._metadata_cache[cache_key]

        # Fetch from API or infer
        metadata = get_field_metadata(fields, service, self.api_url)

        # Cache the result
        self._metadata_cache[cache_key] = metadata
        return metadata

    def _update_contextual_filters(self):
        """Show/hide contextual filters based on which primary filters are filled.
        Uses dynamically determined relationships."""
        # Collect which contextual fields should be visible
        fields_to_show = set()
        for primary_field, contextual_list in self._field_relationships.items():
            if primary_field in self.dynamic_filter_inputs:
                widget = self.dynamic_filter_inputs[primary_field]
                if widget.text().strip():  # If this primary field is filled
                    fields_to_show.update(contextual_list)

        # Update visibility of contextual fields
        for field_name, widget in self.dynamic_filter_inputs.items():
            if not widget.property('is_primary'):  # Only affect contextual fields
                should_show = field_name in fields_to_show
                widget.setVisible(should_show)

    def _on_log_link_clicked(self, url: QUrl):
        """Handle clicks on log links to filter or expand rows."""
        scheme = url.scheme()  # e.g., "service", "filter", "expand"

        if scheme == "expand":
            # Handle row expansion toggle
            row_idx = url.host()
            self._toggle_row_expansion(row_idx)

        elif scheme == "service":
            filter_value = url.host()
            idx = self.service_combo.findText(filter_value)
            if idx >= 0:
                self.service_combo.setCurrentIndex(idx)
                self.refresh_logs()

        elif scheme == "level":
            filter_value = url.path()[1:]
            idx = self.level_combo.findText(filter_value.upper())
            if idx >= 0:
                self.level_combo.setCurrentIndex(idx)
                self.refresh_logs()

        elif scheme == "filter":
            # Handle filter://field_name/value
            field_name = url.host()
            filter_value = url.path()[1:]  # Remove leading /

            # Set the dynamic filter input if it exists
            if field_name in self.dynamic_filter_inputs:
                widget = self.dynamic_filter_inputs[field_name]
                widget.setText(str(filter_value))
                widget.setFocus()
                # Trigger contextual filter update if needed
                self._update_contextual_filters()
                self.refresh_logs()
            else:
                # Field doesn't exist yet, but might appear after service selection
                # Try to infer service and select it first
                pass

    def _toggle_row_expansion(self, row_idx):
        """Toggle expansion state of a log row and re-render."""
        # Debug: print to console to verify clicks are being received
        print(f"[DEBUG] Toggle row {row_idx}, currently expanded: {row_idx in self._expanded_rows}")

        if row_idx in self._expanded_rows:
            self._expanded_rows.remove(row_idx)
        else:
            self._expanded_rows.add(row_idx)

        # Re-render with current expansion state
        # We need to store the last fetched logs to re-render
        if hasattr(self, '_last_logs_data'):
            self._render_logs(self._last_logs_data)
        else:
            print("[DEBUG] No _last_logs_data to re-render")

    def _show_context_menu(self, position):
        """Show context menu on right-click with smart actions based on selection."""
        cursor = self.log_display.cursorForPosition(position)
        cursor.select(QTextCursor.SelectionType.LineUnderCursor)
        selected_text = cursor.selectedText()

        import re
        menu = QMenu(self)

        # Check if user has a text selection
        has_selection = self.log_display.textCursor().hasSelection()
        if has_selection:
            selection = self.log_display.textCursor().selectedText()
            copy_selection_action = QAction("Copy Selection", self)
            copy_selection_action.triggered.connect(lambda: self._copy_to_clipboard(selection))
            menu.addAction(copy_selection_action)
            menu.addSeparator()

        # Always offer: Copy entire log line
        copy_line_action = QAction("Copy Entire Log Line", self)
        copy_line_action.triggered.connect(lambda: self._copy_to_clipboard(selected_text))
        menu.addAction(copy_line_action)

        # Parse selected text for IDs and offer contextual actions
        # Define patterns for different ID types
        id_patterns = [
            (r'job:(\d+)', 'job_id', 'Job ID'),
            (r'user:(\d+)', 'user_id', 'User ID'),
            (r'asset:(\d+)', 'asset_id', 'Asset ID'),
            (r'artifact:(\d+)', 'artifact_id', 'Artifact ID'),
            (r'provider:(\d+)', 'provider_id', 'Provider ID'),
            (r'provider_job:([a-zA-Z0-9_-]+)', 'provider_job_id', 'Provider Job ID'),
            (r'req:([a-f0-9-]{8,})', 'request_id', 'Request ID'),
        ]

        found_ids = {}
        for pattern, field_name, display_name in id_patterns:
            match = re.search(pattern, selected_text)
            if match:
                found_ids[field_name] = (match.group(1), display_name)

        # Add ID-specific actions
        if found_ids:
            menu.addSeparator()

            # Add filter and copy actions for each ID
            for field_name, (id_value, display_name) in found_ids.items():
                # Truncate long IDs for display
                display_value = id_value if len(id_value) <= 12 else f"{id_value[:12]}..."

                filter_action = QAction(f"Filter by {display_name}: {display_value}", self)
                filter_action.triggered.connect(lambda checked, f=field_name, v=id_value: self._filter_by_field(f, v))
                menu.addAction(filter_action)

                copy_action = QAction(f"Copy {display_name} ({id_value})", self)
                copy_action.triggered.connect(lambda checked, v=id_value: self._copy_to_clipboard(v))
                menu.addAction(copy_action)

            # Add "Copy All IDs" if multiple IDs found
            if len(found_ids) > 1:
                menu.addSeparator()
                all_ids_text = ' | '.join([f"{name}: {val}" for val, name in found_ids.values()])
                copy_all_action = QAction("Copy All IDs", self)
                copy_all_action.triggered.connect(lambda: self._copy_to_clipboard(all_ids_text))
                menu.addAction(copy_all_action)

        # Extract timestamp
        ts_match = re.search(r'\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]', selected_text)
        if ts_match:
            timestamp = ts_match.group(1)
            menu.addSeparator()
            copy_ts_action = QAction(f"Copy Timestamp ({timestamp})", self)
            copy_ts_action.triggered.connect(lambda: self._copy_to_clipboard(timestamp))
            menu.addAction(copy_ts_action)

        # Extract error message
        if 'ERROR' in selected_text or 'error' in selected_text.lower():
            menu.addSeparator()
            # Try different error patterns
            error_patterns = [
                r'ERROR[:\s]+(.+?)(?:\n|$)',
                r'error[:\s]+(.+?)(?:\n|$)',
                r'Exception[:\s]+(.+?)(?:\n|$)',
            ]
            for pattern in error_patterns:
                error_match = re.search(pattern, selected_text, re.IGNORECASE)
                if error_match:
                    error_msg = error_match.group(1).strip()
                    if len(error_msg) > 100:
                        error_msg = error_msg[:100] + '...'
                    copy_error_action = QAction("Copy Error Message", self)
                    copy_error_action.triggered.connect(lambda checked, msg=error_match.group(1).strip(): self._copy_to_clipboard(msg))
                    menu.addAction(copy_error_action)
                    break

        # Extract operation_type if present
        op_match = re.search(r'op:([a-z_]+)', selected_text)
        if op_match:
            op_type = op_match.group(1)
            menu.addSeparator()
            filter_op_action = QAction(f"Filter by Operation: {op_type}", self)
            filter_op_action.triggered.connect(lambda: self._filter_by_field('operation_type', op_type))
            menu.addAction(filter_op_action)

        menu.exec_(self.log_display.mapToGlobal(position))

    def _copy_to_clipboard(self, text):
        """Copy text to clipboard."""
        from PySide6.QtWidgets import QApplication
        clipboard = QApplication.clipboard()
        clipboard.setText(text)

    def _filter_by_field(self, field_name, value):
        """Apply filter by field value."""
        if field_name in self.dynamic_filter_inputs:
            widget = self.dynamic_filter_inputs[field_name]
            widget.setText(str(value))
            widget.setFocus()
            self._update_contextual_filters()
            self.refresh_logs()
        else:
            # Field filter doesn't exist yet - could show message or auto-select service
            pass

    def _on_logs_received(self, data, generation):
        """Handle logs received from worker thread."""
        # Re-enable refresh button
        self.refresh_btn.setEnabled(True)

        # Ignore stale results from previous requests
        if generation != self._worker_generation:
            return

        # Store for re-rendering when toggling expansion
        self._last_logs_data = data
        self._render_logs(data)

    def _render_logs(self, data):
        """Render logs with current expansion state."""
        logs = data.get('logs', [])
        if not logs:
            self.log_display.setHtml('<div style="color: #888; padding: 20px; text-align: center;">No logs found matching your filters.<br><br>Try adjusting the time range or removing some filters.</div>')
            self.status_label.setText('No results found')
            return

        # Import here to avoid circular dependency
        from .log_formatter import format_log_line_html

        # Build HTML with styles and log rows
        html_parts = [LOG_ROW_STYLES]

        for idx, log in enumerate(reversed(logs)):  # Newest first
            is_expanded = str(idx) in self._expanded_rows
            line = format_log_line_html(log, idx, is_expanded)
            html_parts.append(line)

        self.log_display.setHtml('\n'.join(html_parts))

        # Build informative status message
        total = data.get('total', 0)
        showing_all = len(logs) == total
        status_msg = f"✓ Loaded {len(logs)} log{'s' if len(logs) != 1 else ''}"
        if not showing_all:
            status_msg += f" of {total} total"
        status_msg += f" - {datetime.now().strftime('%H:%M:%S')}"
        self.status_label.setText(status_msg)

    def _on_error(self, error_msg, generation):
        """Handle error from worker thread."""
        # Re-enable refresh button
        self.refresh_btn.setEnabled(True)

        # Ignore stale errors from previous requests
        if generation != self._worker_generation:
            return

        # Format error message with helpful information
        error_html = f'''
        <div style="color: #d32f2f; padding: 20px; background-color: #ffebee; border: 1px solid #ef5350; border-radius: 4px; margin: 10px;">
            <strong>⚠️ Error Loading Logs</strong><br><br>
            {error_msg}<br><br>
            <span style="color: #666; font-size: 9pt;">
            • Make sure the backend API is running<br>
            • Check that the API URL is correct: {self.api_url}<br>
            • Verify your database connection
            </span>
        </div>
        '''
        self.log_display.setHtml(error_html)
        self.status_label.setText(f'❌ Error: {error_msg}')

    def _discover_fields(self, service_name):
        """Discover fields for a service (wrapper for module function)."""
        return discover_fields(service_name, self.api_url, self._fields_cache)

    def _on_fields_discovered(self, service_name: str, fields: list):
        """Handle fields discovered from worker thread."""
        # Only apply if this is still the current service selection
        if self.service_combo.currentText() != service_name:
            return

        if fields:
            self._build_dynamic_filters(fields, service_name)
            self.service_filter_widget.setVisible(True)
        else:
            self.service_filter_widget.setVisible(False)

        self.status_label.setText(f'Service changed to {service_name} - Click Refresh to load logs')

    def _on_field_discovery_failed(self, service_name: str):
        """Handle field discovery failure."""
        # Only apply if this is still the current service selection
        if self.service_combo.currentText() != service_name:
            return

        self.service_filter_widget.setVisible(False)
        self.status_label.setText(f'Service changed to {service_name} - Click Refresh to load logs')

    def _service_fields_map(self):
        """Deprecated - kept for backwards compatibility."""
        from field_metadata import get_service_fields_fallback
        return get_service_fields_fallback()

    def showEvent(self, event):
        """Auto-load logs when widget is first shown."""
        super().showEvent(event)
        if not self._initial_load_done:
            self._initial_load_done = True
            # Delay slightly to let UI render first
            QTimer.singleShot(100, self.refresh_logs)

    def _service_fields_map(self):
        """Deprecated - kept for backwards compatibility (fallback field mapping)."""
        from field_metadata import get_service_fields_fallback
        return get_service_fields_fallback()

    def _styled_combo(self, items):
        cb = QComboBox()
        for it in items:
            cb.addItem(it)
        cb.setMinimumWidth(110)
        cb.setStyleSheet("""
            QComboBox {
                background-color: #3d3d3d;
                color: #e0e0e0;
                padding: 4px 8px;
                border: 1px solid #555;
                border-radius: 4px;
            }
            QComboBox:hover {
                border: 1px solid #5a9fd4;
            }
            QComboBox::drop-down {
                border: none;
                width: 20px;
            }
            QComboBox QAbstractItemView {
                background-color: #3d3d3d;
                color: #e0e0e0;
                selection-background-color: #5a9fd4;
                selection-color: white;
                border: 1px solid #555;
            }
        """)
        return cb

    def shutdown(self):
        """Cleanly stop any running worker threads before closing app."""
        if self.worker:
            try:
                if self.worker.isRunning():
                    self.worker.terminate()
                # Always wait to ensure thread is fully stopped
                self.worker.wait(2000)  # Wait up to 2 seconds
            except Exception:
                pass
            self.worker = None

        if self.field_worker:
            try:
                if self.field_worker.isRunning():
                    self.field_worker.terminate()
                self.field_worker.wait(1000)
            except Exception:
                pass
            self.field_worker = None
