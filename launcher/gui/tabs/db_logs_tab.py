"""
Database Logs Tab for Launcher

Creates the database logs viewer tab.
"""

try:
    from ..config import read_env_ports
    from ..database_log_viewer import DatabaseLogViewer
except ImportError:
    from config import read_env_ports
    from database_log_viewer import DatabaseLogViewer


class DbLogsTab:
    """
    Database logs tab builder for the launcher.

    Creates the database logs viewer widget.
    """

    @staticmethod
    def create(launcher):
        """
        Create the database logs tab.

        Args:
            launcher: LauncherWindow instance

        Returns:
            DatabaseLogViewer: The database log viewer widget
        """
        p = read_env_ports()
        launcher.db_log_viewer = DatabaseLogViewer(api_url=f"http://localhost:{p.backend}")
        return launcher.db_log_viewer
