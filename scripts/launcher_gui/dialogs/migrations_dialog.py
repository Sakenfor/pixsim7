from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QLabel, QTextEdit, QHBoxLayout, QPushButton, QMessageBox
)

try:
    from ..migration_tools import get_current_revision, get_heads, get_history, upgrade_head, downgrade_one, stamp_head
except ImportError:
    from migration_tools import get_current_revision, get_heads, get_history, upgrade_head, downgrade_one, stamp_head


def show_migrations_dialog(parent):
    dlg = QDialog(parent)
    dlg.setWindowTitle('Alembic Migrations')
    dlg.setMinimumWidth(600)
    dlg.setMinimumHeight(400)
    dlg.setStyleSheet("""
        QDialog {
            background-color: #f9f9f9;
        }
        QLabel {
            color: #1a1a1a;
            font-size: 10pt;
        }
        QTextEdit {
            background-color: #1e1e1e;
            color: #d4d4d4;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 9pt;
            border: 1px solid #ccc;
            border-radius: 4px;
        }
        QPushButton {
            background-color: #2196F3;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 8px 16px;
            font-weight: bold;
            min-height: 28px;
        }
        QPushButton:hover {
            background-color: #1976D2;
        }
        QPushButton:pressed {
            background-color: #0D47A1;
        }
    """)
    layout = QVBoxLayout(dlg)
    layout.setSpacing(12)
    layout.setContentsMargins(20, 20, 20, 20)
    info = QLabel('Database migration operations (local). Use with caution on shared DB.')
    info.setWordWrap(True)
    info.setStyleSheet("color: #555; font-weight: 500;")
    layout.addWidget(info)

    status_box = QTextEdit(); status_box.setReadOnly(True); status_box.setMinimumHeight(180)
    layout.addWidget(status_box)

    btn_row1 = QHBoxLayout()
    btn_refresh = QPushButton('Refresh Status')
    btn_history = QPushButton('Show History')
    btn_row1.addWidget(btn_refresh)
    btn_row1.addWidget(btn_history)
    btn_row1.addStretch()
    layout.addLayout(btn_row1)

    btn_row2 = QHBoxLayout()
    btn_upgrade = QPushButton('Upgrade Head')
    btn_downgrade = QPushButton('Downgrade -1')
    btn_stamp = QPushButton('Stamp Head')
    btn_row2.addWidget(btn_upgrade)
    btn_row2.addWidget(btn_downgrade)
    btn_row2.addWidget(btn_stamp)
    btn_row2.addStretch()
    layout.addLayout(btn_row2)

    btn_close = QPushButton('Close')
    layout.addWidget(btn_close)

    def refresh():
        current = get_current_revision()
        heads = get_heads()
        status_box.setPlainText(f"Current Revision:\n{current}\n\nHeads:\n{heads}")

    def show_history():
        hist = get_history()
        status_box.setPlainText(f"History (latest):\n{hist}")

    def do_upgrade():
        res = upgrade_head(); status_box.append(f"\n{res}")
        refresh()

    def do_downgrade():
        reply = QMessageBox.question(dlg, 'Confirm Downgrade', 'Downgrade -1? This may remove latest schema changes.', QMessageBox.Yes | QMessageBox.No)
        if reply == QMessageBox.Yes:
            res = downgrade_one(); status_box.append(f"\n{res}")
            refresh()

    def do_stamp():
        reply = QMessageBox.question(dlg, 'Confirm Stamp', 'Stamp head sets DB revision without migration. Proceed?', QMessageBox.Yes | QMessageBox.No)
        if reply == QMessageBox.Yes:
            res = stamp_head(); status_box.append(f"\n{res}")
            refresh()

    btn_refresh.clicked.connect(refresh)
    btn_history.clicked.connect(show_history)
    btn_upgrade.clicked.connect(do_upgrade)
    btn_downgrade.clicked.connect(do_downgrade)
    btn_stamp.clicked.connect(do_stamp)
    btn_close.clicked.connect(dlg.accept)
    refresh()
    dlg.exec()
