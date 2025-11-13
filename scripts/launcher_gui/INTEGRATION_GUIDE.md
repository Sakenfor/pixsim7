# Database Log Viewer Integration Guide

## What's Been Created

1. **`database_log_viewer.py`** - The DatabaseLogViewer widget with:
   - Filters: Service, Level, Time Range, Job ID, Search
   - Auto-refresh every 5 seconds (toggleable)
   - Clean display of structured logs from TimescaleDB
   - Connection to API at `http://localhost:8001`

2. **`test_db_log_viewer.py`** - Standalone test script

## How to Integrate into Launcher

### Option 1: Quick Tab Integration (Recommended)

Add these changes to `launcher.py`:

**1. Add import at top (line ~10):**
```python
from PySide6.QtWidgets import (
    ...existing imports...,
    QTabWidget  # ADD THIS
)
```

**2. Add database viewer import (line ~24):**
```python
from .database_log_viewer import DatabaseLogViewer
```

**3. Replace the right panel log section (around line 692-750) with:**

```python
# Right panel: logs with tabs
right = QWidget()
right_layout = QVBoxLayout(right)
right_layout.setContentsMargins(8, 8, 8, 8)
splitter.addWidget(right)

# Create tab widget for logs
self.log_tabs = QTabWidget()

# === FILE LOGS TAB (existing functionality) ===
file_log_widget = QWidget()
file_log_layout = QVBoxLayout(file_log_widget)

# Move existing log header
log_header_layout = QHBoxLayout()
log_header_label = QLabel("File Logs")
log_header_font = QFont()
log_header_font.setPointSize(13)
log_header_font.setBold(True)
log_header_label.setFont(log_header_font)
log_header_layout.addWidget(log_header_label)

self.log_service_label = QLabel()
log_service_font = QFont()
log_service_font.setPointSize(10)
self.log_service_label.setFont(log_service_font)
self.log_service_label.setStyleSheet("color: #666; padding-left: 10px;")
log_header_layout.addWidget(self.log_service_label)
log_header_layout.addStretch()
file_log_layout.addLayout(log_header_layout)

# Move existing filter
filter_layout = QHBoxLayout()
filter_layout.addWidget(QLabel('Filter:'))
self.filter_input = QLineEdit()
self.filter_input.setPlaceholderText('substring to filter logs...')
self.filter_input.textChanged.connect(self._on_filter_changed)
filter_layout.addWidget(self.filter_input)
file_log_layout.addLayout(filter_layout)

# Move existing log view
self.log_view = QTextEdit()
self.log_view.setReadOnly(True)
self.log_view.setStyleSheet("""
    QTextEdit {
        background-color: #1e1e1e;
        color: #d4d4d4;
        font-family: 'Consolas', 'Courier New', monospace;
        font-size: 9pt;
        border: 1px solid #ccc;
        border-radius: 4px;
    }
""")
file_log_layout.addWidget(self.log_view)

# Move existing log buttons
log_btn_row = QHBoxLayout()
self.btn_refresh_logs = QPushButton('Refresh')
self.btn_clear_logs = QPushButton('Clear Display')
self.btn_open_log_dir = QPushButton('Open in Explorer')
self.autoscroll_checkbox = QCheckBox('Auto-scroll')
self.autoscroll_checkbox.setChecked(True)
self.autoscroll_checkbox.stateChanged.connect(self._on_autoscroll_changed)
log_btn_row.addWidget(self.btn_refresh_logs)
log_btn_row.addWidget(self.btn_clear_logs)
log_btn_row.addWidget(self.btn_open_log_dir)
log_btn_row.addWidget(self.autoscroll_checkbox)
file_log_layout.addLayout(log_btn_row)

self.log_tabs.addTab(file_log_widget, "File Logs")

# === DATABASE LOGS TAB (new) ===
self.db_log_viewer = DatabaseLogViewer()
self.log_tabs.addTab(self.db_log_viewer, "Database Logs")

# Add tabs to layout
right_layout.addWidget(self.log_tabs)
```

### Option 2: Test Standalone First

Run the standalone viewer to see it in action:
```bash
cd scripts/launcher_gui
python test_db_log_viewer.py
```

The viewer will show the 6 test logs we created earlier!

## Features of Database Log Viewer

- **Service Filter**: Filter by api, worker, test, or all
- **Level Filter**: DEBUG, INFO, WARNING, ERROR, CRITICAL
- **Time Range**: Last 5min, 15min, hour, 6 hours, 24 hours, or all time
- **Job ID Filter**: Search logs for a specific job
- **Text Search**: Search in message and error fields
- **Limit**: Control how many logs to fetch (50-1000)
- **Auto-refresh**: Updates every 5 seconds (can be toggled off)
- **Clean Formatting**: Shows timestamp, level, service, stage, job_id, and message

## Testing

With the API running and test logs in the database:
1. Launch the standalone viewer OR integrated launcher
2. You should see 6 test logs from earlier
3. Try filtering by:
   - Service: "test" (shows 1 log)
   - Service: "worker" (shows 5 logs)
   - Job ID: 100 (shows 1 log)
4. Try time ranges - should show all logs in "Last hour"

## Troubleshooting

- **"Cannot connect to API"**: Make sure API is running on port 8001
- **No logs shown**: Check time range filter (default is "Last hour")
- **Errors in viewer**: Check browser console / terminal for Python errors

## Next Steps

After integration, you can:
1. View real-time logs from API and Worker processes
2. Debug job processing by filtering by job_id
3. Track request flows by filtering by request_id
4. Search for errors and warnings
5. Monitor system health via structured logs
