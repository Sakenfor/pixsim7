"""
Migrations widget for embedding the migration manager UI inside tabs.
"""
from __future__ import annotations

from typing import Callable, Optional

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QLabel, QHBoxLayout, QPushButton,
    QMessageBox, QGroupBox, QFrame, QListWidget, QListWidgetItem
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
                margin-top: 8px;
                padding-top: 8px;
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
        layout.setSpacing(8)
        layout.setContentsMargins(16, 12, 16, 12)

        # Header
        header = QLabel("Migrations")
        header.setStyleSheet(f"font-size: 13pt; font-weight: bold; color: {theme.TEXT_PRIMARY};")
        layout.addWidget(header)

        # Database indicator
        db_note = QLabel("Main Database (DATABASE_URL)")
        db_note.setStyleSheet(f"font-size: 8pt; color: {theme.TEXT_DISABLED};")
        layout.addWidget(db_note)

        # Status card
        status_frame = QFrame()
        status_frame.setFrameShape(QFrame.StyledPanel)
        status_frame.setStyleSheet(
            f"background-color: {theme.BG_TERTIARY}; border: 1px solid {theme.BORDER_DEFAULT};"
            f" border-radius: 6px;"
        )
        status_layout = QVBoxLayout(status_frame)
        status_layout.setContentsMargins(12, 10, 12, 10)
        status_layout.setSpacing(4)

        status_label = QLabel("Checking...")
        status_label.setStyleSheet(f"font-size: 10pt; font-weight: bold; color: {theme.TEXT_PRIMARY};")
        status_layout.addWidget(status_label)

        status_detail = QLabel("")
        status_detail.setWordWrap(True)
        status_detail.setStyleSheet(f"font-size: 9pt; color: {theme.TEXT_SECONDARY};")
        status_layout.addWidget(status_detail)

        layout.addWidget(status_frame)

        # Warning frames (hidden by default)
        branch_warning_frame = self._create_warning_frame(
            "Multiple Branches Detected",
            theme.ACCENT_WARNING
        )
        branch_warning_frame.setVisible(False)
        branch_warning_text = branch_warning_frame.findChild(QLabel, "warning_text")
        branch_heads_list = branch_warning_frame.findChild(QLabel, "warning_detail")
        btn_merge = branch_warning_frame.findChild(QPushButton, "warning_btn")
        layout.addWidget(branch_warning_frame)

        revid_warning_frame = self._create_warning_frame(
            "Revision ID Issue",
            theme.ACCENT_ERROR
        )
        revid_warning_frame.setVisible(False)
        revid_warning_text = revid_warning_frame.findChild(QLabel, "warning_text")
        revid_list = revid_warning_frame.findChild(QLabel, "warning_detail")
        layout.addWidget(revid_warning_frame)

        # Pending migrations (simple list)
        pending_group = QGroupBox("Pending")
        pending_group.setVisible(False)
        pending_layout = QVBoxLayout(pending_group)
        pending_layout.setContentsMargins(8, 8, 8, 8)
        pending_list = QLabel()
        pending_list.setStyleSheet(f"font-family: 'Consolas', monospace; font-size: 9pt; color: {theme.TEXT_PRIMARY};")
        pending_list.setWordWrap(True)
        pending_layout.addWidget(pending_list)
        layout.addWidget(pending_group)

        # Timeline (clickable list)
        timeline_group = QGroupBox("History")
        timeline_group.setVisible(False)
        timeline_layout = QVBoxLayout(timeline_group)
        timeline_layout.setContentsMargins(8, 8, 8, 8)
        timeline_layout.setSpacing(6)

        timeline_list = QListWidget()
        timeline_list.setMinimumHeight(120)
        timeline_list.setMaximumHeight(250)
        timeline_list.setStyleSheet(f"""
            QListWidget {{
                background-color: {theme.BG_TERTIARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_SM}px;
                font-family: 'Consolas', monospace;
                font-size: 9pt;
            }}
            QListWidget::item {{
                padding: 4px 6px;
            }}
            QListWidget::item:selected {{
                background-color: {theme.ACCENT_PRIMARY};
                color: {theme.TEXT_INVERSE};
            }}
            QListWidget::item:hover:!selected {{
                background-color: {theme.BG_HOVER};
            }}
        """)
        timeline_layout.addWidget(timeline_list)

        # Details panel for selected migration
        details_frame = QFrame()
        details_frame.setFrameShape(QFrame.StyledPanel)
        details_frame.setStyleSheet(f"""
            QFrame {{
                background-color: {theme.BG_TERTIARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_SM}px;
            }}
        """)
        details_layout = QVBoxLayout(details_frame)
        details_layout.setContentsMargins(10, 8, 10, 8)
        details_layout.setSpacing(2)

        details_rev = QLabel("")
        details_rev.setStyleSheet(f"font-weight: bold; color: {theme.TEXT_PRIMARY}; font-size: 9pt;")
        details_layout.addWidget(details_rev)

        details_desc = QLabel("")
        details_desc.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt;")
        details_desc.setWordWrap(True)
        details_layout.addWidget(details_desc)

        details_status = QLabel("")
        details_status.setStyleSheet(f"color: {theme.TEXT_DISABLED}; font-size: 8pt;")
        details_layout.addWidget(details_status)

        details_frame.setVisible(False)
        timeline_layout.addWidget(details_frame)

        layout.addWidget(timeline_group)

        # Actions
        actions_layout = QHBoxLayout()
        actions_layout.setSpacing(8)

        btn_refresh = QPushButton("Refresh")
        btn_refresh.setToolTip("Check migration status")
        actions_layout.addWidget(btn_refresh)

        btn_upgrade = QPushButton("Apply Updates")
        btn_upgrade.setToolTip("Apply pending migrations")
        btn_upgrade.setStyleSheet(f"""
            QPushButton {{
                background-color: {theme.ACCENT_SUCCESS};
                font-weight: bold;
            }}
            QPushButton:hover {{ background-color: #56d364; }}
            QPushButton:disabled {{
                background-color: {theme.BG_TERTIARY};
                color: {theme.TEXT_DISABLED};
            }}
        """)
        actions_layout.addWidget(btn_upgrade)

        actions_layout.addStretch()

        btn_downgrade = QPushButton("Rollback")
        btn_downgrade.setToolTip("Undo last migration")
        btn_downgrade.setStyleSheet(f"""
            QPushButton {{ background-color: {theme.ACCENT_WARNING}; }}
            QPushButton:hover {{ background-color: #e8a730; }}
        """)
        actions_layout.addWidget(btn_downgrade)

        layout.addLayout(actions_layout)
        layout.addStretch()

        # Close button (optional)
        if self._show_close_button:
            btn_close = QPushButton("Close")
            btn_close.setStyleSheet(f"background-color: {theme.BG_TERTIARY};")
            if self._on_close:
                btn_close.clicked.connect(self._on_close)
            else:
                btn_close.clicked.connect(self.close)
            layout.addWidget(btn_close)

        # --- Logic ---
        notify_target = self._notify_target
        migrations_map = {}  # revision -> MigrationNode

        def on_migration_selected():
            item = timeline_list.currentItem()
            if not item:
                details_frame.setVisible(False)
                return

            revision = item.data(Qt.UserRole)
            migration = migrations_map.get(revision)
            if not migration:
                details_frame.setVisible(False)
                return

            details_frame.setVisible(True)
            details_rev.setText(f"Revision: {migration.revision}")
            details_desc.setText(migration.description or "(no description)")

            status_parts = []
            if migration.is_current:
                status_parts.append("Current")
            if migration.is_head:
                status_parts.append("HEAD")
            if migration.is_applied:
                status_parts.append("Applied")
            else:
                status_parts.append("Pending")
            if migration.down_revision:
                status_parts.append(f"Parent: {migration.down_revision[:12]}")

            details_status.setText(" | ".join(status_parts))

        timeline_list.currentItemChanged.connect(on_migration_selected)

        def refresh():
            current = get_current_revision()
            heads = get_heads()

            # Update pending
            pending, err = get_pending_migrations_detailed()
            if pending and not err:
                pending_group.setVisible(True)
                lines = []
                for m in pending:
                    desc = f" - {m.description}" if m.description else ""
                    lines.append(f"• {m.short_revision}{desc}")
                pending_list.setText("\n".join(lines))
            else:
                pending_group.setVisible(False)

            # Update timeline
            migrations, err = parse_migration_history()
            migrations_map.clear()
            timeline_list.clear()
            details_frame.setVisible(False)

            if migrations and not err:
                timeline_group.setVisible(True)
                # Show all migrations, newest first
                for m in reversed(migrations):
                    marker = ">" if m.is_current else " "
                    status = "[HEAD]" if m.is_head else ("[applied]" if m.is_applied else "[pending]")
                    desc = f" {m.description[:40]}" if m.description else ""
                    display = f"{marker} {m.short_revision} {status}{desc}"

                    item = QListWidgetItem(display)
                    item.setData(Qt.UserRole, m.revision)
                    migrations_map[m.revision] = m

                    # Color based on status
                    if m.is_current:
                        item.setForeground(Qt.GlobalColor.cyan)
                    elif not m.is_applied:
                        item.setForeground(Qt.GlobalColor.yellow)

                    timeline_list.addItem(item)
            else:
                timeline_group.setVisible(False)

            # Check for branch conflicts
            heads_list_parsed, heads_err = parse_heads()
            if not heads_err and len(heads_list_parsed) > 1:
                branch_warning_frame.setVisible(True)
                branch_warning_text.setText(
                    f"Migration history has {len(heads_list_parsed)} branches that need merging."
                )
                branch_heads_list.setText(
                    "Branches: " + ", ".join([h.short_revision for h in heads_list_parsed])
                )
            else:
                branch_warning_frame.setVisible(False)

            # Check revision ID issues
            valid, problematic = validate_revision_ids()
            if not valid and problematic:
                revid_warning_frame.setVisible(True)
                revid_warning_text.setText(f"Found {len(problematic)} revision(s) with IDs > 32 chars.")
                revid_list.setText("Fix: " + ", ".join(problematic[:3]))
            else:
                revid_warning_frame.setVisible(False)

            # Determine status
            current_clean = current.strip()
            heads_clean = heads.strip()

            if "error" in current_clean.lower():
                status_label.setText("Error")
                status_label.setStyleSheet(f"font-size: 10pt; font-weight: bold; color: {theme.ACCENT_ERROR};")
                status_detail.setText(current_clean)
                btn_upgrade.setEnabled(False)
                return

            # Extract revision IDs
            current_rev = current_clean.split()[0] if current_clean and not current_clean.startswith("(") else None
            heads_rev = heads_clean.split()[0] if heads_clean and not heads_clean.startswith("(") else None

            if current_rev and heads_rev:
                if current_rev == heads_rev:
                    status_label.setText("Up to date")
                    status_label.setStyleSheet(f"font-size: 10pt; font-weight: bold; color: {theme.ACCENT_SUCCESS};")
                    status_detail.setText(f"Database schema is current ({current_rev[:12]})")
                    btn_upgrade.setEnabled(False)
                else:
                    status_label.setText("Updates available")
                    status_label.setStyleSheet(f"font-size: 10pt; font-weight: bold; color: {theme.ACCENT_WARNING};")
                    status_detail.setText(f"Current: {current_rev[:12]} → Latest: {heads_rev[:12]}")
                    btn_upgrade.setEnabled(True)
            elif not current_rev:
                status_label.setText("Not initialized")
                status_label.setStyleSheet(f"font-size: 10pt; font-weight: bold; color: {theme.TEXT_SECONDARY};")
                status_detail.setText("Database has no migration history")
                btn_upgrade.setEnabled(True)
            else:
                status_label.setText("Unknown")
                status_label.setStyleSheet(f"font-size: 10pt; font-weight: bold; color: {theme.TEXT_SECONDARY};")
                status_detail.setText("Could not determine status")
                btn_upgrade.setEnabled(True)

        def do_upgrade():
            reply = QMessageBox.question(
                self,
                "Apply Migrations",
                "Apply all pending migrations?\n\nRecommended: Backup your database first.",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            )
            if reply != QMessageBox.StandardButton.Yes:
                return

            success, output = upgrade_head()
            if success:
                if notify_target and hasattr(notify_target, "notify"):
                    notify_target.notify("Migrations applied successfully")
                else:
                    QMessageBox.information(self, "Success", "Migrations applied successfully")
            else:
                QMessageBox.warning(self, "Migration Failed", f"Error:\n{output}")
            refresh()

        def do_downgrade():
            reply = QMessageBox.warning(
                self,
                "Rollback Migration",
                "Undo the last migration?\n\nThis may cause data loss!",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            )
            if reply != QMessageBox.StandardButton.Yes:
                return

            success, output = downgrade_one()
            if success:
                if notify_target and hasattr(notify_target, "notify"):
                    notify_target.notify("Rollback completed")
                else:
                    QMessageBox.information(self, "Success", "Rollback completed")
            else:
                QMessageBox.warning(self, "Rollback Failed", f"Error:\n{output}")
            refresh()

        def do_merge():
            reply = QMessageBox.question(
                self,
                "Merge Branches",
                "Create a merge migration to unify branches?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            )
            if reply != QMessageBox.StandardButton.Yes:
                return

            success, output = merge_heads()
            if success:
                if notify_target and hasattr(notify_target, "notify"):
                    notify_target.notify("Merge migration created")
                else:
                    QMessageBox.information(self, "Success", f"Merge migration created:\n{output}")
            else:
                QMessageBox.warning(self, "Merge Failed", f"Error:\n{output}")
            refresh()

        btn_refresh.clicked.connect(refresh)
        btn_upgrade.clicked.connect(do_upgrade)
        btn_downgrade.clicked.connect(do_downgrade)
        if btn_merge:
            btn_merge.clicked.connect(do_merge)

        # Initial refresh
        refresh()

    def _create_warning_frame(self, title: str, color: str) -> QFrame:
        """Create a warning frame with consistent styling."""
        frame = QFrame()
        frame.setFrameShape(QFrame.StyledPanel)
        frame.setStyleSheet(f"""
            QFrame {{
                background-color: {theme.BG_TERTIARY};
                border: 1px solid {color};
                border-left: 4px solid {color};
                border-radius: 4px;
            }}
        """)

        layout = QVBoxLayout(frame)
        layout.setContentsMargins(10, 8, 10, 8)
        layout.setSpacing(4)

        header = QLabel(title)
        header.setStyleSheet(f"font-size: 10pt; font-weight: bold; color: {color};")
        layout.addWidget(header)

        text = QLabel()
        text.setObjectName("warning_text")
        text.setWordWrap(True)
        text.setStyleSheet(f"font-size: 9pt; color: {theme.TEXT_SECONDARY};")
        layout.addWidget(text)

        detail = QLabel()
        detail.setObjectName("warning_detail")
        detail.setStyleSheet(f"font-family: 'Consolas', monospace; font-size: 8pt; color: {theme.TEXT_PRIMARY};")
        layout.addWidget(detail)

        if "Branch" in title:
            btn = QPushButton("Merge Branches")
            btn.setObjectName("warning_btn")
            btn.setStyleSheet(f"background-color: {color};")
            layout.addWidget(btn)

        return frame
