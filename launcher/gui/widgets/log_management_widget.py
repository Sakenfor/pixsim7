"""
Embeddable Log Management widget for Tools tab.
Based on log_management_dialog.py but as a QWidget for embedding.
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Callable, Dict, Optional, Any

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTableWidget, QTableWidgetItem, QGroupBox, QMessageBox, QFileDialog
)
from PySide6.QtCore import Qt

try:
    from .. import theme
except ImportError:
    import theme


class LogManagementWidget(QWidget):
    """Embeddable log management widget."""

    def __init__(
        self,
        parent=None,
        processes_provider: Optional[Callable[[], Dict[str, Any]]] = None,
        notify_target: Optional[object] = None
    ):
        """
        Args:
            parent: Parent widget
            processes_provider: Callable that returns dict of service_key -> ServiceProcess objects
            notify_target: Object with notify() method for notifications
        """
        super().__init__(parent)
        self._processes_provider = processes_provider
        self._notify_target = notify_target
        self._build_ui()

    def _build_ui(self):
        self.setStyleSheet(
            theme.get_dialog_stylesheet() +
            theme.get_button_stylesheet() +
            theme.get_scrollbar_stylesheet() +
            f"""
            QTableWidget {{
                background-color: {theme.BG_TERTIARY};
                color: {theme.TEXT_PRIMARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
                gridline-color: {theme.BORDER_DEFAULT};
            }}
            QTableWidget::item:selected {{
                background-color: {theme.ACCENT_PRIMARY};
                color: {theme.TEXT_INVERSE};
            }}
            QHeaderView::section {{
                background-color: {theme.BG_SECONDARY};
                color: {theme.TEXT_PRIMARY};
                padding: 5px;
                border: 1px solid {theme.BORDER_DEFAULT};
            }}
            QGroupBox {{
                font-weight: bold;
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
                margin-top: 10px;
                padding-top: 8px;
                color: {theme.TEXT_PRIMARY};
            }}
            QGroupBox::title {{
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 5px;
                color: {theme.ACCENT_PRIMARY};
            }}
            """
        )

        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        layout.setContentsMargins(16, 12, 16, 12)

        # Header
        header = QLabel("Console Logs")
        header.setStyleSheet(f"font-size: 13pt; font-weight: bold; color: {theme.TEXT_PRIMARY};")
        layout.addWidget(header)

        # Log files table
        log_group = QGroupBox("Log Files")
        log_layout = QVBoxLayout(log_group)
        log_layout.setContentsMargins(8, 8, 8, 8)

        self.log_table = QTableWidget()
        self.log_table.setColumnCount(4)
        self.log_table.setHorizontalHeaderLabels(["Service", "Size", "Lines", "Modified"])
        self.log_table.horizontalHeader().setStretchLastSection(True)
        self.log_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.log_table.setAlternatingRowColors(True)
        self.log_table.setMaximumHeight(200)
        log_layout.addWidget(self.log_table)

        # Table action buttons
        table_btn_row = QHBoxLayout()
        table_btn_row.setSpacing(6)

        btn_refresh = QPushButton("Refresh")
        btn_refresh.clicked.connect(self._refresh_log_list)
        table_btn_row.addWidget(btn_refresh)

        btn_view = QPushButton("View")
        btn_view.setToolTip("Open log in system viewer")
        btn_view.clicked.connect(self._view_selected_log)
        table_btn_row.addWidget(btn_view)

        btn_clear = QPushButton("Clear")
        btn_clear.setToolTip("Clear selected log")
        btn_clear.clicked.connect(self._clear_selected_log)
        table_btn_row.addWidget(btn_clear)

        btn_export = QPushButton("Export")
        btn_export.setToolTip("Export selected log")
        btn_export.clicked.connect(self._export_selected_log)
        table_btn_row.addWidget(btn_export)

        table_btn_row.addStretch()
        log_layout.addLayout(table_btn_row)

        layout.addWidget(log_group)

        # Bulk actions
        bulk_group = QGroupBox("Bulk Actions")
        bulk_layout = QHBoxLayout(bulk_group)
        bulk_layout.setContentsMargins(8, 8, 8, 8)
        bulk_layout.setSpacing(8)

        btn_clear_all = QPushButton("Clear All")
        btn_clear_all.setToolTip("Clear all console logs")
        btn_clear_all.setStyleSheet(f"""
            QPushButton {{ background-color: {theme.ACCENT_WARNING}; }}
            QPushButton:hover {{ background-color: #e8a730; }}
        """)
        btn_clear_all.clicked.connect(self._clear_all_logs)
        bulk_layout.addWidget(btn_clear_all)

        btn_archive = QPushButton("Archive All")
        btn_archive.setToolTip("Archive all logs to zip")
        btn_archive.clicked.connect(self._archive_all_logs)
        bulk_layout.addWidget(btn_archive)

        bulk_layout.addStretch()
        layout.addWidget(bulk_group)

        layout.addStretch()

        # Initial refresh
        self._refresh_log_list()

    def _get_processes(self) -> Dict[str, Any]:
        """Get processes dict from provider."""
        if self._processes_provider:
            return self._processes_provider()
        return {}

    def _notify(self, message: str):
        """Send notification."""
        if self._notify_target and hasattr(self._notify_target, "notify"):
            try:
                self._notify_target.notify(message)
                return
            except Exception:
                pass
        QMessageBox.information(self, "Info", message)

    def _refresh_log_list(self):
        """Refresh the list of log files."""
        self.log_table.setRowCount(0)
        processes = self._get_processes()

        if not processes:
            return

        for service_key, sp in processes.items():
            log_path = getattr(sp, "log_file_path", None)
            if not log_path or not os.path.exists(log_path):
                continue

            # Get file info
            file_size = os.path.getsize(log_path)
            size_str = self._format_size(file_size)

            # Count lines
            try:
                with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                    line_count = sum(1 for _ in f)
            except Exception:
                line_count = 0

            # Last modified
            try:
                mtime = os.path.getmtime(log_path)
                modified_str = datetime.fromtimestamp(mtime).strftime("%m-%d %H:%M")
            except Exception:
                modified_str = "?"

            # Add row
            row = self.log_table.rowCount()
            self.log_table.insertRow(row)
            self.log_table.setItem(row, 0, QTableWidgetItem(service_key))
            self.log_table.setItem(row, 1, QTableWidgetItem(size_str))
            self.log_table.setItem(row, 2, QTableWidgetItem(str(line_count)))
            self.log_table.setItem(row, 3, QTableWidgetItem(modified_str))

    def _format_size(self, size_bytes: int) -> str:
        """Format byte size to human readable."""
        for unit in ["B", "KB", "MB", "GB"]:
            if size_bytes < 1024.0:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.1f} TB"

    def _get_selected_service(self) -> Optional[str]:
        """Get the selected service key."""
        selected = self.log_table.selectedItems()
        if not selected:
            return None
        row = selected[0].row()
        return self.log_table.item(row, 0).text()

    def _view_selected_log(self):
        """Open selected log in system default viewer."""
        service_key = self._get_selected_service()
        if not service_key:
            QMessageBox.warning(self, "No Selection", "Select a log file first.")
            return

        processes = self._get_processes()
        sp = processes.get(service_key)
        if not sp:
            return

        log_path = getattr(sp, "log_file_path", None)
        if log_path and os.path.exists(log_path):
            try:
                os.startfile(log_path)  # Windows
            except AttributeError:
                import subprocess
                subprocess.call(["xdg-open", log_path])  # Linux
            except Exception as e:
                QMessageBox.warning(self, "Error", f"Failed to open log: {e}")

    def _clear_selected_log(self):
        """Clear the selected log file."""
        service_key = self._get_selected_service()
        if not service_key:
            QMessageBox.warning(self, "No Selection", "Select a log file first.")
            return

        reply = QMessageBox.question(
            self, "Clear Log",
            f"Clear console log for {service_key}?",
            QMessageBox.Yes | QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            processes = self._get_processes()
            sp = processes.get(service_key)
            if sp and hasattr(sp, "clear_logs"):
                sp.clear_logs()
                self._refresh_log_list()

    def _export_selected_log(self):
        """Export selected log to a chosen location."""
        service_key = self._get_selected_service()
        if not service_key:
            QMessageBox.warning(self, "No Selection", "Select a log file first.")
            return

        processes = self._get_processes()
        sp = processes.get(service_key)
        log_path = getattr(sp, "log_file_path", None) if sp else None
        if not log_path or not os.path.exists(log_path):
            return

        filename, _ = QFileDialog.getSaveFileName(
            self, "Export Log",
            f"{service_key}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log",
            "Log Files (*.log);;All Files (*.*)"
        )

        if filename:
            try:
                import shutil
                shutil.copy2(log_path, filename)
                self._notify(f"Log exported to {filename}")
            except Exception as e:
                QMessageBox.warning(self, "Error", f"Failed to export: {e}")

    def _clear_all_logs(self):
        """Clear all console logs."""
        reply = QMessageBox.question(
            self, "Clear All",
            "Clear ALL console logs?\n\nThis cannot be undone.",
            QMessageBox.Yes | QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            processes = self._get_processes()
            for sp in processes.values():
                if hasattr(sp, "clear_logs"):
                    sp.clear_logs()
            self._refresh_log_list()
            self._notify("All console logs cleared.")

    def _archive_all_logs(self):
        """Archive all logs to a zip file."""
        archive_dir = QFileDialog.getExistingDirectory(self, "Select Archive Directory")
        if not archive_dir:
            return

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        archive_name = f"console_logs_{timestamp}"
        archive_path = os.path.join(archive_dir, archive_name)

        try:
            import shutil
            temp_dir = os.path.join(archive_dir, archive_name)
            os.makedirs(temp_dir, exist_ok=True)

            copied = 0
            processes = self._get_processes()
            for service_key, sp in processes.items():
                log_path = getattr(sp, "log_file_path", None)
                if log_path and os.path.exists(log_path):
                    dest = os.path.join(temp_dir, f"{service_key}.log")
                    shutil.copy2(log_path, dest)
                    copied += 1

            shutil.make_archive(archive_path, "zip", temp_dir)
            shutil.rmtree(temp_dir)

            self._notify(f"Archived {copied} logs to {archive_path}.zip")
        except Exception as e:
            QMessageBox.warning(self, "Error", f"Archive failed: {e}")
