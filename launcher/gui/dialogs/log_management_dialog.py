from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTableWidget, QTableWidgetItem, QGroupBox, QSpinBox, QComboBox,
    QMessageBox, QFileDialog
)
from PySide6.QtCore import Qt
import os
from datetime import datetime


def show_log_management_dialog(parent, processes):
    """Show dialog for managing console logs."""
    dlg = LogManagementDialog(parent, processes)
    dlg.exec()

def _notify(parent, message: str):
    if parent and hasattr(parent, "notify"):
        try:
            parent.notify(message)
            return
        except Exception:
            pass
    QMessageBox.information(parent, "Info", message)


class LogManagementDialog(QDialog):
    def __init__(self, parent, processes):
        super().__init__(parent)
        self.processes = processes
        self.setWindowTitle("Console Log Management")
        self.setMinimumWidth(700)
        self.setMinimumHeight(500)
        self.setStyleSheet("""
            QDialog {
                background-color: #2b2b2b;
                color: #e0e0e0;
            }
            QLabel {
                color: #e0e0e0;
            }
            QGroupBox {
                color: #e0e0e0;
                border: 1px solid #555;
                border-radius: 5px;
                margin-top: 10px;
                font-weight: bold;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                subcontrol-position: top left;
                padding: 0 5px;
                color: #5a9fd4;
            }
            QPushButton {
                background-color: #3d3d3d;
                color: #e0e0e0;
                border: 1px solid #555;
                border-radius: 4px;
                padding: 6px 12px;
                min-height: 24px;
            }
            QPushButton:hover {
                background-color: #4d4d4d;
                border: 1px solid #666;
            }
            QPushButton:pressed {
                background-color: #2d2d2d;
            }
            QPushButton:disabled {
                background-color: #333;
                color: #666;
            }
            QTableWidget {
                background-color: #1e1e1e;
                color: #e0e0e0;
                border: 1px solid #555;
                gridline-color: #555;
            }
            QTableWidget::item:selected {
                background-color: #5a9fd4;
            }
            QHeaderView::section {
                background-color: #3d3d3d;
                color: #e0e0e0;
                padding: 5px;
                border: 1px solid #555;
            }
            QSpinBox, QComboBox {
                background-color: #3d3d3d;
                color: #e0e0e0;
                border: 1px solid #555;
                border-radius: 3px;
                padding: 4px;
            }
        """)
        self._init_ui()
        self._refresh_log_list()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(12)
        layout.setContentsMargins(20, 20, 20, 20)

        # Header
        header = QLabel("Manage Console Logs")
        header.setStyleSheet("font-size: 14pt; font-weight: bold; color: #5a9fd4;")
        layout.addWidget(header)

        # Log files table
        log_group = QGroupBox("Console Log Files")
        log_group_layout = QVBoxLayout(log_group)

        self.log_table = QTableWidget()
        self.log_table.setColumnCount(4)
        self.log_table.setHorizontalHeaderLabels(["Service", "Size", "Lines", "Last Modified"])
        self.log_table.horizontalHeader().setStretchLastSection(True)
        self.log_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.log_table.setAlternatingRowColors(True)
        log_group_layout.addWidget(self.log_table)

        # Action buttons for table
        table_btn_row = QHBoxLayout()
        self.btn_refresh = QPushButton("🔄 Refresh")
        self.btn_refresh.clicked.connect(self._refresh_log_list)
        self.btn_view = QPushButton("👁 View Log")
        self.btn_view.clicked.connect(self._view_selected_log)
        self.btn_clear_selected = QPushButton("🗑 Clear Selected")
        self.btn_clear_selected.clicked.connect(self._clear_selected_log)
        self.btn_export = QPushButton("💾 Export Selected")
        self.btn_export.clicked.connect(self._export_selected_log)
        table_btn_row.addWidget(self.btn_refresh)
        table_btn_row.addWidget(self.btn_view)
        table_btn_row.addWidget(self.btn_clear_selected)
        table_btn_row.addWidget(self.btn_export)
        table_btn_row.addStretch()
        log_group_layout.addLayout(table_btn_row)

        layout.addWidget(log_group)

        # Bulk actions
        bulk_group = QGroupBox("Bulk Actions")
        bulk_layout = QVBoxLayout(bulk_group)

        btn_row1 = QHBoxLayout()
        self.btn_clear_all = QPushButton("🗑 Clear All Logs")
        self.btn_clear_all.setStyleSheet("QPushButton { background-color: #f44336; } QPushButton:hover { background-color: #da190b; }")
        self.btn_clear_all.clicked.connect(self._clear_all_logs)
        self.btn_archive_all = QPushButton("📦 Archive All Logs")
        self.btn_archive_all.clicked.connect(self._archive_all_logs)
        btn_row1.addWidget(self.btn_clear_all)
        btn_row1.addWidget(self.btn_archive_all)
        btn_row1.addStretch()
        bulk_layout.addLayout(btn_row1)

        layout.addWidget(bulk_group)

        # Settings
        settings_group = QGroupBox("Log Rotation Settings")
        settings_layout = QVBoxLayout(settings_group)

        info_label = QLabel("Configure automatic log rotation (requires restart to apply)")
        info_label.setStyleSheet("color: #888; font-size: 9pt;")
        settings_layout.addWidget(info_label)

        settings_row1 = QHBoxLayout()
        settings_row1.addWidget(QLabel("Max log size per service:"))
        self.max_size_spin = QSpinBox()
        self.max_size_spin.setRange(1, 100)
        self.max_size_spin.setValue(5)
        self.max_size_spin.setSuffix(" MB")
        settings_row1.addWidget(self.max_size_spin)
        settings_row1.addStretch()
        settings_layout.addLayout(settings_row1)

        settings_row2 = QHBoxLayout()
        settings_row2.addWidget(QLabel("Keep backups:"))
        self.backup_count_spin = QSpinBox()
        self.backup_count_spin.setRange(0, 10)
        self.backup_count_spin.setValue(3)
        self.backup_count_spin.setSuffix(" files")
        settings_row2.addWidget(self.backup_count_spin)
        settings_row2.addStretch()
        settings_layout.addLayout(settings_row2)

        settings_note = QLabel("Note: Settings are stored in constants.py")
        settings_note.setStyleSheet("color: #666; font-size: 8pt; font-style: italic;")
        settings_layout.addWidget(settings_note)

        layout.addWidget(settings_group)

        # Close button
        btn_row = QHBoxLayout()
        btn_close = QPushButton("Close")
        btn_close.clicked.connect(self.accept)
        btn_row.addStretch()
        btn_row.addWidget(btn_close)
        layout.addLayout(btn_row)

    def _refresh_log_list(self):
        """Refresh the list of log files."""
        self.log_table.setRowCount(0)

        for service_key, sp in self.processes.items():
            log_path = sp.log_file_path
            if not os.path.exists(log_path):
                continue

            # Get file info
            file_size = os.path.getsize(log_path)
            size_str = self._format_size(file_size)

            # Count lines
            try:
                with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
                    line_count = sum(1 for _ in f)
            except Exception:
                line_count = 0

            # Last modified
            try:
                mtime = os.path.getmtime(log_path)
                modified_str = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')
            except Exception:
                modified_str = "Unknown"

            # Add row
            row = self.log_table.rowCount()
            self.log_table.insertRow(row)
            self.log_table.setItem(row, 0, QTableWidgetItem(service_key))
            self.log_table.setItem(row, 1, QTableWidgetItem(size_str))
            self.log_table.setItem(row, 2, QTableWidgetItem(str(line_count)))
            self.log_table.setItem(row, 3, QTableWidgetItem(modified_str))

    def _format_size(self, size_bytes):
        """Format byte size to human readable."""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024.0:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.1f} TB"

    def _get_selected_service(self):
        """Get the selected service key."""
        selected_rows = self.log_table.selectedItems()
        if not selected_rows:
            return None
        row = selected_rows[0].row()
        service_key = self.log_table.item(row, 0).text()
        return service_key

    def _view_selected_log(self):
        """Open selected log in system default viewer."""
        service_key = self._get_selected_service()
        if not service_key:
            QMessageBox.warning(self, "No Selection", "Please select a log file first.")
            return

        sp = self.processes.get(service_key)
        if not sp:
            return

        log_path = sp.log_file_path
        if os.path.exists(log_path):
            import subprocess
            try:
                os.startfile(log_path)  # Windows
            except AttributeError:
                subprocess.call(['xdg-open', log_path])  # Linux
            except Exception as e:
                QMessageBox.warning(self, "Error", f"Failed to open log: {e}")

    def _clear_selected_log(self):
        """Clear the selected log file."""
        service_key = self._get_selected_service()
        if not service_key:
            QMessageBox.warning(self, "No Selection", "Please select a log file first.")
            return

        reply = QMessageBox.question(
            self, 'Confirm Clear',
            f'Clear console log for {service_key}?',
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            sp = self.processes.get(service_key)
            if sp:
                sp.clear_logs()
                self._refresh_log_list()

    def _export_selected_log(self):
        """Export selected log to a chosen location."""
        service_key = self._get_selected_service()
        if not service_key:
            QMessageBox.warning(self, "No Selection", "Please select a log file first.")
            return

        sp = self.processes.get(service_key)
        if not sp or not os.path.exists(sp.log_file_path):
            return

        filename, _ = QFileDialog.getSaveFileName(
            self, "Export Log File",
            f"{service_key}_console_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log",
            "Log Files (*.log);;Text Files (*.txt);;All Files (*.*)"
        )

        if filename:
            try:
                import shutil
                shutil.copy2(sp.log_file_path, filename)
                _notify(self.parent(), f"Log exported to:\n{filename}")
            except Exception as e:
                QMessageBox.warning(self, "Error", f"Failed to export log: {e}")

    def _clear_all_logs(self):
        """Clear all console logs."""
        reply = QMessageBox.question(
            self, 'Confirm Clear All',
            'Clear ALL console logs?\n\nThis cannot be undone.',
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            for sp in self.processes.values():
                sp.clear_logs()
            self._refresh_log_list()
            _notify(self.parent(), "All console logs cleared.")

    def _archive_all_logs(self):
        """Archive all logs to a zip file."""
        archive_dir = QFileDialog.getExistingDirectory(
            self, "Select Archive Directory"
        )
        if not archive_dir:
            return

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        archive_name = f"console_logs_archive_{timestamp}"
        archive_path = os.path.join(archive_dir, archive_name)

        try:
            import shutil
            # Create temporary directory
            temp_dir = os.path.join(archive_dir, archive_name)
            os.makedirs(temp_dir, exist_ok=True)

            # Copy all log files
            copied = 0
            for service_key, sp in self.processes.items():
                if os.path.exists(sp.log_file_path):
                    dest = os.path.join(temp_dir, f"{service_key}.log")
                    shutil.copy2(sp.log_file_path, dest)
                    copied += 1

            # Create zip archive
            shutil.make_archive(archive_path, 'zip', temp_dir)

            # Remove temp directory
            shutil.rmtree(temp_dir)

            _notify(self.parent(), f"Archived {copied} log files to:\n{archive_path}.zip")
        except Exception as e:
            QMessageBox.warning(self, "Error", f"Failed to create archive: {e}")
