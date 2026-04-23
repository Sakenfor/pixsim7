"""PixSim Launcher entry point.

Starts the launcher API server and optionally opens a desktop window.

Usage:
    python -m launcher              # API only (open http://localhost:3100 in browser)
    python -m launcher --window     # API + native desktop window
    python -m launcher --browser    # API + auto-open browser tab
"""
from __future__ import annotations

import argparse
import inspect
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


def _webview_start_kwargs(debug: bool) -> dict:
    """Build pywebview.start kwargs with persistent browser storage when supported."""
    kwargs: dict[str, object] = {"debug": debug}
    try:
        import webview
        params = inspect.signature(webview.start).parameters
    except Exception:
        return kwargs

    try:
        from launcher.core.paths import LAUNCHER_STATE_DIR, ensure_launcher_runtime_dirs

        ensure_launcher_runtime_dirs()
        webview_storage = LAUNCHER_STATE_DIR / "webview"
        webview_storage.mkdir(parents=True, exist_ok=True)
        # WebView2 fallback path when pywebview doesn't expose storage_path.
        os.environ.setdefault("WEBVIEW2_USER_DATA_FOLDER", str(webview_storage))

        if "private_mode" in params:
            kwargs["private_mode"] = False
        if "storage_path" in params:
            kwargs["storage_path"] = str(webview_storage)
    except Exception:
        # If storage wiring fails, still launch with defaults.
        pass

    return kwargs


def main():
    parser = argparse.ArgumentParser(description="PixSim Launcher")
    parser.add_argument("--window", action="store_true", help="Open UI in a native desktop window (requires pywebview)")
    parser.add_argument("--browser", action="store_true", help="Auto-open UI in default browser")
    parser.add_argument("--port", type=int, default=API_PORT, help=f"API port (default: {API_PORT})")
    parser.add_argument("--debug", action="store_true", help="Enable WebView DevTools (right-click → Inspect)")
    args = parser.parse_args()

    os.environ.setdefault("PIXSIM_LOG_FORMAT", "human")

    print()
    print("  PixSim Launcher")
    print(f"  API:  http://localhost:{args.port}/docs")
    print(f"  UI:   {UI_URL}")
    print()

    if args.window:
        # Cap WebView2 GPU memory and disable a few always-on features. Tune via
        # PIXSIM_WEBVIEW_ARGS to override. `--disable-gpu` is the nuclear option
        # (CPU render, worse scroll) if memory is still high.
        os.environ.setdefault(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            os.environ.get("PIXSIM_WEBVIEW_ARGS")
            or "--disable-gpu-rasterization --disable-zero-copy --disable-features=CalculateNativeWinOcclusion",
        )

        # pywebview MUST run on the main thread — start uvicorn in a background thread
        # (reload disabled — signal handlers require main thread)
        threading.Thread(target=_start_api, args=(args.port, False), daemon=True).start()

        # Wait for both API and UI to be ready, then open window
        if not _wait_for_ui(UI_URL, timeout=30):
            print("  Warning: UI not reachable, opening anyway...", file=sys.stderr)

        # Per-monitor DPI awareness: without this, Windows bitmap-scales the
        # WebView2 surface on high-DPI / mismatched-scale monitors → blurry text.
        if sys.platform == "win32":
            import ctypes
            try:
                ctypes.windll.shcore.SetProcessDpiAwareness(2)
            except (AttributeError, OSError):
                try:
                    ctypes.windll.user32.SetProcessDPIAware()
                except (AttributeError, OSError):
                    pass

        import webview
        webview.create_window("PixSim Launcher", UI_URL, width=1280, height=800)
        webview.start(**_webview_start_kwargs(args.debug))  # blocks main thread until window is closed
    else:
        if args.browser:
            _open_browser(UI_URL)

        # No window mode — uvicorn runs on main thread
        _start_api(args.port)


if __name__ == "__main__":
    main()
