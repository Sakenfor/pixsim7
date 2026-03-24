"""
Thin PySide6 shell that hosts the launcher API in-process and renders
the React-based launcher UI inside a QWebEngineView.

Usage:
    python -m launcher.gui.webview_launcher          # prod (serves built files)
    python -m launcher.gui.webview_launcher --dev     # dev (connects to Vite on :3100)
"""

import sys
import os
import threading
import socket
from pathlib import Path

from PySide6.QtWidgets import QApplication, QWidget, QVBoxLayout
from PySide6.QtCore import Qt, QUrl, QTimer
from PySide6.QtGui import QIcon

# Load .env before anything else
from dotenv import load_dotenv
_env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env')
load_dotenv(_env_path)

# Project root
ROOT = Path(__file__).resolve().parent.parent.parent

# Default ports
API_PORT = int(os.getenv("LAUNCHER_API_PORT", "8100"))
DEV_PORT = int(os.getenv("LAUNCHER_DEV_PORT", "3100"))

# Path to pre-built React app
STATIC_DIR = ROOT / "apps" / "launcher" / "dist"


def _port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def _start_api_server(port: int):
    """Start the launcher FastAPI server in a background thread."""
    import uvicorn
    from launcher.api.main import app

    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
        # Serve the built React app as static files when available
        # (added via mount in lifespan, or we add it here)
    )
    server = uvicorn.Server(config)
    server.run()


class WebViewLauncher(QWidget):
    """Minimal window: QWebEngineView + embedded API server."""

    def __init__(self, dev_mode: bool = False):
        super().__init__()
        self.setWindowTitle("PixSim7 Launcher")
        self.setMinimumSize(900, 600)
        self.resize(1100, 700)
        self._dev_mode = dev_mode
        self._api_thread = None

        # Dark title bar hint
        self.setStyleSheet("background-color: #0d1117;")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        # Lazy import — QWebEngineView pulls in Chromium
        from PySide6.QtWebEngineWidgets import QWebEngineView
        from PySide6.QtWebEngineCore import QWebEngineSettings

        self.webview = QWebEngineView()
        settings = self.webview.settings()
        settings.setAttribute(QWebEngineSettings.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.LocalContentCanAccessFileUrls, True)
        layout.addWidget(self.webview)

        # Start API server if not already running
        if not _port_in_use(API_PORT):
            self._api_thread = threading.Thread(
                target=_start_api_server,
                args=(API_PORT,),
                daemon=True,
                name="launcher-api",
            )
            self._api_thread.start()
            # Give uvicorn a moment to bind
            QTimer.singleShot(800, self._load_ui)
        else:
            self._load_ui()

    def _load_ui(self):
        if self._dev_mode:
            url = f"http://localhost:{DEV_PORT}"
        elif STATIC_DIR.is_dir() and (STATIC_DIR / "index.html").exists():
            # Serve built files through the API server (avoids file:// CORS issues)
            # For now just point at the API which will have StaticFiles mounted
            url = f"http://localhost:{API_PORT}"
        else:
            # Fallback: show API docs
            url = f"http://localhost:{API_PORT}/docs"

        self.webview.setUrl(QUrl(url))

    def closeEvent(self, event):
        """Clean shutdown — just close the window, daemon thread dies automatically."""
        event.accept()


def main():
    dev_mode = "--dev" in sys.argv

    # Single-instance check
    try:
        from .pid_file import ensure_single_instance, remove_pid_file
    except ImportError:
        from pid_file import ensure_single_instance, remove_pid_file

    can_proceed, existing_pid = ensure_single_instance()
    if not can_proceed:
        from PySide6.QtWidgets import QMessageBox
        app = QApplication(sys.argv)
        msg = QMessageBox()
        msg.setIcon(QMessageBox.Warning)
        msg.setWindowTitle("Launcher Already Running")
        msg.setText(f"Another instance is running (PID {existing_pid}).")
        msg.setStandardButtons(QMessageBox.Ok)
        msg.exec()
        sys.exit(1)

    import atexit
    atexit.register(remove_pid_file)

    app = QApplication(sys.argv)
    w = WebViewLauncher(dev_mode=dev_mode)
    w.show()

    exit_code = app.exec()
    remove_pid_file()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
