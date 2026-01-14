"""
Tools and Settings Tabs for Launcher

Creates the tools and settings tabs with organized sections.
"""

import os
import subprocess
import sys

from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QPushButton,
    QHBoxLayout,
    QLineEdit,
    QLabel,
    QMessageBox,
)

try:
    from .. import theme
    from ..config import ROOT
    from ..dialogs.migrations_dialog import show_migrations_dialog
    from ..dialogs.simple_git_dialog import show_simple_git_dialog
    from ..dialogs.git_tools_dialog import show_git_tools_dialog
    from ..dialogs.log_management_dialog import show_log_management_dialog
    from ..dialogs.codegen_dialog import CodegenToolsWidget
    from ..widgets.settings_panel import SettingsPanel
    from ..widgets.tab_builder import (
        TabBuilder, create_page, create_styled_frame, create_section_label
    )
except ImportError:
    import theme
    from config import ROOT
    from dialogs.migrations_dialog import show_migrations_dialog
    from dialogs.simple_git_dialog import show_simple_git_dialog
    from dialogs.git_tools_dialog import show_git_tools_dialog
    from dialogs.log_management_dialog import show_log_management_dialog
    from dialogs.codegen_dialog import CodegenToolsWidget
    from widgets.settings_panel import SettingsPanel
    from widgets.tab_builder import (
        TabBuilder, create_page, create_styled_frame, create_section_label
    )


class ToolsTab:
    """
    Tools tab builder for the launcher.

    Creates organized sections for database and development tools.
    """

    @staticmethod
    def create(launcher):
        """
        Create the tools tab.

        Args:
            launcher: LauncherWindow instance

        Returns:
            QWidget: The tools tab widget
        """
        builder = TabBuilder()
        builder.add_page("Database", lambda: ToolsTab._create_database_page(launcher))
        builder.add_page("Development", lambda: ToolsTab._create_development_page(launcher))
        builder.add_page("Codegen", lambda: CodegenToolsWidget())

        container, _, _ = builder.build()
        return container

    @staticmethod
    def _create_database_page(launcher) -> QWidget:
        """Create the Database tools page."""
        page, layout = create_page("Database Tools", "Manage schema, data access, and imports.")

        builder = TabBuilder(sidebar_width=180)
        builder.add_page("Migrations", lambda: ToolsTab._create_migrations_tab(launcher))
        builder.add_page("Browser", lambda: ToolsTab._create_db_browser_tab(launcher))
        builder.add_page("Import", lambda: ToolsTab._create_import_tab(launcher))

        container, _, _ = builder.build()
        layout.addWidget(container)
        return page

    @staticmethod
    def _create_migrations_tab(launcher) -> QWidget:
        page, layout = create_page(
            "Database Migrations",
            "Review migration status and apply schema updates.",
        )
        frame, frame_layout = create_styled_frame()

        btn = QPushButton("Open Migrations Manager")
        btn.setToolTip("Open the full migration manager dialog")
        btn.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        btn.clicked.connect(lambda: show_migrations_dialog(launcher))
        launcher.register_widget("btn_migrations", btn)
        frame_layout.addWidget(btn)

        layout.addWidget(frame)
        layout.addStretch()
        return page

    @staticmethod
    def _create_db_browser_tab(launcher) -> QWidget:
        page, layout = create_page(
            "Database Browser",
            "Browse accounts, copy passwords, and export to CSV.",
        )
        frame, frame_layout = create_styled_frame()

        btn = QPushButton("Open Database Browser")
        btn.setToolTip("Launch the database browser window")
        btn.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        btn.clicked.connect(launcher._open_db_browser)
        launcher.register_widget("btn_db_browser", btn)
        frame_layout.addWidget(btn)

        layout.addWidget(frame)
        layout.addStretch()
        return page

    @staticmethod
    def _create_import_tab(launcher) -> QWidget:
        page, layout = create_page(
            "Import Accounts",
            "Import provider accounts from the PixSim6 database.",
        )
        frame, frame_layout = create_styled_frame()

        info = QLabel(
            "This will import credentials, credits, and usage stats. "
            "Both databases must be running."
        )
        info.setWordWrap(True)
        info.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt;")
        frame_layout.addWidget(info)

        row = QHBoxLayout()
        row_label = QLabel("Username:")
        row_label.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt;")
        row.addWidget(row_label)

        username_input = QLineEdit()
        username_input.setPlaceholderText("sakenfor")
        row.addWidget(username_input, 1)
        frame_layout.addLayout(row)

        def run_import():
            username = username_input.text().strip()
            if not username:
                QMessageBox.information(page, "Import Accounts", "Enter a username first.")
                return

            reply = QMessageBox.question(
                page,
                "Import Accounts",
                f"Import all accounts from PixSim6 to user '{username}'?\n\n"
                "This will:\n"
                "- Import credentials (JWT, API keys, cookies)\n"
                "- Import credits and usage stats\n"
                "- Skip duplicates automatically\n\n"
                "Both databases must be running.",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            )

            if reply != QMessageBox.StandardButton.Yes:
                return

            script_path = os.path.join(ROOT, "scripts", "import_accounts_from_pixsim6.py")
            try:
                result = subprocess.run(
                    [sys.executable, script_path, "--username", username],
                    capture_output=True,
                    text=True,
                    cwd=ROOT,
                )
            except Exception as exc:
                QMessageBox.critical(page, "Import Failed", f"Failed to run import:\n{exc}")
                return

            if result.returncode == 0:
                msg = "Successfully imported accounts."
                if result.stdout:
                    msg = f"{msg} {result.stdout.strip()}"
                if hasattr(launcher, "notify"):
                    launcher.notify(msg)
                else:
                    QMessageBox.information(page, "Import Complete", msg)
            else:
                QMessageBox.warning(
                    page,
                    "Import Failed",
                    f"Import failed:\n\n{result.stderr or result.stdout}",
                )

        btn = QPushButton("Run Import")
        btn.setToolTip("Import accounts from the PixSim6 database")
        btn.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        btn.clicked.connect(run_import)
        launcher.register_widget("btn_import_accounts", btn)
        frame_layout.addWidget(btn)

        layout.addWidget(frame)
        layout.addStretch()
        return page

    @staticmethod
    def _create_development_page(launcher) -> QWidget:
        """Create the Development tools page."""
        page, layout = create_page("Development Tools")

        def make_button(key, label, tooltip, handler):
            btn = QPushButton(label)
            btn.setToolTip(tooltip)
            btn.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
            btn.clicked.connect(handler)
            launcher.register_widget(key, btn)
            return btn

        # Git tools frame
        git_frame, git_layout = create_styled_frame()
        git_layout.addWidget(create_section_label("Git"))

        git_layout.addWidget(make_button(
            'btn_git_workflow', 'Git Workflow',
            "Simple git operations: commit, push, pull, merge, cleanup",
            lambda: show_simple_git_dialog(launcher)
        ))
        git_layout.addWidget(make_button(
            'btn_git_tools', 'Advanced Git Tools',
            "Structured commit helper (grouped commits)",
            lambda: show_git_tools_dialog(launcher)
        ))

        layout.addWidget(git_frame)

        # Logging frame
        log_frame, log_layout = create_styled_frame()
        log_layout.addWidget(create_section_label("Logging"))

        log_layout.addWidget(make_button(
            'btn_log_management', 'Log Management',
            "Manage, archive, and export console logs",
            lambda: show_log_management_dialog(launcher, launcher.processes)
        ))

        layout.addWidget(log_frame)
        layout.addStretch()
        return page

    @staticmethod
    def create_settings(launcher):
        """
        Create the settings tab.

        Args:
            launcher: LauncherWindow instance

        Returns:
            QWidget: The settings tab widget
        """
        def on_saved(updated_state):
            if hasattr(launcher, "_apply_settings"):
                launcher._apply_settings(updated_state)

        # SettingsPanel handles its own layout/margins
        return SettingsPanel(launcher.ui_state, on_saved=on_saved, parent=launcher)
