"""Shared helpers for rotating and appending local log files."""
from __future__ import annotations

import os
from typing import Optional


def _ensure_parent_dir(path: str) -> None:
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)


def rotate_file(path: str, max_bytes: Optional[int], backups: int = 1) -> bool:
    """Rotate file when it exceeds `max_bytes`.

    Returns True if a rotation occurred.
    """
    if not max_bytes or max_bytes <= 0:
        return False

    _ensure_parent_dir(path)
    if not os.path.exists(path) or os.path.getsize(path) < max_bytes:
        return False

    for idx in range(backups, 0, -1):
        src = path if idx == 1 else f"{path}.{idx-1}"
        dst = f"{path}.{idx}"
        if os.path.exists(src):
            os.replace(src, dst)

    open(path, 'w', encoding='utf-8').close()
    return True


def append_line(path: str, line: str, *, encoding: str = 'utf-8', errors: str = 'ignore') -> None:
    """Append a line to the file, ensuring the directory exists."""
    _ensure_parent_dir(path)
    with open(path, 'a', encoding=encoding, errors=errors) as f:
        f.write(line)
