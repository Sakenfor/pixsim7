"""Tests for the runner -> backfill actor handoff.

The run manager hands a run's actor (``started_by``, e.g. ``agent:<id>``) to the
spawned script via the ``PIXSIM_BACKFILL_ACTOR`` env var, so a backfill's
``record_backfill_applied`` attributes the apply to the real principal rather
than ``cli:<os-user>``. Two levels:

- run-manager contract: the actor reaches ``Diagnostic.run`` via a reserved
  params key WITHOUT polluting the persisted ``run.params``.
- end-to-end: ``ShellScriptDiagnostic.run`` actually sets the env on the child,
  proven by a tiny allowlisted script that echoes the var back.
"""
from __future__ import annotations

import asyncio
import types
from unittest.mock import AsyncMock

import pytest

from pixsim7.backend.main.services.diagnostics import shell_script as ss
from pixsim7.backend.main.services.diagnostics.base import (
    RUN_ACTOR_PARAM,
    Diagnostic,
    DiagnosticEvent,
    DiagnosticSpec,
)
from pixsim7.backend.main.services.diagnostics.runs import DiagnosticRunManager

TEST_SUITE = {
    "id": "diagnostics-actor-handoff",
    "label": "Diagnostics Runner Actor Handoff",
    "kind": "integration",
    "category": "backend/services",
    "subcategory": "diagnostics",
    "covers": [
        "pixsim7/backend/main/services/diagnostics/runs.py",
        "pixsim7/backend/main/services/diagnostics/shell_script.py",
    ],
    "order": 27,
}


# ── run-manager contract ─────────────────────────────────────────────────────


class _CapturingDiagnostic(Diagnostic):
    spec = DiagnosticSpec(id="capture", label="Capture", description="")

    def __init__(self) -> None:
        self.received: dict | None = None

    async def run(self, params, cancel_event):
        self.received = dict(params)
        yield DiagnosticEvent(0.0, "log", {"message": "ok"})


@pytest.mark.asyncio
async def test_run_manager_passes_actor_without_polluting_persisted_params(monkeypatch):
    mgr = DiagnosticRunManager()
    # Silence the best-effort DB mirror so the test touches no database.
    monkeypatch.setattr(mgr, "_persist_start", AsyncMock())
    monkeypatch.setattr(mgr, "_persist_final", AsyncMock())

    diag = _CapturingDiagnostic()
    run = await mgr.start(diag, {"foo": "bar"}, started_by="agent:xyz")
    await run._task  # let the run complete

    # The diagnostic sees the actor alongside its real params...
    assert diag.received[RUN_ACTOR_PARAM] == "agent:xyz"
    assert diag.received["foo"] == "bar"
    # ...but the persisted params (mirrored to diagnostic_runs) stay clean.
    assert RUN_ACTOR_PARAM not in run.params
    assert run.params == {"foo": "bar"}


# ── end-to-end: child process actually receives the env ──────────────────────


def _use_fake_repo(monkeypatch, tmp_path) -> None:
    (tmp_path / "tools").mkdir()
    (tmp_path / "scripts").mkdir()
    monkeypatch.setattr(
        ss, "get_path_registry", lambda: types.SimpleNamespace(repo_root=tmp_path)
    )
    monkeypatch.setattr(ss, "_discovery_cache", None)
    monkeypatch.setattr(ss, "_discovery_sig", None)


_ECHO_SCRIPT = (
    "import os\n"
    "print(os.environ.get('PIXSIM_BACKFILL_ACTOR', '<none>'))\n"
)


async def _run_log_messages(params) -> list[str]:
    events = [e async for e in ss.ShellScriptDiagnostic().run(params, asyncio.Event())]
    return [e.payload.get("message") for e in events if e.type == "log"]


@pytest.mark.asyncio
async def test_shell_script_sets_actor_env_on_child(monkeypatch, tmp_path):
    _use_fake_repo(monkeypatch, tmp_path)
    (tmp_path / "scripts" / "echo_actor.py").write_text(_ECHO_SCRIPT)

    messages = await _run_log_messages(
        {
            "script": "scripts/echo_actor.py",
            "apply": False,
            "args": "",
            "kill_grace_s": "5 — default",
            RUN_ACTOR_PARAM: "agent:probe",
        }
    )
    assert "agent:probe" in messages  # child read it from the env


@pytest.mark.asyncio
async def test_shell_script_no_actor_means_child_sees_none(monkeypatch, tmp_path):
    monkeypatch.delenv("PIXSIM_BACKFILL_ACTOR", raising=False)  # don't inherit a leak
    _use_fake_repo(monkeypatch, tmp_path)
    (tmp_path / "scripts" / "echo_actor.py").write_text(_ECHO_SCRIPT)

    messages = await _run_log_messages(
        {
            "script": "scripts/echo_actor.py",
            "apply": False,
            "args": "",
            "kill_grace_s": "5 — default",
        }
    )
    assert "<none>" in messages
    assert "agent:probe" not in messages
