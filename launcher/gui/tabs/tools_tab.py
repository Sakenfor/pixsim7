"""
Tools and Settings Tabs for Launcher

Creates the tools and settings tabs with organized sections.
"""

from PySide6.QtWidgets import QWidget, QVBoxLayout, QPushButton

try:
    from .. import theme
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
        page, layout = create_page("Database Tools")

        frame, frame_layout = create_styled_frame()

        def make_button(key, label, tooltip, handler):
            btn = QPushButton(label)
            btn.setToolTip(tooltip)
            btn.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
            btn.clicked.connect(handler)
            launcher.register_widget(key, btn)
            return btn

        frame_layout.addWidget(make_button(
            'btn_migrations', 'Migrations',
            "Database migration manager",
            lambda: show_migrations_dialog(launcher)
        ))
        frame_layout.addWidget(make_button(
            'btn_db_browser', 'Database Browser',
            "Browse accounts, copy passwords, export to CSV",
            launcher._open_db_browser
        ))
        frame_layout.addWidget(make_button(
            'btn_import_accounts', 'Import Accounts from PixSim6',
            "Import provider accounts from PixSim6 database",
            launcher._open_import_accounts_dialog
        ))

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
