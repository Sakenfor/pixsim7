from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QLabel, QTextEdit, QHBoxLayout, QPushButton,
    QMessageBox, QGroupBox, QFrame
)
from PySide6.QtCore import Qt

try:
    from ..migration_tools import (
        get_current_revision, get_heads, get_history, upgrade_head, downgrade_one, stamp_head,
        parse_heads, merge_heads, get_pending_migrations, validate_revision_ids
    )
except ImportError:
    from migration_tools import (
        get_current_revision, get_heads, get_history, upgrade_head, downgrade_one, stamp_head,
        parse_heads, merge_heads, get_pending_migrations, validate_revision_ids
    )


def show_migrations_dialog(parent):
    dlg = QDialog(parent)
    dlg.setWindowTitle('Database Migrations Manager')
    dlg.setMinimumWidth(700)
    dlg.setMinimumHeight(550)
    dlg.setStyleSheet("""
        QDialog {
            background-color: #f5f5f5;
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
            min-height: 32px;
        }
        QPushButton:hover {
            background-color: #1976D2;
        }
        QPushButton:pressed {
            background-color: #0D47A1;
        }
        QPushButton:disabled {
            background-color: #cccccc;
            color: #888888;
        }
        QGroupBox {
            background-color: white;
            border: 1px solid #ddd;
            border-radius: 6px;
            margin-top: 12px;
            padding-top: 12px;
            font-weight: bold;
        }
        QGroupBox::title {
            subcontrol-origin: margin;
            left: 10px;
            padding: 0 5px;
        }
    """)

    layout = QVBoxLayout(dlg)
    layout.setSpacing(12)
    layout.setContentsMargins(20, 20, 20, 20)

    # Header with explanation
    header = QLabel('📊 Database Schema Version Control')
    header.setStyleSheet("font-size: 14pt; font-weight: bold; color: #333; margin-bottom: 8px;")
    layout.addWidget(header)

    help_text = QLabel(
        "Migrations keep your database schema in sync with code changes. "
        "Always backup your database before applying migrations!"
    )
    help_text.setWordWrap(True)
    help_text.setStyleSheet("color: #666; font-size: 9pt; margin-bottom: 8px;")
    layout.addWidget(help_text)

    # Status indicator
    status_frame = QFrame()
    status_frame.setFrameShape(QFrame.StyledPanel)
    status_frame.setStyleSheet("background-color: white; border: 1px solid #ddd; border-radius: 6px; padding: 12px;")
    status_layout = QVBoxLayout(status_frame)
    status_layout.setContentsMargins(12, 12, 12, 12)

    status_label = QLabel('🔄 Checking status...')
    status_label.setStyleSheet("font-size: 11pt; font-weight: bold;")
    status_layout.addWidget(status_label)

    status_detail = QLabel('')
    status_detail.setWordWrap(True)
    status_detail.setStyleSheet("font-size: 9pt; color: #555; margin-top: 4px;")
    status_layout.addWidget(status_detail)

    layout.addWidget(status_frame)

    # Branch conflict warning card (initially hidden)
    branch_warning_frame = QFrame()
    branch_warning_frame.setFrameShape(QFrame.StyledPanel)
    branch_warning_frame.setStyleSheet("""
        QFrame {
            background-color: #fff3cd;
            border: 2px solid #ff9800;
            border-radius: 6px;
            padding: 12px;
        }
    """)
    branch_warning_frame.setVisible(False)
    branch_warning_layout = QVBoxLayout(branch_warning_frame)
    branch_warning_layout.setContentsMargins(12, 12, 12, 12)

    branch_warning_header = QLabel('⚠️ Multiple Migration Branches Detected')
    branch_warning_header.setStyleSheet("font-size: 11pt; font-weight: bold; color: #f57c00;")
    branch_warning_layout.addWidget(branch_warning_header)

    branch_warning_text = QLabel()
    branch_warning_text.setWordWrap(True)
    branch_warning_text.setStyleSheet("font-size: 9pt; color: #555; margin-top: 4px;")
    branch_warning_layout.addWidget(branch_warning_text)

    branch_heads_list = QLabel()
    branch_heads_list.setStyleSheet("font-family: 'Consolas', monospace; font-size: 9pt; color: #333; margin: 8px 0;")
    branch_warning_layout.addWidget(branch_heads_list)

    branch_merge_btn = QPushButton('🔀 Auto-Merge Branches')
    branch_merge_btn.setToolTip('Automatically create a merge migration to unify the branches')
    branch_merge_btn.setStyleSheet("""
        QPushButton {
            background-color: #ff9800;
            color: white;
            font-weight: bold;
            padding: 8px 16px;
        }
        QPushButton:hover {
            background-color: #fb8c00;
        }
    """)
    branch_warning_layout.addWidget(branch_merge_btn)

    layout.addWidget(branch_warning_frame)

    # Revision ID validation warning (initially hidden)
    revid_warning_frame = QFrame()
    revid_warning_frame.setFrameShape(QFrame.StyledPanel)
    revid_warning_frame.setStyleSheet("""
        QFrame {
            background-color: #ffebee;
            border: 2px solid #f44336;
            border-radius: 6px;
            padding: 12px;
        }
    """)
    revid_warning_frame.setVisible(False)
    revid_warning_layout = QVBoxLayout(revid_warning_frame)
    revid_warning_layout.setContentsMargins(12, 12, 12, 12)

    revid_warning_header = QLabel('🚨 Revision ID Length Issue Detected')
    revid_warning_header.setStyleSheet("font-size: 11pt; font-weight: bold; color: #d32f2f;")
    revid_warning_layout.addWidget(revid_warning_header)

    revid_warning_text = QLabel()
    revid_warning_text.setWordWrap(True)
    revid_warning_text.setStyleSheet("font-size: 9pt; color: #555; margin-top: 4px;")
    revid_warning_layout.addWidget(revid_warning_text)

    revid_list = QLabel()
    revid_list.setStyleSheet("font-family: 'Consolas', monospace; font-size: 9pt; color: #333; margin: 8px 0;")
    revid_warning_layout.addWidget(revid_list)

    layout.addWidget(revid_warning_frame)

    # Details box
    details_group = QGroupBox("Details (Technical)")
    details_layout = QVBoxLayout(details_group)
    status_box = QTextEdit()
    status_box.setReadOnly(True)
    status_box.setMinimumHeight(150)
    details_layout.addWidget(status_box)
    layout.addWidget(details_group)

    # Action buttons with clear labels
    actions_group = QGroupBox("Actions")
    actions_layout = QVBoxLayout(actions_group)

    # Info buttons row
    info_row = QHBoxLayout()
    btn_refresh = QPushButton('🔄 Check Status')
    btn_refresh.setToolTip('Check current database version and available updates')
    btn_history = QPushButton('📜 View History')
    btn_history.setToolTip('Show all migration versions applied to the database')
    info_row.addWidget(btn_refresh)
    info_row.addWidget(btn_history)
    info_row.addStretch()
    actions_layout.addLayout(info_row)

    # Main action buttons row
    main_row = QHBoxLayout()
    btn_upgrade = QPushButton('⬆️ Apply Updates')
    btn_upgrade.setToolTip('Apply all pending migrations to update database schema')
    btn_upgrade.setStyleSheet("""
        QPushButton {
            background-color: #4CAF50;
            font-size: 11pt;
        }
        QPushButton:hover {
            background-color: #45a049;
        }
        QPushButton:disabled {
            background-color: #cccccc;
        }
    """)
    main_row.addWidget(btn_upgrade)
    actions_layout.addLayout(main_row)

    # Advanced buttons row (initially hidden)
    advanced_row = QHBoxLayout()
    btn_downgrade = QPushButton('⬇️ Rollback One')
    btn_downgrade.setToolTip('⚠️ ADVANCED: Undo the last migration (may lose data)')
    btn_downgrade.setStyleSheet("""
        QPushButton {
            background-color: #ff9800;
            font-size: 9pt;
        }
        QPushButton:hover {
            background-color: #fb8c00;
        }
    """)
    btn_stamp = QPushButton('🏷️ Mark as Updated')
    btn_stamp.setToolTip('⚠️ ADVANCED: Mark database as current without running migrations')
    btn_stamp.setStyleSheet("""
        QPushButton {
            background-color: #9E9E9E;
            font-size: 9pt;
        }
        QPushButton:hover {
            background-color: #757575;
        }
    """)
    advanced_row.addWidget(btn_downgrade)
    advanced_row.addWidget(btn_stamp)
    advanced_row.addStretch()
    actions_layout.addLayout(advanced_row)

    advanced_warning = QLabel('⚠️ Advanced options may cause data loss - use only if you know what you\'re doing!')
    advanced_warning.setStyleSheet("color: #f44336; font-size: 8pt; font-style: italic;")
    actions_layout.addWidget(advanced_warning)

    layout.addWidget(actions_group)

    # Close button
    btn_close = QPushButton('Close')
    btn_close.setStyleSheet("background-color: #757575;")
    layout.addWidget(btn_close)

    def parse_status(current_text, heads_text):
        """Parse alembic output and determine status"""
        current_clean = current_text.strip()
        heads_clean = heads_text.strip()

        # Check for errors
        if 'error' in current_clean.lower() or 'error' in heads_clean.lower():
            return 'error', 'Database connection error', '❌'

        # Extract revision IDs
        current_rev = None
        if current_clean and '(' not in current_clean:
            parts = current_clean.split()
            if parts:
                current_rev = parts[0]
        elif '(head)' in current_clean:
            current_rev = current_clean.split()[0]

        heads_rev = None
        if '(head)' in heads_clean:
            heads_rev = heads_clean.split()[0]
        elif heads_clean and not heads_clean.startswith('error'):
            parts = heads_clean.split()
            if parts:
                heads_rev = parts[0]

        # Determine status
        if current_rev and heads_rev:
            if current_rev == heads_rev:
                return 'up_to_date', f'Database is up-to-date (version {current_rev[:8]}...)', '✅'
            else:
                return 'pending', f'Updates available! Current: {current_rev[:8]}... → Latest: {heads_rev[:8]}...', '⚠️'
        elif not current_rev:
            return 'not_initialized', 'Database not initialized with migrations', '❓'
        else:
            return 'unknown', 'Status unclear - check details below', '❔'

    def refresh():
        current = get_current_revision()
        heads = get_heads()

        # Check for multiple heads (branch conflict)
        heads_list, heads_err = parse_heads()
        if not heads_err and len(heads_list) > 1:
            # Show branch warning
            branch_warning_frame.setVisible(True)
            branch_warning_text.setText(
                f'Your migration history has {len(heads_list)} separate branches. '
                'This typically happens when working on multiple features in parallel. '
                'Click "Auto-Merge Branches" to create a merge migration that unifies them into a single timeline.'
            )
            # List the heads
            heads_text = '\n'.join([f'  • {h.short_revision} {"(mergepoint)" if h.is_mergepoint else ""}' for h in heads_list])
            branch_heads_list.setText(f'Branches:\n{heads_text}')
        else:
            branch_warning_frame.setVisible(False)

        # Check for revision ID length issues
        valid, problematic = validate_revision_ids()
        if not valid and problematic:
            revid_warning_frame.setVisible(True)
            revid_warning_text.setText(
                f'Found {len(problematic)} revision ID(s) longer than 32 characters. '
                'The alembic_version table uses VARCHAR(32), which will cause errors. '
                'You need to edit these migration files and use shorter revision IDs.'
            )
            revid_text = '\n'.join([f'  • {p}' for p in problematic])
            revid_list.setText(f'Problematic revisions:\n{revid_text}')
        else:
            revid_warning_frame.setVisible(False)

        # Parse and display user-friendly status
        state, message, icon = parse_status(current, heads)
        status_label.setText(f'{icon} {message}')

        if state == 'up_to_date':
            status_label.setStyleSheet("font-size: 11pt; font-weight: bold; color: #4CAF50;")
            status_detail.setText('Your database schema is current. No action needed.')
            btn_upgrade.setEnabled(False)
            btn_upgrade.setText('✅ Already Up-to-Date')
        elif state == 'pending':
            status_label.setStyleSheet("font-size: 11pt; font-weight: bold; color: #ff9800;")
            status_detail.setText('New migrations are available. Click "Apply Updates" to update your database schema.')
            btn_upgrade.setEnabled(True)
            btn_upgrade.setText('⬆️ Apply Updates')
        elif state == 'error':
            status_label.setStyleSheet("font-size: 11pt; font-weight: bold; color: #f44336;")
            status_detail.setText('Cannot connect to database or check migrations. Ensure backend is running.')
            btn_upgrade.setEnabled(False)
        else:
            status_label.setStyleSheet("font-size: 11pt; font-weight: bold; color: #2196F3;")
            status_detail.setText('Check details below for current migration status.')
            btn_upgrade.setEnabled(True)

        # Show technical details
        status_box.setPlainText(
            f"Current Database Version:\n{current}\n\n"
            f"Latest Available Version:\n{heads}\n\n"
            f"📌 Tip: Current and Latest should match when up-to-date"
        )

    def show_history():
        hist = get_history()
        status_box.setPlainText(
            f"Migration History (most recent first):\n\n{hist}\n\n"
            f"📌 Each line shows a migration that was applied to the database"
        )

    def do_upgrade():
        # First, show backup reminder
        backup_reply = QMessageBox.warning(
            dlg,
            '📋 Important: Database Backup',
            '⚠️ RECOMMENDED: Backup your database before proceeding!\n\n'
            'While migrations are usually safe, having a backup ensures you can:\n'
            '• Recover from unexpected issues\n'
            '• Rollback if something goes wrong\n'
            '• Avoid data loss in case of errors\n\n'
            'Quick backup options:\n'
            '1. Use pgAdmin or your database tool\n'
            '2. Run: pg_dump pixsim7 > backup_$(date +%Y%m%d).sql\n'
            '3. Take a filesystem snapshot if available\n\n'
            '✅ Have you backed up your database?\n',
            QMessageBox.Yes | QMessageBox.No | QMessageBox.Cancel,
            QMessageBox.Cancel
        )

        if backup_reply == QMessageBox.Cancel:
            return
        elif backup_reply == QMessageBox.No:
            # User says they haven't backed up, confirm they want to proceed anyway
            proceed_anyway = QMessageBox.question(
                dlg,
                'Proceed Without Backup?',
                '⚠️ You indicated you have NOT backed up your database.\n\n'
                'Proceeding without a backup is risky. If something goes wrong,\n'
                'you may not be able to recover your data.\n\n'
                'Are you sure you want to continue?',
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No
            )
            if proceed_anyway != QMessageBox.Yes:
                return

        # Now confirm the actual migration
        reply = QMessageBox.question(
            dlg,
            'Confirm Database Update',
            '⚠️ This will apply new migrations to your database.\n\n'
            'What this does:\n'
            '• Creates new tables if needed\n'
            '• Adds new columns to existing tables\n'
            '• Updates database structure to match latest code\n\n'
            '✅ Usually safe with proper backups\n\n'
            'Continue with migration?',
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.Yes
        )
        if reply == QMessageBox.Yes:
            status_box.append('\n⏳ Applying migrations...\n')
            res = upgrade_head()
            status_box.append(f"{res}\n")
            if 'error' not in res.lower() and 'failed' not in res.lower() and '❌' not in res:
                status_box.append('✅ Migrations applied successfully!\n')
            else:
                status_box.append('❌ Migration failed. Check error message above.\n')
            refresh()

    def do_downgrade():
        # First, verify they have a backup
        backup_check = QMessageBox.critical(
            dlg,
            '🛑 DANGER: Backup Required',
            '⚠️ STOP: This operation can DELETE DATA!\n\n'
            'Downgrading a migration may:\n'
            '• DROP entire tables permanently\n'
            '• DELETE columns and all their data\n'
            '• REMOVE indexes and constraints\n\n'
            '🔴 REQUIRED: You MUST have a database backup before proceeding!\n\n'
            'Do you have a VERIFIED backup that you can restore from?',
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )

        if backup_check != QMessageBox.Yes:
            QMessageBox.information(
                dlg,
                'Cancelled',
                'Good decision! Create a backup first:\n\n'
                'pg_dump pixsim7 > backup_before_downgrade.sql\n\n'
                'Test that you can restore from it before attempting downgrades.'
            )
            return

        # Double confirmation for downgrade
        reply = QMessageBox.warning(
            dlg,
            '⚠️ Final Confirmation: Rollback (ADVANCED)',
            '⚠️ FINAL WARNING: This will UNDO the last migration!\n\n'
            'What this does:\n'
            '• Rolls back the most recent database change\n'
            '• May DELETE tables or columns with all data\n'
            '• Changes cannot be undone without backup restore\n\n'
            '❌ Only proceed if:\n'
            '• You just applied a wrong migration\n'
            '• You have verified your backup works\n'
            '• You fully understand the consequences\n\n'
            'Type of the current migration to confirm you want to rollback.\n\n'
            'Continue with rollback?',
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            status_box.append('\n⚠️ Rolling back last migration...\n')
            res = downgrade_one()
            status_box.append(f"{res}\n")
            if 'error' not in res.lower() and 'failed' not in res.lower() and '❌' not in res:
                status_box.append('✅ Rollback completed.\n')
            else:
                status_box.append('❌ Rollback failed. Check error message above.\n')
            refresh()

    def do_stamp():
        reply = QMessageBox.warning(
            dlg,
            '⚠️ Confirm Manual Mark (ADVANCED)',
            '⚠️ WARNING: Advanced operation!\n\n'
            'What this does:\n'
            '• Marks database as "up-to-date" WITHOUT running migrations\n'
            '• Does NOT change your actual database structure\n'
            '• Only updates the version tracking table\n\n'
            '⚠️ Only use this if:\n'
            '• You manually created tables yourself\n'
            '• You restored from a backup at a specific version\n'
            '• An expert told you to do this\n\n'
            'Continue?',
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            status_box.append('\n⏳ Marking database as current...\n')
            res = stamp_head()
            status_box.append(f"{res}\n")
            refresh()

    def do_merge():
        """Handle auto-merge of multiple branches."""
        reply = QMessageBox.question(
            dlg,
            'Confirm Branch Merge',
            '🔀 This will create a merge migration to unify your branches.\n\n'
            'What this does:\n'
            '• Creates a new migration file with both branches as parents\n'
            '• Does NOT modify your database (just creates the file)\n'
            '• Unifies the migration timeline into a single head\n\n'
            'After merging, you\'ll need to apply the merge migration using "Apply Updates".\n\n'
            'Continue?',
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.Yes
        )
        if reply == QMessageBox.Yes:
            status_box.append('\n🔀 Creating merge migration...\n')
            res = merge_heads("merge migration branches")
            status_box.append(f"{res}\n")
            if '✅' in res or 'success' in res.lower():
                status_box.append('\n✅ Merge migration created! Now click "Apply Updates" to apply it.\n')
            refresh()

    btn_refresh.clicked.connect(refresh)
    btn_history.clicked.connect(show_history)
    btn_upgrade.clicked.connect(do_upgrade)
    btn_downgrade.clicked.connect(do_downgrade)
    btn_stamp.clicked.connect(do_stamp)
    branch_merge_btn.clicked.connect(do_merge)
    btn_close.clicked.connect(dlg.accept)

    # Initial status check
    refresh()

    dlg.exec()
