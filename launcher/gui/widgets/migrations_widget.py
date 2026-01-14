"""
Migrations widget for embedding the migration manager UI inside tabs.
"""
from __future__ import annotations

from typing import Callable, Optional

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QLabel, QTextEdit, QHBoxLayout, QPushButton,
    QMessageBox, QGroupBox, QFrame, QScrollArea
)
from PySide6.QtCore import Qt

try:
    from ..migration_tools import (
        get_current_revision, get_heads, get_history, upgrade_head, downgrade_one, stamp_head,
        parse_heads, merge_heads, get_pending_migrations_detailed,
        parse_migration_history, validate_revision_ids
    )
    from .. import theme
except ImportError:
    from migration_tools import (
        get_current_revision, get_heads, get_history, upgrade_head, downgrade_one, stamp_head,
        parse_heads, merge_heads, get_pending_migrations_detailed,
        parse_migration_history, validate_revision_ids
    )
    import theme


class MigrationsWidget(QWidget):
    """Embeddable migrations manager UI."""

    def __init__(
        self,
        parent=None,
        notify_target: Optional[object] = None,
        show_close_button: bool = False,
        on_close: Optional[Callable[[], None]] = None,
    ) -> None:
        super().__init__(parent)
        self._notify_target = notify_target
        self._show_close_button = show_close_button
        self._on_close = on_close
        self._build_ui()

    def _build_ui(self) -> None:
        self.setStyleSheet(
            theme.get_dialog_stylesheet()
            + theme.get_button_stylesheet()
            + theme.get_scrollbar_stylesheet()
            + f"""
            QTextEdit {{
                background-color: {theme.BG_TERTIARY};
                color: {theme.TEXT_PRIMARY};
                font-family: 'Consolas', 'Courier New', monospace;
                font-size: 9pt;
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
            }}
            QGroupBox {{
                background-color: {theme.BG_SECONDARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
                margin-top: 12px;
                padding-top: 12px;
                font-weight: bold;
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
        layout.setContentsMargins(20, 20, 20, 20)

        # Header with explanation
        header = QLabel("Database Schema Version Control")
        header.setStyleSheet(
            f"font-size: 14pt; font-weight: bold; color: {theme.TEXT_PRIMARY}; margin-bottom: 8px;"
        )
        layout.addWidget(header)

        help_text = QLabel(
            "Migrations keep your database schema in sync with code changes. "
            "Always backup your database before applying migrations!"
        )
        help_text.setWordWrap(True)
        help_text.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt; margin-bottom: 8px;")
        layout.addWidget(help_text)

        # Status indicator
        status_frame = QFrame()
        status_frame.setFrameShape(QFrame.StyledPanel)
        status_frame.setStyleSheet(
            f"background-color: {theme.BG_TERTIARY}; border: 1px solid {theme.BORDER_DEFAULT};"
            f" border-radius: 6px; padding: 12px;"
        )
        status_layout = QVBoxLayout(status_frame)
        status_layout.setContentsMargins(12, 12, 12, 12)

        status_label = QLabel("Checking status...")
        status_label.setStyleSheet(f"font-size: 11pt; font-weight: bold; color: {theme.TEXT_PRIMARY};")
        status_layout.addWidget(status_label)

        status_detail = QLabel("")
        status_detail.setWordWrap(True)
        status_detail.setStyleSheet(f"font-size: 9pt; color: {theme.TEXT_SECONDARY}; margin-top: 4px;")
        status_layout.addWidget(status_detail)

        layout.addWidget(status_frame)

        # Branch conflict warning card (initially hidden)
        branch_warning_frame = QFrame()
        branch_warning_frame.setFrameShape(QFrame.StyledPanel)
        branch_warning_frame.setStyleSheet(
            f"""
            QFrame {{
                background-color: {theme.BG_TERTIARY};
                border: 2px solid {theme.ACCENT_WARNING};
                border-radius: 6px;
                padding: 12px;
            }}
            """
        )
        branch_warning_frame.setVisible(False)
        branch_warning_layout = QVBoxLayout(branch_warning_frame)
        branch_warning_layout.setContentsMargins(12, 12, 12, 12)

        branch_warning_header = QLabel("Multiple Migration Branches Detected")
        branch_warning_header.setStyleSheet(
            f"font-size: 11pt; font-weight: bold; color: {theme.ACCENT_WARNING};"
        )
        branch_warning_layout.addWidget(branch_warning_header)

        branch_warning_text = QLabel()
        branch_warning_text.setWordWrap(True)
        branch_warning_text.setStyleSheet(f"font-size: 9pt; color: {theme.TEXT_SECONDARY}; margin-top: 4px;")
        branch_warning_layout.addWidget(branch_warning_text)

        branch_heads_list = QLabel()
        branch_heads_list.setStyleSheet(
            f"font-family: 'Consolas', monospace; font-size: 9pt; color: {theme.TEXT_PRIMARY}; margin: 8px 0;"
        )
        branch_warning_layout.addWidget(branch_heads_list)

        branch_merge_btn = QPushButton("Auto-Merge Branches")
        branch_merge_btn.setToolTip("Automatically create a merge migration to unify the branches")
        branch_merge_btn.setStyleSheet(
            f"""
            QPushButton {{
                background-color: {theme.ACCENT_WARNING};
                color: white;
                font-weight: bold;
                padding: 8px 16px;
            }}
            QPushButton:hover {{
                background-color: #e8a730;
            }}
            """
        )
        branch_warning_layout.addWidget(branch_merge_btn)

        layout.addWidget(branch_warning_frame)
        # Revision ID validation warning (initially hidden)
        revid_warning_frame = QFrame()
        revid_warning_frame.setFrameShape(QFrame.StyledPanel)
        revid_warning_frame.setStyleSheet(
            f"""
            QFrame {{
                background-color: {theme.BG_TERTIARY};
                border: 2px solid {theme.ACCENT_ERROR};
                border-radius: 6px;
                padding: 12px;
            }}
            """
        )
        revid_warning_frame.setVisible(False)
        revid_warning_layout = QVBoxLayout(revid_warning_frame)
        revid_warning_layout.setContentsMargins(12, 12, 12, 12)

        revid_warning_header = QLabel("Revision ID Length Issue Detected")
        revid_warning_header.setStyleSheet(
            f"font-size: 11pt; font-weight: bold; color: {theme.ACCENT_ERROR};"
        )
        revid_warning_layout.addWidget(revid_warning_header)

        revid_warning_text = QLabel()
        revid_warning_text.setWordWrap(True)
        revid_warning_text.setStyleSheet(f"font-size: 9pt; color: {theme.TEXT_SECONDARY}; margin-top: 4px;")
        revid_warning_layout.addWidget(revid_warning_text)

        revid_list = QLabel()
        revid_list.setStyleSheet(
            f"font-family: 'Consolas', monospace; font-size: 9pt; color: {theme.TEXT_PRIMARY}; margin: 8px 0;"
        )
        revid_warning_layout.addWidget(revid_list)

        layout.addWidget(revid_warning_frame)

        # Pending Migrations List (initially hidden)
        pending_group = QGroupBox("Pending Migrations")
        pending_group.setVisible(False)
        pending_layout = QVBoxLayout(pending_group)

        pending_scroll = QScrollArea()
        pending_scroll.setWidgetResizable(True)
        pending_scroll.setMaximumHeight(200)
        pending_scroll.setStyleSheet(
            """
            QScrollArea {
                border: none;
                background-color: transparent;
            }
            """
        )

        pending_container = QWidget()
        pending_container_layout = QVBoxLayout(pending_container)
        pending_container_layout.setSpacing(8)
        pending_container_layout.setContentsMargins(0, 0, 0, 0)

        pending_scroll.setWidget(pending_container)
        pending_layout.addWidget(pending_scroll)

        layout.addWidget(pending_group)

        # Migration Timeline (initially hidden)
        timeline_group = QGroupBox("Migration Timeline")
        timeline_group.setVisible(False)
        timeline_layout = QVBoxLayout(timeline_group)

        timeline_scroll = QScrollArea()
        timeline_scroll.setWidgetResizable(True)
        timeline_scroll.setMaximumHeight(250)
        timeline_scroll.setStyleSheet(
            """
            QScrollArea {
                border: none;
                background-color: transparent;
            }
            """
        )

        timeline_container = QWidget()
        timeline_container_layout = QVBoxLayout(timeline_container)
        timeline_container_layout.setSpacing(4)
        timeline_container_layout.setContentsMargins(0, 0, 0, 0)

        timeline_scroll.setWidget(timeline_container)
        timeline_layout.addWidget(timeline_scroll)

        layout.addWidget(timeline_group)

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
        btn_refresh = QPushButton("Check Status")
        btn_refresh.setToolTip("Check current database version and available updates")
        btn_history = QPushButton("View History")
        btn_history.setToolTip("Show all migration versions applied to the database")
        info_row.addWidget(btn_refresh)
        info_row.addWidget(btn_history)
        info_row.addStretch()
        actions_layout.addLayout(info_row)

        # Main action buttons row
        main_row = QHBoxLayout()
        btn_upgrade = QPushButton("Apply Updates")
        btn_upgrade.setToolTip("Apply all pending migrations to update database schema")
        btn_upgrade.setStyleSheet(
            f"""
            QPushButton {{
                background-color: {theme.ACCENT_SUCCESS};
                font-size: 11pt;
            }}
            QPushButton:hover {{
                background-color: #56d364;
            }}
            QPushButton:disabled {{
                background-color: {theme.BG_TERTIARY};
                color: {theme.TEXT_DISABLED};
            }}
            """
        )
        main_row.addWidget(btn_upgrade)
        actions_layout.addLayout(main_row)

        # Advanced buttons row (initially hidden)
        advanced_row = QHBoxLayout()
        btn_downgrade = QPushButton("Rollback One")
        btn_downgrade.setToolTip("ADVANCED: Undo the last migration (may lose data)")
        btn_downgrade.setStyleSheet(
            f"""
            QPushButton {{
                background-color: {theme.ACCENT_WARNING};
                font-size: 9pt;
            }}
            QPushButton:hover {{
                background-color: #e8a730;
            }}
            """
        )
        btn_stamp = QPushButton("Mark as Updated")
        btn_stamp.setToolTip("ADVANCED: Mark database as current without running migrations")
        btn_stamp.setStyleSheet(
            f"""
            QPushButton {{
                background-color: {theme.TEXT_SECONDARY};
                font-size: 9pt;
            }}
            QPushButton:hover {{
                background-color: {theme.TEXT_DISABLED};
            }}
            """
        )
        advanced_row.addWidget(btn_downgrade)
        advanced_row.addWidget(btn_stamp)
        advanced_row.addStretch()
        actions_layout.addLayout(advanced_row)

        advanced_warning = QLabel("Advanced options may cause data loss - use only if you know what you're doing!")
        advanced_warning.setStyleSheet(f"color: {theme.ACCENT_ERROR}; font-size: 8pt; font-style: italic;")
        actions_layout.addWidget(advanced_warning)

        layout.addWidget(actions_group)

        # Close button (optional)
        if self._show_close_button:
            btn_close = QPushButton("Close")
            btn_close.setStyleSheet(f"background-color: {theme.BG_TERTIARY};")
            if self._on_close:
                btn_close.clicked.connect(self._on_close)
            else:
                btn_close.clicked.connect(self.close)
            layout.addWidget(btn_close)

        notify_target = self._notify_target
        def update_pending_migrations():
            """Update the pending migrations list widget."""
            while pending_container_layout.count():
                child = pending_container_layout.takeAt(0)
                if child.widget():
                    child.widget().deleteLater()

            pending, err = get_pending_migrations_detailed()

            if err or not pending:
                pending_group.setVisible(False)
                return

            pending_group.setVisible(True)

            for migration in pending:
                card = QFrame()
                card.setFrameShape(QFrame.StyledPanel)
                card.setStyleSheet(
                    f"""
                    QFrame {{
                        background-color: {theme.BG_TERTIARY};
                        border-left: 4px solid {theme.ACCENT_WARNING};
                        border-radius: 4px;
                        padding: 8px;
                        margin: 2px 0;
                    }}
                    """
                )
                card_layout = QHBoxLayout(card)
                card_layout.setContentsMargins(8, 8, 8, 8)

                emoji_label = QLabel(migration.status_emoji)
                emoji_label.setStyleSheet("font-size: 18pt;")
                card_layout.addWidget(emoji_label)

                info_layout = QVBoxLayout()

                rev_label = QLabel(f"<b>{migration.short_revision}</b>")
                rev_label.setStyleSheet(f"font-size: 10pt; color: {theme.TEXT_PRIMARY};")
                info_layout.addWidget(rev_label)

                if migration.description:
                    desc_label = QLabel(migration.description)
                    desc_label.setWordWrap(True)
                    desc_label.setStyleSheet(f"font-size: 9pt; color: {theme.TEXT_SECONDARY};")
                    info_layout.addWidget(desc_label)

                card_layout.addLayout(info_layout, 1)

                status_badge = QLabel(migration.status_text)
                status_badge.setStyleSheet(
                    f"""
                    background-color: {theme.ACCENT_WARNING};
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 8pt;
                    font-weight: bold;
                    """
                )
                status_badge.setAlignment(Qt.AlignCenter)
                card_layout.addWidget(status_badge)

                pending_container_layout.addWidget(card)

            pending_container_layout.addStretch()

        def update_timeline():
            """Update the migration timeline widget."""
            while timeline_container_layout.count():
                child = timeline_container_layout.takeAt(0)
                if child.widget():
                    child.widget().deleteLater()

            migrations, err = parse_migration_history()

            if err or not migrations:
                timeline_group.setVisible(False)
                return

            timeline_group.setVisible(True)

            for migration in reversed(migrations):
                item = QFrame()
                item.setFrameShape(QFrame.NoFrame)

                if migration.is_current:
                    bg_color = theme.BG_TERTIARY
                    border_color = theme.ACCENT_PRIMARY
                elif migration.is_applied:
                    bg_color = theme.BG_SECONDARY
                    border_color = theme.ACCENT_SUCCESS
                else:
                    bg_color = theme.BG_PRIMARY
                    border_color = theme.TEXT_DISABLED

                item.setStyleSheet(
                    f"""
                    QFrame {{
                        background-color: {bg_color};
                        border-left: 3px solid {border_color};
                        padding: 6px;
                        margin: 1px 0;
                    }}
                    """
                )

                item_layout = QHBoxLayout(item)
                item_layout.setContentsMargins(8, 6, 8, 6)
                item_layout.setSpacing(8)

                status_label = QLabel(migration.status_emoji)
                status_label.setStyleSheet("font-size: 14pt;")
                status_label.setFixedWidth(30)
                item_layout.addWidget(status_label)

                info_layout = QVBoxLayout()
                info_layout.setSpacing(2)

                rev_layout = QHBoxLayout()
                rev_label = QLabel(f"<b>{migration.short_revision}</b>")
                rev_label.setStyleSheet(f"font-size: 9pt; color: {theme.TEXT_PRIMARY};")
                rev_layout.addWidget(rev_label)

                if migration.is_head:
                    badge = QLabel("HEAD")
                    badge.setStyleSheet(
                        f"background-color: {theme.ACCENT_PRIMARY}; color: white; padding: 2px 6px;"
                        " border-radius: 3px; font-size: 7pt; font-weight: bold;"
                    )
                    rev_layout.addWidget(badge)

                if migration.is_mergepoint:
                    badge = QLabel("MERGE")
                    badge.setStyleSheet(
                        "background-color: #9C27B0; color: white; padding: 2px 6px; border-radius: 3px;"
                        " font-size: 7pt; font-weight: bold;"
                    )
                    rev_layout.addWidget(badge)

                if migration.is_branchpoint:
                    badge = QLabel("BRANCH")
                    badge.setStyleSheet(
                        f"background-color: {theme.ACCENT_WARNING}; color: white; padding: 2px 6px;"
                        " border-radius: 3px; font-size: 7pt; font-weight: bold;"
                    )
                    rev_layout.addWidget(badge)

                rev_layout.addStretch()
                info_layout.addLayout(rev_layout)

                if migration.description:
                    desc_label = QLabel(
                        migration.description[:80] + ("..." if len(migration.description) > 80 else "")
                    )
                    desc_label.setStyleSheet(f"font-size: 8pt; color: {theme.TEXT_SECONDARY};")
                    info_layout.addWidget(desc_label)

                item_layout.addLayout(info_layout, 1)

                timeline_container_layout.addWidget(item)

            timeline_container_layout.addStretch()
        def parse_status(current_text, heads_text):
            """Parse alembic output and determine status."""
            current_clean = current_text.strip()
            heads_clean = heads_text.strip()

            if "error" in current_clean.lower() or "error" in heads_clean.lower():
                return "error", "Database connection error", "[ERROR]"

            current_rev = None
            if current_clean and "(" not in current_clean:
                parts = current_clean.split()
                if parts:
                    current_rev = parts[0]
            elif "(head)" in current_clean:
                current_rev = current_clean.split()[0]

            heads_rev = None
            if "(head)" in heads_clean:
                heads_rev = heads_clean.split()[0]
            elif heads_clean and not heads_clean.startswith("error"):
                parts = heads_clean.split()
                if parts:
                    heads_rev = parts[0]

            if current_rev and heads_rev:
                if current_rev == heads_rev:
                    return "up_to_date", f"Database is up-to-date (version {current_rev[:8]}...)", "[OK]"
                return "pending", f"Updates available! Current: {current_rev[:8]}... -> Latest: {heads_rev[:8]}...", "[WARN]"
            if not current_rev:
                return "not_initialized", "Database not initialized with migrations", "[?]"
            return "unknown", "Status unclear - check details below", "[?]"

        def refresh():
            current = get_current_revision()
            heads = get_heads()

            update_pending_migrations()
            update_timeline()

            heads_list, heads_err = parse_heads()
            if not heads_err and len(heads_list) > 1:
                branch_warning_frame.setVisible(True)
                branch_warning_text.setText(
                    f"Your migration history has {len(heads_list)} separate branches. "
                    "This typically happens when working on multiple features in parallel. "
                    "Click \"Auto-Merge Branches\" to create a merge migration that unifies them into a single timeline."
                )
                heads_text = "\n".join(
                    [f"  - {h.short_revision} {'(mergepoint)' if h.is_mergepoint else ''}" for h in heads_list]
                )
                branch_heads_list.setText(f"Branches:\n{heads_text}")
            else:
                branch_warning_frame.setVisible(False)

            valid, problematic = validate_revision_ids()
            if not valid and problematic:
                revid_warning_frame.setVisible(True)
                revid_warning_text.setText(
                    f"Found {len(problematic)} revision ID(s) longer than 32 characters. "
                    "The alembic_version table uses VARCHAR(32), which will cause errors. "
                    "You need to edit these migration files and use shorter revision IDs."
                )
                revid_text = "\n".join([f"  - {p}" for p in problematic])
                revid_list.setText(f"Problematic revisions:\n{revid_text}")
            else:
                revid_warning_frame.setVisible(False)

            state, message, icon = parse_status(current, heads)
            status_label.setText(f"{icon} {message}")

            if state == "up_to_date":
                status_label.setStyleSheet(
                    f"font-size: 11pt; font-weight: bold; color: {theme.ACCENT_SUCCESS};"
                )
                status_detail.setText("Your database schema is current. No action needed.")
                btn_upgrade.setEnabled(False)
                btn_upgrade.setText("Already Up-to-Date")
            elif state == "pending":
                status_label.setStyleSheet(
                    f"font-size: 11pt; font-weight: bold; color: {theme.ACCENT_WARNING};"
                )
                status_detail.setText(
                    "New migrations are available. Click \"Apply Updates\" to update your database schema."
                )
                btn_upgrade.setEnabled(True)
                btn_upgrade.setText("Apply Updates")
            elif state == "error":
                status_label.setStyleSheet(
                    f"font-size: 11pt; font-weight: bold; color: {theme.ACCENT_ERROR};"
                )
                status_detail.setText("Cannot connect to database or check migrations. Ensure backend is running.")
                btn_upgrade.setEnabled(False)
            else:
                status_label.setStyleSheet(
                    f"font-size: 11pt; font-weight: bold; color: {theme.ACCENT_PRIMARY};"
                )
                status_detail.setText("Check details below for current migration status.")
                btn_upgrade.setEnabled(True)

            status_box.setPlainText(
                "Current Database Version:\n"
                f"{current}\n\n"
                "Latest Available Version:\n"
                f"{heads}\n\n"
                "Tip: Current and Latest should match when up-to-date"
            )
        def show_history():
            hist = get_history()
            status_box.setPlainText(
                "Migration History (most recent first):\n\n"
                f"{hist}\n\n"
                "Tip: Each line shows a migration that was applied to the database"
            )

        def do_upgrade():
            backup_reply = QMessageBox.warning(
                self,
                "Important: Database Backup",
                "RECOMMENDED: Backup your database before proceeding!\n\n"
                "While migrations are usually safe, having a backup ensures you can:\n"
                "- Recover from unexpected issues\n"
                "- Rollback if something goes wrong\n"
                "- Avoid data loss in case of errors\n\n"
                "Quick backup options:\n"
                "1. Use pgAdmin or your database tool\n"
                "2. Run: pg_dump pixsim7 > backup_$(date +%Y%m%d).sql\n"
                "3. Take a filesystem snapshot if available\n\n"
                "Have you backed up your database?\n",
                QMessageBox.Yes | QMessageBox.No | QMessageBox.Cancel,
                QMessageBox.Cancel,
            )

            if backup_reply == QMessageBox.Cancel:
                return
            if backup_reply == QMessageBox.No:
                proceed_anyway = QMessageBox.question(
                    self,
                    "Proceed Without Backup?",
                    "You indicated you have NOT backed up your database.\n\n"
                    "Proceeding without a backup is risky. If something goes wrong,\n"
                    "you may not be able to recover your data.\n\n"
                    "Are you sure you want to continue?",
                    QMessageBox.Yes | QMessageBox.No,
                    QMessageBox.No,
                )
                if proceed_anyway != QMessageBox.Yes:
                    return

            reply = QMessageBox.question(
                self,
                "Confirm Database Update",
                "This will apply new migrations to your database.\n\n"
                "What this does:\n"
                "- Creates new tables if needed\n"
                "- Adds new columns to existing tables\n"
                "- Updates database structure to match latest code\n\n"
                "Usually safe with proper backups\n\n"
                "Continue with migration?",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.Yes,
            )
            if reply == QMessageBox.Yes:
                status_box.append("\nApplying migrations...\n")
                res = upgrade_head()
                status_box.append(f"{res}\n")
                if "error" not in res.lower() and "failed" not in res.lower() and "?" not in res:
                    status_box.append("Migrations applied successfully!\n")
                else:
                    status_box.append("Migration failed. Check error message above.\n")
                refresh()

        def do_downgrade():
            backup_check = QMessageBox.critical(
                self,
                "DANGER: Backup Required",
                "STOP: This operation can DELETE DATA!\n\n"
                "Downgrading a migration may:\n"
                "- DROP entire tables permanently\n"
                "- DELETE columns and all their data\n"
                "- REMOVE indexes and constraints\n\n"
                "REQUIRED: You MUST have a database backup before proceeding!\n\n"
                "Do you have a VERIFIED backup that you can restore from?",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No,
            )

            if backup_check != QMessageBox.Yes:
                message = (
                    "Good decision! Create a backup first:\n"
                    "pg_dump pixsim7 > backup_before_downgrade.sql\n"
                    "Test that you can restore from it before attempting downgrades."
                )
                if notify_target and hasattr(notify_target, "notify"):
                    notify_target.notify(message)
                else:
                    QMessageBox.information(self, "Cancelled", message)
                return

            reply = QMessageBox.warning(
                self,
                "Final Confirmation: Rollback (ADVANCED)",
                "FINAL WARNING: This will UNDO the last migration!\n\n"
                "What this does:\n"
                "- Rolls back the most recent database change\n"
                "- May DELETE tables or columns with all data\n"
                "- Changes cannot be undone without backup restore\n\n"
                "Only proceed if:\n"
                "- You just applied a wrong migration\n"
                "- You have verified your backup works\n"
                "- You fully understand the consequences\n\n"
                "Continue with rollback?",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No,
            )
            if reply == QMessageBox.Yes:
                status_box.append("\nRolling back last migration...\n")
                res = downgrade_one()
                status_box.append(f"{res}\n")
                if "error" not in res.lower() and "failed" not in res.lower() and "?" not in res:
                    status_box.append("Rollback completed.\n")
                else:
                    status_box.append("Rollback failed. Check error message above.\n")
                refresh()

        def do_stamp():
            reply = QMessageBox.warning(
                self,
                "Confirm Manual Mark (ADVANCED)",
                "WARNING: Advanced operation!\n\n"
                "What this does:\n"
                "- Marks database as \"up-to-date\" WITHOUT running migrations\n"
                "- Does NOT change your actual database structure\n"
                "- Only updates the version tracking table\n\n"
                "Only use this if:\n"
                "- You manually created tables yourself\n"
                "- You restored from a backup at a specific version\n"
                "- An expert told you to do this\n\n"
                "Continue?",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No,
            )
            if reply == QMessageBox.Yes:
                status_box.append("\nMarking database as current...\n")
                res = stamp_head()
                status_box.append(f"{res}\n")
                refresh()

        def do_merge():
            reply = QMessageBox.question(
                self,
                "Confirm Branch Merge",
                "This will create a merge migration to unify your branches.\n\n"
                "What this does:\n"
                "- Creates a new migration file with both branches as parents\n"
                "- Does NOT modify your database (just creates the file)\n"
                "- Unifies the migration timeline into a single head\n\n"
                "After merging, you'll need to apply the merge migration using \"Apply Updates\".\n\n"
                "Continue?",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.Yes,
            )
            if reply == QMessageBox.Yes:
                status_box.append("\nCreating merge migration...\n")
                res = merge_heads("merge migration branches")
                status_box.append(f"{res}\n")
                if "success" in res.lower():
                    status_box.append("\nMerge migration created! Now click \"Apply Updates\" to apply it.\n")
                refresh()

        btn_refresh.clicked.connect(refresh)
        btn_history.clicked.connect(show_history)
        btn_upgrade.clicked.connect(do_upgrade)
        btn_downgrade.clicked.connect(do_downgrade)
        btn_stamp.clicked.connect(do_stamp)
        branch_merge_btn.clicked.connect(do_merge)

        refresh()
