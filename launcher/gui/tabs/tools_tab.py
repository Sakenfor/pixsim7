"""
Tools and Settings Tabs for Launcher

Creates the tools and settings tabs with organized sections.
"""

from PySide6.QtWidgets import QWidget, QVBoxLayout, QPushButton

try:
    from .. import theme
    from ..dialogs.codegen_dialog import CodegenToolsWidget
    from ..widgets.migrations_widget import MigrationsWidget
    from ..widgets.git_workflow_widget import GitWorkflowWidget
    from ..widgets.git_tools_widget import GitToolsWidget
    from ..widgets.log_management_widget import LogManagementWidget
    from ..widgets.settings_panel import SettingsPanel
    from ..widgets.tab_builder import TabBuilder
except ImportError:
    import theme
    from dialogs.codegen_dialog import CodegenToolsWidget
    from widgets.migrations_widget import MigrationsWidget
    from widgets.git_workflow_widget import GitWorkflowWidget
    from widgets.git_tools_widget import GitToolsWidget
    from widgets.log_management_widget import LogManagementWidget
    from widgets.settings_panel import SettingsPanel
    from widgets.tab_builder import TabBuilder


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

        # Database tools
        builder.add_page(
            "Migrations",
            lambda: MigrationsWidget(parent=None, notify_target=launcher),
            category="Database"
        )

        # Development tools
        builder.add_page(
            "Workflow",
            lambda: GitWorkflowWidget(parent=None, notify_target=launcher),
            category="Git"
        )
        builder.add_page(
            "Groups",
            lambda: GitToolsWidget(parent=None, notify_target=launcher),
            category="Git"
        )
        builder.add_page(
            "Console Logs",
            lambda: LogManagementWidget(
                parent=None,
                processes_provider=lambda: getattr(launcher, "processes", {}),
                notify_target=launcher
            ),
            category="Logs"
        )
        builder.add_page(
            "Codegen",
            lambda: CodegenToolsWidget(),
            category="Development"
        )

        container, _, _ = builder.build()
        return container

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
