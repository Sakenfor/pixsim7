"""
Launcher UI Tabs

Modular tab creation for the launcher window.
"""

from .console_tab import ConsoleTab
from .db_logs_tab import DbLogsTab
from .tools_tab import ToolsTab
from .architecture_tab import ArchitectureTab

__all__ = ['ConsoleTab', 'DbLogsTab', 'ToolsTab', 'ArchitectureTab']
