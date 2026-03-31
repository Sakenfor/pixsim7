"""PixSim Launcher entry point.

Starts the launcher API server and optionally opens a desktop window.

Usage:
    python -m launcher              # API only (open http://localhost:3100 in browser)
    python -m launcher --window     # API + native desktop window
    python -m launcher --browser    # API + auto-open browser tab
"""
from __future__ import annotations

import argparse
import os
import sys
import threading
import time
import webbrowser

# Ensure project root is on path
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

UI_URL = "http://localhost:3100"
API_PORT = 8100


def _wait_for_ui(url: str, timeout: float = 30) -> bool:
    """Wait until the UI responds (Vite may take a moment to start)."""
    import urllib.request
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=2)
            return True
        except Exception:
            time.sleep(0.5)
    return False


def _start_api(port: int, reload: bool = True):
    """Start uvicorn. When running in a background thread, disable reload
    (signal handlers only work on the main thread)."""
    import uvicorn
    uvicorn.run(
        "launcher.api.main:app",
        host="0.0.0.0",
        port=port,
        reload=reload,
    )


def _open_browser(url: str):
    """Open UI in the default browser after it's reachable."""
    def _run():
        if _wait_for_ui(url):
            webbrowser.open(url)
    threading.Thread(target=_run, daemon=True).start()


def main():
    parser = argparse.ArgumentParser(description="PixSim Launcher")
    parser.add_argument("--window", action="store_true", help="Open UI in a native desktop window (requires pywebview)")
    parser.add_argument("--browser", action="store_true", help="Auto-open UI in default browser")
    parser.add_argument("--port", type=int, default=API_PORT, help=f"API port (default: {API_PORT})")
    args = parser.parse_args()

    os.environ.setdefault("PIXSIM_LOG_FORMAT", "human")

    print()
    print("  PixSim Launcher")
    print(f"  API:  http://localhost:{args.port}/docs")
    print(f"  UI:   {UI_URL}")
    print()

    if args.window:
        # pywebview MUST run on the main thread — start uvicorn in a background thread
        # (reload disabled — signal handlers require main thread)
        threading.Thread(target=_start_api, args=(args.port, False), daemon=True).start()

        # Wait for both API and UI to be ready, then open window
        if not _wait_for_ui(UI_URL, timeout=30):
            print("  Warning: UI not reachable, opening anyway...", file=sys.stderr)

        import webview
        webview.create_window("PixSim Launcher", UI_URL, width=1280, height=800)
        webview.start()  # blocks main thread until window is closed
    else:
        if args.browser:
            _open_browser(UI_URL)

        # No window mode — uvicorn runs on main thread
        _start_api(args.port)


if __name__ == "__main__":
    main()
