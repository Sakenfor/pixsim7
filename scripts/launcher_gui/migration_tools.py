"""Alembic migration helpers for Launcher GUI.

Provides lightweight wrappers around alembic command-line usage.
Assumes alembic.ini resides at repo root.
"""
from __future__ import annotations
import subprocess
import os
from dataclasses import dataclass
from typing import Optional

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ALEMBIC_INI = os.path.join(ROOT, 'alembic.ini')


def _run_alembic(*args: str, timeout: int = 120) -> tuple[int, str, str]:
    cmd = ['alembic', '-c', ALEMBIC_INI, *args]
    proc = subprocess.Popen(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    out, err = proc.communicate(timeout=timeout)
    return proc.returncode, out, err


def get_current_revision() -> str:
    code, out, err = _run_alembic('current')
    if code != 0:
        return f"error: {err.strip() or out.strip()}"
    return out.strip() or '(no revision)'


def get_heads() -> str:
    code, out, err = _run_alembic('heads')
    if code != 0:
        return f"error: {err.strip() or out.strip()}"
    return out.strip() or '(no heads)'


def get_history(limit: int = 20) -> str:
    code, out, err = _run_alembic('history', f'-n {limit}')
    if code != 0:
        return f"error: {err.strip() or out.strip()}"
    return out.strip()


def upgrade_head() -> str:
    code, out, err = _run_alembic('upgrade', 'head')
    if code != 0:
        return f"upgrade failed: {err.strip() or out.strip()}"
    return out.strip() or 'upgraded to head'


def downgrade_one() -> str:
    code, out, err = _run_alembic('downgrade', '-1')
    if code != 0:
        return f"downgrade failed: {err.strip() or out.strip()}"
    return out.strip() or 'downgraded -1'


def stamp_head() -> str:
    code, out, err = _run_alembic('stamp', 'head')
    if code != 0:
        return f"stamp failed: {err.strip() or out.strip()}"
    return out.strip() or 'stamped head'

