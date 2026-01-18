"""
Embeddable Git Tools widget for structured group commits.
Based on git_tools_dialog.py but as a QWidget for embedding.
"""
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QListWidget, QListWidgetItem,
    QCheckBox, QSpinBox, QTextEdit, QPushButton, QMessageBox, QLineEdit
)
from PySide6.QtCore import Qt

try:
    from ..git_tools import GROUPS, dry_run as git_dry_run, commit_groups as git_commit_groups, count_changes as git_count_changes
    from .. import theme
except ImportError:
    from git_tools import GROUPS, dry_run as git_dry_run, commit_groups as git_commit_groups, count_changes as git_count_changes
    import theme


class GitToolsWidget(QWidget):
    """Embeddable Git tools widget for structured group commits."""

    def __init__(self, parent=None, notify_target=None):
        super().__init__(parent)
        self._notify_target = notify_target
        self._build_ui()

    def _build_ui(self):
        self.setStyleSheet(
            theme.get_dialog_stylesheet() +
            theme.get_input_stylesheet() +
            theme.get_scrollbar_stylesheet() +
            f"""
            QTextEdit {{
                background-color: {theme.BG_TERTIARY};
                color: {theme.TEXT_PRIMARY};
                font-family: 'Consolas', 'Courier New', monospace;
                font-size: 9pt;
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
            }}
            QListWidget {{
                background-color: {theme.BG_TERTIARY};
                color: {theme.TEXT_PRIMARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
            }}
            QListWidget::item {{
                padding: 4px;
            }}
            QListWidget::item:selected {{
                background-color: {theme.ACCENT_PRIMARY};
                color: {theme.TEXT_INVERSE};
            }}
            """
        )

        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        layout.setContentsMargins(16, 12, 16, 12)

        # Header
        header = QLabel("Git Commit Groups")
        header.setStyleSheet(f"font-size: 13pt; font-weight: bold; color: {theme.TEXT_PRIMARY};")
        layout.addWidget(header)

        # Info
        info = QLabel("Select groups, Dry Run to preview, Commit to apply.")
        info.setWordWrap(True)
        info.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt;")
        layout.addWidget(info)

        # Group list
        self.list_widget = QListWidget()
        self.list_widget.setSelectionMode(QListWidget.MultiSelection)
        self.list_widget.setMaximumHeight(180)
        for g in GROUPS:
            item = QListWidgetItem(f"{g.key} | {g.message}")
            item.setData(Qt.UserRole, g.key)
            self.list_widget.addItem(item)
        self.list_widget.itemSelectionChanged.connect(self._update_override_enabled)
        layout.addWidget(self.list_widget)

        # Controls row
        ctrl_row = QHBoxLayout()
        ctrl_row.setSpacing(8)

        self.show_unchanged_cb = QCheckBox("Show unchanged")
        self.show_unchanged_cb.setChecked(True)
        ctrl_row.addWidget(self.show_unchanged_cb)

        ctrl_row.addWidget(QLabel("Warn if >="))
        self.threshold_spin = QSpinBox()
        self.threshold_spin.setRange(1, 5000)
        self.threshold_spin.setValue(50)
        self.threshold_spin.setFixedWidth(70)
        ctrl_row.addWidget(self.threshold_spin)

        ctrl_row.addStretch()
        layout.addLayout(ctrl_row)

        # Override message row
        override_row = QHBoxLayout()
        override_row.setSpacing(8)
        override_row.addWidget(QLabel("Override msg:"))
        self.override_edit = QLineEdit()
        self.override_edit.setPlaceholderText("Leave empty to use default")
        self.override_edit.setEnabled(False)
        override_row.addWidget(self.override_edit)
        layout.addLayout(override_row)

        # Output
        self.output = QTextEdit()
        self.output.setReadOnly(True)
        self.output.setMaximumHeight(140)
        layout.addWidget(self.output)

        # Buttons
        btn_row = QHBoxLayout()
        btn_row.setSpacing(8)

        btn_dry = QPushButton("Dry Run")
        btn_dry.setToolTip("Preview changes without committing")
        btn_dry.clicked.connect(self._do_dry_run)
        btn_row.addWidget(btn_dry)

        btn_commit = QPushButton("Commit")
        btn_commit.setToolTip("Commit selected groups")
        btn_commit.setStyleSheet(f"""
            QPushButton {{
                background-color: {theme.ACCENT_SUCCESS};
                font-weight: bold;
            }}
            QPushButton:hover {{ background-color: #56d364; }}
        """)
        btn_commit.clicked.connect(self._do_commit)
        btn_row.addWidget(btn_commit)

        btn_row.addStretch()
        layout.addLayout(btn_row)

        layout.addStretch()

    def _update_override_enabled(self):
        keys = self._selected_keys()
        self.override_edit.setEnabled(len(keys) == 1)

    def _selected_keys(self):
        return [
            self.list_widget.item(i).data(Qt.UserRole)
            for i in range(self.list_widget.count())
            if self.list_widget.item(i).isSelected()
        ]

    def _do_dry_run(self):
        keys = self._selected_keys()
        if not keys:
            self.output.setPlainText("(no groups selected)")
            return
        text = git_dry_run(keys, self.show_unchanged_cb.isChecked())
        self.output.setPlainText(text if text else "(no changes)")

    def _do_commit(self):
        keys = self._selected_keys()
        if not keys:
            self.output.setPlainText("(no groups selected)")
            return

        total = git_count_changes(keys)
        if total >= self.threshold_spin.value():
            reply = QMessageBox.question(
                self, "Confirm Commit",
                f"This will commit ~{total} changed files. Continue?",
                QMessageBox.Yes | QMessageBox.No
            )
            if reply != QMessageBox.Yes:
                self.output.setPlainText("(cancelled)")
                return

        override_map = None
        if len(keys) == 1 and self.override_edit.text().strip():
            override_map = {keys[0]: self.override_edit.text().strip()}

        res = git_commit_groups(keys, message_override=override_map)
        lines = [f"{k}: {msg}" for k, msg in res]
        self.output.setPlainText("\n".join(lines) if lines else "(no actions)")

        if self._notify_target and hasattr(self._notify_target, "notify"):
            self._notify_target.notify("Commit completed")
