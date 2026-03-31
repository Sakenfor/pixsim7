"""Open URLs in native OS windows via pywebview.

Optional dependency: `pip install pywebview`
Falls back gracefully when not installed.

Used by the /window/open API endpoint for opening service UIs
in desktop windows from the launcher frontend.
"""
from __future__ import annotations

_available: bool | None = None


def is_available() -> bool:
    """Check if pywebview is installed."""
    global _available
    if _available is not None:
        return _available
    try:
        import webview  # noqa: F401
        _available = True
    except ImportError:
        _available = False
    return _available


def open_window(url: str, title: str = "PixSim", width: int = 1280, height: int = 800) -> bool:
    """Open a URL in a native desktop window. Returns False if pywebview is not available.

    Note: pywebview.start() must be called on the main thread. This function
    creates the window but the caller is responsible for ensuring start() runs
    on the main thread (e.g. via the launcher __main__.py entry point).
    """
    if not is_available():
        return False

    import webview
    webview.create_window(title, url, width=width, height=height)
    # Don't call webview.start() here — caller manages the event loop
    return True
