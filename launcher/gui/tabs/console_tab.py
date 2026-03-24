"""
Console Tab — embedded React log viewer via QWebEngineView.

Loads the React log viewer from the embedded Launcher API at /viewer#serviceKey.
When the user selects a different service in the sidebar, the URL hash is updated
and the React component re-fetches logs for that service.
"""

from PySide6.QtWidgets import QWidget, QVBoxLayout
from PySide6.QtCore import QUrl

try:
    from .. import theme
except ImportError:
    import theme


class ConsoleTab:
    """Console tab using embedded React log viewer."""

    @staticmethod
    def create(launcher):
        """Create the console logs tab with an embedded webview."""
        from PySide6.QtWebEngineWidgets import QWebEngineView
        from PySide6.QtWebEngineCore import QWebEngineSettings

        console_tab = QWidget()
        layout = QVBoxLayout(console_tab)
        layout.setContentsMargins(0, 0, 0, 0)

        webview = QWebEngineView()
        settings = webview.settings()
        settings.setAttribute(QWebEngineSettings.LocalContentCanAccessRemoteUrls, True)

        layout.addWidget(webview)

        # Store on launcher for service selection updates
        launcher.console_webview = webview
        launcher._console_webview_loaded = False

        # Load the viewer after the embedded API is up (deferred)
        def _load_viewer():
            first_key = ""
            if launcher.selected_service_key:
                first_key = launcher.selected_service_key
            elif launcher.services:
                first_key = launcher.services[0].key
            url = f"http://localhost:8100/viewer#{first_key}"
            webview.setUrl(QUrl(url))
            launcher._console_webview_loaded = True

        from PySide6.QtCore import QTimer
        QTimer.singleShot(1500, _load_viewer)

        # Register dummy attributes that the console mixins check for.
        # These no-op stubs prevent AttributeError from legacy code paths
        # that haven't been fully cleaned up yet.
        class _DummyLabel:
            def setText(self, *a): pass
        class _DummyCombo:
            def currentText(self): return "All"
            def findText(self, *a): return -1
            def setCurrentIndex(self, *a): pass
        class _DummyCheckbox:
            def setChecked(self, *a): pass
            def isChecked(self): return False
        class _DummyInput:
            def text(self): return ""
            def setText(self, *a): pass
            def setFocus(self): pass
        class _DummyLogView:
            def update_content(self, *a, **kw): pass
            def append_html(self, *a): pass
            def clear(self): pass
            def set_autoscroll(self, *a): pass
            def set_paused(self, *a): pass
            def is_paused(self): return False
            def verticalScrollBar(self):
                class _Bar:
                    def value(self): return 0
                    def valueChanged(self): pass
                    def connect(self, *a): pass
                return _Bar()

        launcher.log_service_label = _DummyLabel()
        launcher.console_level_combo = _DummyCombo()
        launcher.console_scope_actions = {}
        launcher.console_search_input = _DummyInput()
        launcher.console_style_checkbox = _DummyCheckbox()
        launcher.autoscroll_checkbox = _DummyCheckbox()
        launcher.pause_logs_button = _DummyCheckbox()
        launcher.log_view = _DummyLogView()
        launcher.btn_refresh_logs = QWidget()  # invisible
        launcher.btn_clear_logs = QWidget()
        launcher.btn_attach_logs = QWidget()

        return console_tab
