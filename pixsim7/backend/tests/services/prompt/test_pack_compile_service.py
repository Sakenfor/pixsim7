from __future__ import annotations

from pathlib import Path

import pytest

import pixsim7.backend.main.services.prompt.packs.compile_service as compile_module
from pixsim7.backend.main.services.command_runtime import CommandExecutionResult
from pixsim7.backend.main.services.prompt.packs import PromptPackCompileService


def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "tools" / "cue" / "prompt_packs" / "schema_v1.cue").exists():
            return parent
    raise RuntimeError("Could not locate repository root for prompt-pack compile tests")


@pytest.mark.asyncio
async def test_validate_source_rejects_reserved_namespace() -> None:
    service = PromptPackCompileService(repo_root=_repo_root())
    result = await service.validate_source(
        cue_source='pack: { package_name: "demo", blocks: [] }\nmanifest: { id: "x", matrix_presets: [] }\n',
        namespace="system.tools",
    )

    assert result.ok is False
    assert result.status == "compile_failed"
    assert result.diagnostics[0]["code"] in {"namespace.reserved", "namespace.invalid"}


@pytest.mark.asyncio
async def test_compile_source_maps_cue_diagnostics(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_run_subprocess_text(_cmd_list, *, input_text: str, timeout: int):
        _ = input_text, timeout
        return CommandExecutionResult(
            returncode=1,
            stdout="",
            stderr="draft.cue:3:7: expected '}'",
            duration_s=0.01,
        )

    monkeypatch.setattr(compile_module, "run_subprocess_text", _fake_run_subprocess_text)
    service = PromptPackCompileService(repo_root=_repo_root())

    result = await service.compile_source(
        cue_source="pack: {\n  package_name: \"demo\"\n",
        namespace="user.7",
    )

    assert result.ok is False
    assert result.status == "compile_failed"
    assert result.diagnostics[0]["code"] == "cue.syntax_error"
    assert result.diagnostics[0]["line"] == 3
    assert result.diagnostics[0]["column"] == 7
    assert result.diagnostics[0]["source"] == "draft.cue"


@pytest.mark.asyncio
async def test_compile_source_returns_artifacts(monkeypatch: pytest.MonkeyPatch) -> None:
    outputs = iter(
        [
            CommandExecutionResult(
                returncode=0,
                stdout='{"package_name":"demo","blocks":[{"id":"pose"}]}',
                stderr="",
                duration_s=0.01,
            ),
            CommandExecutionResult(
                returncode=0,
                stdout='{"id":"demo","matrix_presets":[{"label":"x","query":{"row_key":"r","col_key":"c"}}]}',
                stderr="",
                duration_s=0.01,
            ),
            CommandExecutionResult(
                returncode=0,
                stdout="version: 1.0.0\npackage_name: demo\n",
                stderr="",
                duration_s=0.01,
            ),
            CommandExecutionResult(
                returncode=0,
                stdout="id: demo\nmatrix_presets: []\n",
                stderr="",
                duration_s=0.01,
            ),
        ]
    )

    async def _fake_run_subprocess_text(_cmd_list, *, input_text: str, timeout: int):
        _ = input_text, timeout
        return next(outputs)

    monkeypatch.setattr(compile_module, "run_subprocess_text", _fake_run_subprocess_text)
    service = PromptPackCompileService(repo_root=_repo_root())

    result = await service.compile_source(
        cue_source='pack: { package_name: "demo", blocks: [{ id: "pose", block_schema: { id_prefix: "a.b", variants: [{ key: "k" }] } }] }\nmanifest: { id: "demo", matrix_presets: [] }\n',
        namespace="user.7",
    )

    assert result.ok is True
    assert result.status == "compile_ok"
    assert result.pack_yaml and "package_name: demo" in result.pack_yaml
    assert result.manifest_yaml and result.manifest_yaml.startswith("id: demo")
    assert result.pack_json == {"package_name": "demo", "blocks": [{"id": "pose"}]}
    assert result.blocks_json == [{"id": "pose"}]
