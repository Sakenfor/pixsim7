"""Generic ShellScriptDiagnostic — run an allowlisted script, stream its output.

Spawns a Python script from ``tools/`` or ``scripts/`` and streams its
stdout/stderr line-by-line as ``log`` events.  Lines that parse as a
JSON object with a ``type`` field matching one of the framework's
upgradable event kinds (``phase``, ``observation``, ``transition``,
``summary``) get promoted to first-class typed events automatically —
so a script that wants richer UI integration just needs to print
JSON-lines instead of plain text.

The allowlist is discovered at import time from
``<repo_root>/tools/*.py`` and ``<repo_root>/scripts/*.py`` (one level
deep, skipping dunder/underscore files).  Admin-only run gate already
applies via the diagnostic route.
"""

from __future__ import annotations

import ast
import asyncio
import json
import os
import shlex
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator, Optional

from pixsim7.backend.main.shared.path_registry import get_path_registry

from .applied_ledger import ACTOR_ENV_VAR
from .base import (
    RUN_ACTOR_PARAM,
    Diagnostic,
    DiagnosticEvent,
    DiagnosticParam,
    DiagnosticSpec,
    parse_select_float,
)


_UPGRADABLE_TYPES = {"phase", "observation", "transition", "summary"}
_SCAN_DIRS = ("tools", "scripts")
_SUMMARY_MAX = 72


@dataclass(frozen=True)
class _ScriptMeta:
    """Discovered metadata for one allowlisted script."""

    path: str  # repo-relative posix path; the stable select value
    summary: str  # first line of the module docstring (may be "")
    has_apply: bool  # source declares a ``--apply`` flag (dry-run by default)


def _extract_summary(text: str) -> str:
    """First non-empty docstring line, truncated. Empty on parse failure."""
    try:
        doc = ast.get_docstring(ast.parse(text))
    except (SyntaxError, ValueError):
        return ""
    if not doc:
        return ""
    first = doc.strip().splitlines()[0].strip()
    if len(first) > _SUMMARY_MAX:
        first = first[: _SUMMARY_MAX - 1].rstrip() + "…"
    return first


def _discover_scripts() -> tuple[_ScriptMeta, ...]:
    root = get_path_registry().repo_root
    out: list[_ScriptMeta] = []
    for sub in _SCAN_DIRS:
        d = root / sub
        if not d.exists():
            continue
        for p in sorted(d.glob("*.py")):
            if p.name.startswith("_") or p.name.startswith("."):
                continue
            try:
                text = p.read_text(encoding="utf-8", errors="replace")
            except OSError:
                text, summary = "", ""
            else:
                summary = _extract_summary(text)
            out.append(
                _ScriptMeta(
                    path=p.relative_to(root).as_posix(),
                    summary=summary,
                    has_apply="--apply" in text,
                )
            )
    return tuple(out)


def _option_label(m: _ScriptMeta) -> str:
    """Self-documenting select label. The path stays the leading token so
    ``_parse_script_path`` can recover it (mirrors ``parse_select_*``)."""
    parts = [m.path]
    if m.has_apply:
        parts.append("[--apply]")
    if m.summary:
        parts.append(f"— {m.summary}")
    return " ".join(parts)


def _parse_script_path(value: Any) -> str:
    """Recover the repo-relative path from a select label (or a bare path)."""
    if not value:
        return ""
    tokens = str(value).strip().split()
    return tokens[0] if tokens else ""


@dataclass(frozen=True)
class _Discovery:
    """A discovery snapshot: scripts + the derived lookups the runner needs."""

    scripts: tuple[_ScriptMeta, ...]
    by_path: dict[str, _ScriptMeta]
    allowed: frozenset[str]
    options: tuple[str, ...]


def _scan_signature() -> tuple[tuple[str, int, int], ...]:
    """Cheap fingerprint of the scanned dirs: (name, mtime_ns, size) per file.

    Stat-only (no file reads) so the steady-state "nothing changed" path stays
    fast; only a fingerprint change triggers a full ``_discover_scripts`` re-scan
    (which reads file bodies for docstring/``--apply`` detection)."""
    root = get_path_registry().repo_root
    sig: list[tuple[str, int, int]] = []
    for sub in _SCAN_DIRS:
        d = root / sub
        if not d.exists():
            continue
        for p in sorted(d.glob("*.py")):
            if p.name.startswith("_") or p.name.startswith("."):
                continue
            try:
                st = p.stat()
                sig.append((p.name, st.st_mtime_ns, st.st_size))
            except OSError:
                sig.append((p.name, 0, 0))
    return tuple(sig)


_discovery_cache: Optional[_Discovery] = None
_discovery_sig: Optional[tuple[tuple[str, int, int], ...]] = None


def get_discovery() -> _Discovery:
    """Current script discovery, re-scanning only when the dir fingerprint
    changes. This is what lets a newly-added ``tools/``/``scripts/`` file show
    up (and become runnable) without a backend restart — both the listed select
    options and the run-time allowlist read through here."""
    global _discovery_cache, _discovery_sig
    sig = _scan_signature()
    if _discovery_cache is None or sig != _discovery_sig:
        scripts = _discover_scripts()
        by_path = {m.path: m for m in scripts}
        _discovery_cache = _Discovery(
            scripts=scripts,
            by_path=by_path,
            allowed=frozenset(by_path),
            options=tuple(_option_label(m) for m in scripts),
        )
        _discovery_sig = sig
    return _discovery_cache


def _build_spec(options: tuple[str, ...]) -> DiagnosticSpec:
    """Build the shell-script spec from a discovery snapshot. Called fresh by
    ``get_spec`` per list request so the ``script`` options track the filesystem."""
    return DiagnosticSpec(
        id="shell-script",
        label="Run shell script",
        description=(
            "Run an allowlisted Python script from tools/ or scripts/ and "
            "stream its stdout/stderr as log events. Lines that parse as "
            "JSON with a known type field (phase/observation/transition/"
            "summary) become first-class typed events automatically."
        ),
        category="diagnostic",
        params=(
            DiagnosticParam(
                name="script",
                kind="select",
                label="Script",
                default=(options[0] if options else ""),
                options=list(options),
                required=True,
                description=(
                    "Allowlisted from tools/ and scripts/. Label shows the "
                    "docstring summary; [--apply] marks scripts that default "
                    "to dry-run."
                ),
            ),
            DiagnosticParam(
                name="apply",
                kind="bool",
                label="Apply (disable dry-run)",
                default=False,
                description=(
                    "Append --apply for scripts that support it. Ignored "
                    "(with a warning) for scripts that don't declare the flag."
                ),
            ),
            DiagnosticParam(
                name="args",
                kind="string",
                label="CLI args",
                default="",
                description="Free-form CLI args appended verbatim (shell-quoted parse).",
            ),
            DiagnosticParam(
                name="kill_grace_s",
                kind="select",
                label="Cancel grace (s)",
                default="5 — default",
                options=["2 — impatient", "5 — default", "10 — patient (slow cleanup)"],
                description="On cancel, how long to wait after SIGTERM before SIGKILL.",
            ),
        ),
    )


class ShellScriptDiagnostic(Diagnostic):
    # Static class attr keeps ``spec.id`` available for registration/keying.
    # ``get_spec`` (below) rebuilds the options from fresh discovery per list
    # request, so a restart isn't needed to surface a newly-added script.
    spec = _build_spec(get_discovery().options)

    def get_spec(self) -> DiagnosticSpec:
        return _build_spec(get_discovery().options)

    async def run(
        self,
        params: dict[str, Any],
        cancel_event: asyncio.Event,
    ) -> AsyncIterator[DiagnosticEvent]:
        loop = asyncio.get_event_loop()
        t0 = loop.time()

        def now() -> float:
            return loop.time() - t0

        script = _parse_script_path(params.get("script"))
        args_raw = str(params.get("args") or "")
        apply = bool(params.get("apply"))
        grace = max(0.0, parse_select_float(params.get("kill_grace_s"), 5.0))

        disc = get_discovery()
        if script not in disc.allowed:
            yield DiagnosticEvent(
                now(),
                "error",
                {"message": f"Script not allowlisted: {script!r}"},
            )
            return

        repo_root = get_path_registry().repo_root
        target = (repo_root / script).resolve()
        if not target.exists():
            yield DiagnosticEvent(
                now(),
                "error",
                {"message": f"Script file missing: {target}"},
            )
            return

        try:
            args = shlex.split(args_raw) if args_raw else []
        except ValueError as exc:
            yield DiagnosticEvent(
                now(),
                "error",
                {"message": f"Failed to parse args: {exc}"},
            )
            return

        # Translate the dry-run/apply toggle into a flag, but only for scripts
        # that actually declare --apply, and never duplicate a hand-typed one.
        meta = disc.by_path.get(script)
        if apply:
            if meta is not None and not meta.has_apply:
                yield DiagnosticEvent(
                    now(),
                    "log",
                    {
                        "level": "warning",
                        "message": (
                            f"{script} has no --apply flag; ignoring the "
                            "Apply toggle (running as-is)."
                        ),
                    },
                )
            elif "--apply" not in args:
                args = [*args, "--apply"]

        yield DiagnosticEvent(now(), "phase", {"phase": "starting"})
        yield DiagnosticEvent(
            now(),
            "log",
            {
                "level": "info",
                "message": (
                    f"$ {sys.executable} -u {target} "
                    + " ".join(shlex.quote(a) for a in args)
                ).rstrip(),
            },
        )

        # Hand the run's actor to the child so a backfill's record_backfill_applied
        # attributes the apply to the principal that launched the run (agent/user),
        # not just cli:<os-user>. The child reads ACTOR_ENV_VAR; absent it falls back.
        child_env = dict(os.environ)
        actor = params.get(RUN_ACTOR_PARAM)
        if actor:
            child_env[ACTOR_ENV_VAR] = str(actor)

        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable,
                "-u",
                str(target),
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(repo_root),
                env=child_env,
            )
        except Exception as exc:  # noqa: BLE001 — surface spawn failure
            yield DiagnosticEvent(
                now(),
                "error",
                {"message": f"spawn failed: {type(exc).__name__}: {exc}"},
            )
            return

        yield DiagnosticEvent(
            now(),
            "transition",
            {"key": "t_spawned", "value": now(), "pid": proc.pid},
        )
        yield DiagnosticEvent(now(), "phase", {"phase": "running"})

        # Fan stdout + stderr into one ordered queue so we preserve interleave order.
        merged: asyncio.Queue[tuple[str, Optional[bytes]]] = asyncio.Queue()

        async def pump(stream: asyncio.StreamReader, label: str) -> None:
            while True:
                line = await stream.readline()
                if not line:
                    await merged.put((label, None))
                    return
                await merged.put((label, line))

        async def watch_cancel() -> None:
            await cancel_event.wait()
            try:
                proc.terminate()
            except ProcessLookupError:
                return
            try:
                await asyncio.wait_for(proc.wait(), timeout=grace)
            except asyncio.TimeoutError:
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass

        pump_tasks = [
            asyncio.create_task(pump(proc.stdout, "stdout"), name="shell-script-stdout"),
            asyncio.create_task(pump(proc.stderr, "stderr"), name="shell-script-stderr"),
        ]
        cancel_task = asyncio.create_task(watch_cancel(), name="shell-script-cancel")

        stdout_done = False
        stderr_done = False
        stdout_lines = 0
        stderr_lines = 0
        upgraded_events = 0

        try:
            while not (stdout_done and stderr_done):
                label, line = await merged.get()
                if line is None:
                    if label == "stdout":
                        stdout_done = True
                    else:
                        stderr_done = True
                    continue

                text = line.decode("utf-8", errors="replace").rstrip("\r\n")
                if label == "stdout":
                    stdout_lines += 1
                else:
                    stderr_lines += 1

                upgraded = _maybe_upgrade(text)
                if upgraded is not None:
                    upgraded_events += 1
                    event_type = upgraded.pop("type")
                    upgraded.pop("t_rel", None)  # diagnostic-supplied t_rel wins
                    yield DiagnosticEvent(now(), event_type, upgraded)
                else:
                    yield DiagnosticEvent(
                        now(),
                        "log",
                        {
                            "level": "error" if label == "stderr" else "info",
                            "message": text,
                            "source": label,
                        },
                    )
        finally:
            for t in pump_tasks:
                if not t.done():
                    t.cancel()
            if not cancel_task.done():
                cancel_task.cancel()
            await asyncio.gather(*pump_tasks, cancel_task, return_exceptions=True)

        rc = await proc.wait()

        yield DiagnosticEvent(now(), "phase", {"phase": "done"})
        yield DiagnosticEvent(
            now(),
            "summary",
            {
                "script": script,
                "args": args,
                "applied": apply and "--apply" in args,
                "exit_code": rc,
                "stdout_lines": stdout_lines,
                "stderr_lines": stderr_lines,
                "upgraded_events": upgraded_events,
            },
        )


def _maybe_upgrade(line: str) -> Optional[dict[str, Any]]:
    """Return a typed-event dict if ``line`` is JSON with an upgradable type."""
    s = line.strip()
    if not s or s[0] != "{":
        return None
    try:
        obj = json.loads(s)
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(obj, dict):
        return None
    t = obj.get("type")
    if not isinstance(t, str) or t not in _UPGRADABLE_TYPES:
        return None
    return obj
