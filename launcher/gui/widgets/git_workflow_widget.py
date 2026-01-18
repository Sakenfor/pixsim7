"""
Embeddable Git Workflow widget for Tools tab.
Based on simple_git_dialog.py but as a QWidget for embedding.
"""
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTextEdit, QGroupBox, QMessageBox
)
from PySide6.QtCore import QThread, Signal

try:
    from .. import theme
    from ..dialogs.simple_git_dialog import GitWorker
except ImportError:
    import theme
    from dialogs.simple_git_dialog import GitWorker


class GitWorkflowWidget(QWidget):
    """Embeddable Git workflow widget."""

    def __init__(self, parent=None, notify_target=None):
        super().__init__(parent)
        self._notify_target = notify_target
        self.worker = None
        self._build_ui()
        self._refresh_status()

    def _build_ui(self):
        self.setStyleSheet(
            theme.get_dialog_stylesheet() +
            theme.get_button_stylesheet() +
            theme.get_scrollbar_stylesheet() +
            f"""
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
        layout.setSpacing(12)
        layout.setContentsMargins(16, 12, 16, 12)

        # Header
        header = QLabel("Git Workflow")
        header.setStyleSheet(f"font-size: 13pt; font-weight: bold; color: {theme.TEXT_PRIMARY};")
        layout.addWidget(header)

        # Status
        status_group = QGroupBox("Status")
        status_layout = QVBoxLayout(status_group)
        status_layout.setContentsMargins(10, 10, 10, 10)

        self.status_label = QLabel("Checking...")
        self.status_label.setStyleSheet(f"font-family: 'Consolas', monospace; font-size: 9pt; color: {theme.TEXT_PRIMARY};")
        self.status_label.setWordWrap(True)
        status_layout.addWidget(self.status_label)

        refresh_btn = QPushButton("Refresh")
        refresh_btn.clicked.connect(self._refresh_status)
        status_layout.addWidget(refresh_btn)

        layout.addWidget(status_group)

        # Actions
        actions_layout = QHBoxLayout()
        actions_layout.setSpacing(8)

        self.commit_btn = QPushButton("Commit All")
        self.commit_btn.setToolTip("Stage and commit all changes")
        self.commit_btn.clicked.connect(self._commit_all)
        actions_layout.addWidget(self.commit_btn)

        self.push_btn = QPushButton("Push")
        self.push_btn.setToolTip("Push to origin/main")
        self.push_btn.clicked.connect(self._push)
        actions_layout.addWidget(self.push_btn)

        self.pull_btn = QPushButton("Pull & Merge")
        self.pull_btn.setToolTip("Fetch and merge feature branches")
        self.pull_btn.clicked.connect(self._pull_and_merge)
        actions_layout.addWidget(self.pull_btn)

        self.cleanup_btn = QPushButton("Cleanup")
        self.cleanup_btn.setToolTip("Delete merged branches")
        self.cleanup_btn.clicked.connect(self._cleanup_branches)
        actions_layout.addWidget(self.cleanup_btn)

        layout.addLayout(actions_layout)

        # Output
        self.output = QTextEdit()
        self.output.setReadOnly(True)
        self.output.setMaximumHeight(150)
        self.output.setStyleSheet(f"""
            QTextEdit {{
                background-color: {theme.BG_TERTIARY};
                color: {theme.TEXT_PRIMARY};
                font-family: 'Consolas', monospace;
                font-size: 9pt;
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
            }}
        """)
        layout.addWidget(self.output)

        layout.addStretch()

    def _log(self, message):
        self.output.append(message)
        self.output.verticalScrollBar().setValue(self.output.verticalScrollBar().maximum())

    def _run_operation(self, operation, description, conflict_strategy='skip'):
        if self.worker and self.worker.isRunning():
            return

        self._log(f"--- {description} ---")
        self._set_buttons_enabled(False)

        self.worker = GitWorker(operation, conflict_strategy=conflict_strategy)
        self.worker.finished.connect(self._operation_finished)
        self.worker.start()

    def _operation_finished(self, success, message):
        self._log(message)
        self._set_buttons_enabled(True)

        if self.worker and self.worker.operation == "status":
            self.status_label.setText(message)
        elif self.worker and self.worker.operation != "status":
            self._refresh_status()

    def _set_buttons_enabled(self, enabled):
        self.commit_btn.setEnabled(enabled)
        self.push_btn.setEnabled(enabled)
        self.pull_btn.setEnabled(enabled)
        self.cleanup_btn.setEnabled(enabled)

    def _refresh_status(self):
        self._run_operation("status", "Checking status")

    def _commit_all(self):
        reply = QMessageBox.question(self, "Commit", "Commit all changes?",
                                      QMessageBox.Yes | QMessageBox.No)
        if reply == QMessageBox.Yes:
            self._run_operation("commit", "Committing")

    def _push(self):
        self._run_operation("push", "Pushing")

    def _pull_and_merge(self):
        reply = QMessageBox.question(self, "Merge", "Merge all feature branches?",
                                      QMessageBox.Yes | QMessageBox.No)
        if reply == QMessageBox.Yes:
            self._run_operation("pull_merge", "Merging", conflict_strategy='skip')

    def _cleanup_branches(self):
        reply = QMessageBox.question(self, "Cleanup", "Delete merged branches?",
                                      QMessageBox.Yes | QMessageBox.No)
        if reply == QMessageBox.Yes:
            self._run_operation("cleanup", "Cleaning up")
