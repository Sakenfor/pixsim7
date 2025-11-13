import os
import time
from typing import TextIO

LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'data', 'logs', 'launcher')


def ensure_log_dir() -> str:
    os.makedirs(LOG_DIR, exist_ok=True)
    return LOG_DIR


def _rotate_if_needed(path: str, max_bytes: int = 5 * 1024 * 1024, backups: int = 3) -> None:
    try:
        if os.path.exists(path) and os.path.getsize(path) >= max_bytes:
            # rotate: file -> .1, .1 -> .2, ... up to backups
            for i in range(backups, 0, -1):
                src = f"{path}.{i}"
                dst = f"{path}.{i+1}"
                if os.path.exists(src):
                    if i == backups:
                        try:
                            os.remove(src)
                        except OSError:
                            pass
                    else:
                        os.replace(src, dst)
            os.replace(path, f"{path}.1")
    except Exception:
        # best-effort; don't crash launcher on rotation issues
        pass


def append_log(filename: str, line: str) -> None:
    ensure_log_dir()
    path = os.path.join(LOG_DIR, filename)
    _rotate_if_needed(path)
    ts = time.strftime('%Y-%m-%d %H:%M:%S')
    try:
        with open(path, 'a', encoding='utf-8', errors='ignore') as f:
            f.write(f"[{ts}] {line.rstrip()}\n")
    except Exception:
        # swallow errors to keep launcher stable
        pass
