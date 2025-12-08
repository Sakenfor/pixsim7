from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QLabel, QListWidget, QListWidgetItem, QHBoxLayout,
    QCheckBox, QSpinBox, QTextEdit, QPushButton, QMessageBox, QLineEdit
)
from PySide6.QtCore import Qt

try:
    from ..git_tools import GROUPS, dry_run as git_dry_run, commit_groups as git_commit_groups, count_changes as git_count_changes
    from .. import theme
except ImportError:
    from git_tools import GROUPS, dry_run as git_dry_run, commit_groups as git_commit_groups, count_changes as git_count_changes
    import theme

try:
    from ..logger import launcher_logger as _launcher_logger
except ImportError:
    try:
        from logger import launcher_logger as _launcher_logger
    except Exception:
        _launcher_logger = None


def show_git_tools_dialog(parent):
    dlg = QDialog(parent)
    dlg.setWindowTitle('Git Commit Groups')
    dlg.setMinimumWidth(600)
    dlg.setMinimumHeight(500)
    dlg.setStyleSheet(
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
    layout = QVBoxLayout(dlg)
    layout.setSpacing(12)
    layout.setContentsMargins(20, 20, 20, 20)
    info = QLabel('Structured commit helper. Select groups, Dry Run to preview, Commit to apply. No remote push.')
    info.setWordWrap(True)
    info.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-weight: 500;")
    layout.addWidget(info)

    listw = QListWidget()
    listw.setSelectionMode(QListWidget.MultiSelection)
    for g in GROUPS:
        item = QListWidgetItem(f"{g.key} | {g.message}")
        item.setData(Qt.UserRole, g.key)
        listw.addItem(item)
    layout.addWidget(listw)

    ctrl_row = QHBoxLayout()
    show_unchanged_cb = QCheckBox('Show unchanged'); show_unchanged_cb.setChecked(True)
    ctrl_row.addWidget(show_unchanged_cb)

    threshold_label = QLabel('Warn if files ≥')
    threshold_spin = QSpinBox(); threshold_spin.setRange(1, 5000); threshold_spin.setValue(50)
    ctrl_row.addWidget(threshold_label); ctrl_row.addWidget(threshold_spin); ctrl_row.addStretch()
    layout.addLayout(ctrl_row)

    override_row = QHBoxLayout()
    override_label = QLabel('Override message (single group):')
    override_edit = QLineEdit(); override_edit.setPlaceholderText('Leave empty to use default group message'); override_edit.setEnabled(False)
    override_row.addWidget(override_label); override_row.addWidget(override_edit)
    layout.addLayout(override_row)

    output = QTextEdit(); output.setReadOnly(True); output.setMinimumHeight(240)
    layout.addWidget(output)

    btn_row = QHBoxLayout()
    btn_dry = QPushButton('Dry Run')
    btn_commit = QPushButton('Commit')
    btn_close = QPushButton('Close')
    btn_row.addWidget(btn_dry); btn_row.addWidget(btn_commit); btn_row.addStretch(); btn_row.addWidget(btn_close)
    layout.addLayout(btn_row)

    def update_override_enabled():
        keys = [listw.item(i).data(Qt.UserRole) for i in range(listw.count()) if listw.item(i).isSelected()]
        override_edit.setEnabled(len(keys) == 1)

    listw.itemSelectionChanged.connect(update_override_enabled)

    def selected_keys():
        return [listw.item(i).data(Qt.UserRole) for i in range(listw.count()) if listw.item(i).isSelected()]

    def do_dry():
        keys = selected_keys()
        text = git_dry_run(keys, show_unchanged_cb.isChecked())
        output.setPlainText(text if text else '(no changes)')

    def do_commit():
        keys = selected_keys()
        total = git_count_changes(keys)
        if total >= threshold_spin.value():
            reply = QMessageBox.question(
                dlg,
                'Confirm Commit',
                f'This will commit approximately {total} changed files across selected groups. Continue?',
                QMessageBox.Yes | QMessageBox.No
            )
            if reply != QMessageBox.Yes:
                output.setPlainText('(cancelled)')
                return
        override_map = None
        if len(keys) == 1 and override_edit.text().strip():
            override_map = {keys[0]: override_edit.text().strip()}
        res = git_commit_groups(keys, message_override=override_map)
        lines = [f"{k}: {msg}" for k, msg in res]
        output.setPlainText('\n'.join(lines) if lines else '(no actions)')
        if _launcher_logger:
            try:
                _launcher_logger.info('git_commit_groups', groups=keys, results=lines)
            except Exception:
                pass

    btn_dry.clicked.connect(do_dry)
    btn_commit.clicked.connect(do_commit)
    btn_close.clicked.connect(dlg.accept)
    dlg.exec()
