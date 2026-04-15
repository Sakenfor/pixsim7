"""
ADB Keeper — launcher-managed background service.

Keeps the ADB server alive and periodically reconnects a configured list of
network-attached emulators (LDPlayer, MuMu, Nox, etc.) whose host:port entries
fall out of `adb devices` whenever the ADB server restarts or the network blips.

Backend code (device_sync_service, automation worker) keeps owning the
AndroidDevice domain — this script only ensures the ADB substrate they rely on
stays healthy. Same role the launcher already plays for Docker DBs / Redis.

Run via:
    python -m launcher.adb_keeper

Configuration via env (set by launcher service settings):
    ADB_KEEPER_ENDPOINTS     comma-separated host:port list
    ADB_KEEPER_INTERVAL_SEC  reconnect cycle interval in seconds (default 30)
    ADB_KEEPER_ADB_PATH      override `adb` binary path (default: PATH lookup)
"""
from __future__ import annotations

import os
import shlex
import signal
import subprocess
import sys
import time
from typing import Iterable


def _log(msg: str) -> None:
    sys.stdout.write(f"[adb-keeper] {msg}\n")
    sys.stdout.flush()


def _adb_binary() -> str:
    return os.environ.get("ADB_KEEPER_ADB_PATH") or "adb"


def _parse_endpoints(raw: str) -> list[str]:
    seen: list[str] = []
    for item in raw.replace(";", ",").split(","):
        ep = item.strip()
        if ep and ":" in ep and ep not in seen:
            seen.append(ep)
    return seen


def _run_adb(args: list[str], timeout: float = 10.0) -> tuple[int, str]:
    cmd = [_adb_binary(), *args]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout
        )
        out = (result.stdout or "") + (result.stderr or "")
        return result.returncode, out.strip()
    except FileNotFoundError:
        return 127, f"adb binary not found: {_adb_binary()}"
    except subprocess.TimeoutExpired:
        return 124, f"adb {shlex.join(args)} timed out after {timeout}s"


def _connected_serials() -> set[str]:
    code, out = _run_adb(["devices"])
    if code != 0:
        return set()
    serials: set[str] = set()
    for line in out.splitlines()[1:]:
        line = line.strip()
        if "\t" in line:
            serial, state = line.split("\t", 1)
            if state == "device":
                serials.add(serial)
    return serials


def _ensure_server() -> bool:
    code, out = _run_adb(["start-server"])
    if code == 0:
        return True
    _log(f"start-server failed (code={code}): {out}")
    return False


def _reconnect_missing(endpoints: Iterable[str], connected: set[str]) -> None:
    for ep in endpoints:
        if ep in connected:
            continue
        code, out = _run_adb(["connect", ep], timeout=5.0)
        ok = code == 0 and ("connected to" in out.lower() or "already connected" in out.lower())
        _log(f"connect {ep} -> {'ok' if ok else 'fail'} ({out!r})")


_running = True


def _stop(_signum, _frame) -> None:
    global _running
    _running = False
    _log("shutdown signal received")


def main() -> int:
    interval = max(5, int(os.environ.get("ADB_KEEPER_INTERVAL_SEC", "30") or 30))
    endpoints = _parse_endpoints(os.environ.get("ADB_KEEPER_ENDPOINTS", ""))

    _log(f"started (adb={_adb_binary()}, interval={interval}s, endpoints={endpoints or '[]'})")
    if not endpoints:
        _log("no endpoints configured — server-keepalive only")

    signal.signal(signal.SIGINT, _stop)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _stop)

    while _running:
        if not _ensure_server():
            time.sleep(min(interval, 10))
            continue

        if endpoints:
            connected = _connected_serials()
            _reconnect_missing(endpoints, connected)

        # Sleep in small chunks so SIGTERM is responsive.
        slept = 0.0
        while _running and slept < interval:
            time.sleep(0.5)
            slept += 0.5

    _log("exited")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
