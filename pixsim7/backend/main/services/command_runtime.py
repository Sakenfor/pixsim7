"""
Shared command-runtime helpers for command-backed providers.
"""

from __future__ import annotations

import asyncio
import logging
import shlex
import subprocess
import sys
import time
from dataclasses import dataclass


@dataclass(frozen=True)
class CommandExecutionResult:
    """Normalized subprocess execution result."""

    returncode: int
    stdout: str
    stderr: str
    duration_s: float


def parse_shell_args(args_str: str, *, logger: logging.Logger | None = None) -> list[str]:
    """
    Parse a shell-style argument string into a list.

    On Windows we keep ``posix=False`` to avoid breaking backslash-heavy paths.
    """
    if not args_str.strip():
        return []

    posix = sys.platform != "win32"

    def _strip_wrapping_quotes(token: str) -> str:
        if len(token) >= 2 and token[0] == token[-1] and token[0] in {'"', "'"}:
            return token[1:-1]
        return token

    try:
        parts = shlex.split(args_str, posix=posix)
        if not posix:
            parts = [_strip_wrapping_quotes(part) for part in parts]
        return parts
    except ValueError as exc:
        if logger:
            logger.warning(
                "Failed to parse arguments with shlex: %s. Falling back to simple split.",
                exc,
            )
        parts = args_str.strip().split()
        if not posix:
            parts = [_strip_wrapping_quotes(part) for part in parts]
        return parts


async def run_subprocess_text(
    cmd_list: list[str],
    *,
    input_text: str,
    timeout: int,
) -> CommandExecutionResult:
    """
    Run a subprocess with text stdin/stdout and return normalized result.
    """
    start_time = time.monotonic()

    def _run() -> subprocess.CompletedProcess:
        return subprocess.run(
            cmd_list,
            input=input_text,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )

    completed = await asyncio.to_thread(_run)
    duration = time.monotonic() - start_time
    return CommandExecutionResult(
        returncode=completed.returncode,
        stdout=completed.stdout or "",
        stderr=completed.stderr or "",
        duration_s=duration,
    )
