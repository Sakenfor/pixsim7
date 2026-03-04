"""
Canonical launcher runtime paths.

Keeps launcher cache/log/state directories in one place so callers do not
rebuild ad-hoc `data/...` paths.
"""

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
LOGS_DIR = DATA_DIR / "logs"

CONSOLE_LOG_DIR = LOGS_DIR / "console"
LAUNCHER_LOG_DIR = LOGS_DIR / "launcher"
CACHE_DIR = DATA_DIR / "cache"
LAUNCHER_STATE_DIR = DATA_DIR / "launcher"


def ensure_launcher_runtime_dirs() -> None:
    """Ensure launcher runtime directories exist."""
    for directory in (CONSOLE_LOG_DIR, LAUNCHER_LOG_DIR, CACHE_DIR, LAUNCHER_STATE_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def console_log_file(service_key: str) -> Path:
    return CONSOLE_LOG_DIR / f"{service_key}.log"


def launcher_log_file(filename: str) -> Path:
    return LAUNCHER_LOG_DIR / filename
