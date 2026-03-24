"""
Database Logs Tab — embedded React DB log viewer via QWebEngineView.

Loads the React DB log query viewer from the embedded Launcher API at /db-logs.
Replaces the old PySide6 DatabaseLogViewer widget.
"""

from PySide6.QtWidgets import QWidget, QVBoxLayout
from PySide6.QtCore import QUrl


class DbLogsTab:
    """Database logs tab using embedded React viewer."""

    @staticmethod
    def create(launcher):
        """Create the database logs tab with an embedded webview."""
        from PySide6.QtWebEngineWidgets import QWebEngineView
        from PySide6.QtWebEngineCore import QWebEngineSettings

        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setContentsMargins(0, 0, 0, 0)

        webview = QWebEngineView()
        settings = webview.settings()
        settings.setAttribute(QWebEngineSettings.LocalContentCanAccessRemoteUrls, True)
        layout.addWidget(webview)

        launcher.db_log_webview = webview

        # Stub out db_log_viewer so legacy code that checks hasattr doesn't crash
        launcher.db_log_viewer = None

        def _load():
            webview.setUrl(QUrl("http://localhost:8100/db-logs"))

        from PySide6.QtCore import QTimer
        QTimer.singleShot(1500, _load)

        return tab
