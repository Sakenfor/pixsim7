"""
Tools and Settings Tabs for Launcher

Creates the tools and settings tabs with organized sections.
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QLabel, QPushButton, QFrame
)

try:
    from .. import theme
    from ..dialogs.migrations_dialog import show_migrations_dialog
    from ..dialogs.simple_git_dialog import show_simple_git_dialog
    from ..dialogs.git_tools_dialog import show_git_tools_dialog
    from ..dialogs.log_management_dialog import show_log_management_dialog
except ImportError:
    import theme
    from dialogs.migrations_dialog import show_migrations_dialog
    from dialogs.simple_git_dialog import show_simple_git_dialog
    from dialogs.git_tools_dialog import show_git_tools_dialog
    from dialogs.log_management_dialog import show_log_management_dialog


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
        tools_tab = QWidget()
        tools_layout = QVBoxLayout(tools_tab)
        tools_layout.setContentsMargins(theme.SPACING_LG, theme.SPACING_LG, theme.SPACING_LG, theme.SPACING_LG)
        tools_layout.setSpacing(theme.SPACING_LG)

        # Database Tools Section
        db_group = QFrame()
        db_group.setFrameShape(QFrame.Shape.StyledPanel)
        db_group.setStyleSheet(theme.get_group_frame_stylesheet())
        db_layout = QVBoxLayout(db_group)

        db_title = QLabel("🗄 Database Tools")
        db_title.setStyleSheet(f"font-size: {theme.FONT_SIZE_LG}; font-weight: bold; color: {theme.ACCENT_PRIMARY}; padding-bottom: {theme.SPACING_SM}px;")
        db_layout.addWidget(db_title)

        launcher.btn_migrations = QPushButton('🗃 Migrations')
        launcher.btn_migrations.setToolTip("Database migration manager")
        launcher.btn_migrations.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        launcher.btn_migrations.clicked.connect(lambda: show_migrations_dialog(launcher))
        db_layout.addWidget(launcher.btn_migrations)

        launcher.btn_db_browser = QPushButton('📊 Database Browser')
        launcher.btn_db_browser.setToolTip("Browse accounts, copy passwords, export to CSV")
        launcher.btn_db_browser.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        launcher.btn_db_browser.clicked.connect(launcher._open_db_browser)
        db_layout.addWidget(launcher.btn_db_browser)

        launcher.btn_import_accounts = QPushButton('📥 Import Accounts from PixSim6')
        launcher.btn_import_accounts.setToolTip("Import provider accounts from PixSim6 database")
        launcher.btn_import_accounts.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        launcher.btn_import_accounts.clicked.connect(launcher._open_import_accounts_dialog)
        db_layout.addWidget(launcher.btn_import_accounts)

        tools_layout.addWidget(db_group)

        # Development Tools Section
        dev_group = QFrame()
        dev_group.setFrameShape(QFrame.Shape.StyledPanel)
        dev_group.setStyleSheet(theme.get_group_frame_stylesheet())
        dev_layout = QVBoxLayout(dev_group)

        dev_title = QLabel("🔀 Development Tools")
        dev_title.setStyleSheet(f"font-size: {theme.FONT_SIZE_LG}; font-weight: bold; color: {theme.ACCENT_PRIMARY}; padding-bottom: {theme.SPACING_SM}px;")
        dev_layout.addWidget(dev_title)

        launcher.btn_git_workflow = QPushButton('⚡ Git Workflow')
        launcher.btn_git_workflow.setToolTip("Simple git operations: commit, push, pull, merge, cleanup")
        launcher.btn_git_workflow.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        launcher.btn_git_workflow.clicked.connect(lambda: show_simple_git_dialog(launcher))
        dev_layout.addWidget(launcher.btn_git_workflow)

        launcher.btn_git_tools = QPushButton('🔀 Advanced Git Tools')
        launcher.btn_git_tools.setToolTip("Structured commit helper (grouped commits)")
        launcher.btn_git_tools.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        launcher.btn_git_tools.clicked.connect(lambda: show_git_tools_dialog(launcher))
        dev_layout.addWidget(launcher.btn_git_tools)

        launcher.btn_log_management = QPushButton('📋 Log Management')
        launcher.btn_log_management.setToolTip("Manage, archive, and export console logs")
        launcher.btn_log_management.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        launcher.btn_log_management.clicked.connect(lambda: show_log_management_dialog(launcher, launcher.processes))
        dev_layout.addWidget(launcher.btn_log_management)

        tools_layout.addWidget(dev_group)

        tools_layout.addStretch()
        return tools_tab

    @staticmethod
    def create_settings(launcher):
        """
        Create the settings tab.

        Args:
            launcher: LauncherWindow instance

        Returns:
            QWidget: The settings tab widget
        """
        settings_tab = QWidget()
        settings_layout = QVBoxLayout(settings_tab)
        settings_layout.setContentsMargins(theme.SPACING_LG, theme.SPACING_LG, theme.SPACING_LG, theme.SPACING_LG)
        settings_layout.setSpacing(theme.SPACING_LG)

        # Configuration Section
        config_group = QFrame()
        config_group.setFrameShape(QFrame.Shape.StyledPanel)
        config_group.setStyleSheet(theme.get_group_frame_stylesheet())
        config_layout = QVBoxLayout(config_group)

        config_title = QLabel("⚙ Configuration")
        config_title.setStyleSheet(f"font-size: {theme.FONT_SIZE_LG}; font-weight: bold; color: {theme.ACCENT_PRIMARY}; padding-bottom: {theme.SPACING_SM}px;")
        config_layout.addWidget(config_title)

        launcher.btn_ports = QPushButton('🔌 Edit Ports')
        launcher.btn_ports.setToolTip("Edit service ports")
        launcher.btn_ports.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        launcher.btn_ports.clicked.connect(launcher.edit_ports)
        config_layout.addWidget(launcher.btn_ports)

        launcher.btn_env = QPushButton('🔧 Edit Environment Variables')
        launcher.btn_env.setToolTip("Edit environment variables")
        launcher.btn_env.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        launcher.btn_env.clicked.connect(launcher.edit_env)
        config_layout.addWidget(launcher.btn_env)

        settings_layout.addWidget(config_group)

        # Application Settings Section
        app_group = QFrame()
        app_group.setFrameShape(QFrame.Shape.StyledPanel)
        app_group.setStyleSheet(theme.get_group_frame_stylesheet())
        app_layout = QVBoxLayout(app_group)

        app_title = QLabel("🎨 Application Settings")
        app_title.setStyleSheet(f"font-size: {theme.FONT_SIZE_LG}; font-weight: bold; color: {theme.ACCENT_PRIMARY}; padding-bottom: {theme.SPACING_SM}px;")
        app_layout.addWidget(app_title)

        launcher.btn_settings = QPushButton('⚙ General Settings')
        launcher.btn_settings.setToolTip("Configure launcher preferences")
        launcher.btn_settings.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        launcher.btn_settings.clicked.connect(launcher._open_settings)
        app_layout.addWidget(launcher.btn_settings)

        settings_layout.addWidget(app_group)

        settings_layout.addStretch()
        return settings_tab
