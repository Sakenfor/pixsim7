import os
import time

from pixsim_logging.file_rotation import rotate_file, append_line
try:
    from ..core.paths import LAUNCHER_LOG_DIR
except ImportError:
    from launcher.core.paths import LAUNCHER_LOG_DIR

LOG_DIR = str(LAUNCHER_LOG_DIR)
MAX_BYTES = 5 * 1024 * 1024
BACKUPS = 3


def ensure_log_dir() -> str:
    os.makedirs(LOG_DIR, exist_ok=True)
    return LOG_DIR


def append_log(filename: str, line: str) -> None:
    ensure_log_dir()
    path = os.path.join(LOG_DIR, filename)
    rotated = rotate_file(path, MAX_BYTES, BACKUPS)
    if rotated:
        # if rotated, reset timestamped append by truncating file (already done)
        pass
    ts = time.strftime('%Y-%m-%d %H:%M:%S')
    try:
        append_line(path, f"[{ts}] {line.rstrip()}\n")
    except Exception:
        # swallow errors to keep launcher stable
        pass
