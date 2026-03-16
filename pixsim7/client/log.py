"""Simple client logging — prints to terminal with timestamp."""
from __future__ import annotations

from datetime import datetime, timezone
import sys


def client_log(message: str, error: bool = False) -> None:
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    stream = sys.stderr if error else sys.stdout
    print(f"  [{ts}] {message}", file=stream, flush=True)
