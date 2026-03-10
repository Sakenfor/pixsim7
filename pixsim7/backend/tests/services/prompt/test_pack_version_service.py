from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from pixsim7.backend.main.services.prompt.packs import (
    PromptPackCompileResult,
    PromptPackVersionError,
    PromptPackVersionService,
)


class _DummySession:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.flush_calls = 0

    def add(self, obj: object) -> None:
        self.added.append(obj)

    async def flush(self) -> None:
        self.flush_calls += 1


class _CompileCapture:
    def __init__(self, result: PromptPackCompileResult) -> None:
        self.result = result
        self.calls: list[dict] = []

    async def compile_source(self, **kwargs):
        self.calls.append(dict(kwargs))
        return self.result


def _draft(*, status: str = "compile_ok") -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        owner_user_id=7,
        namespace="user.7",
        cue_source='pack: { package_name: "demo", blocks: [] }\nmanifest: { id: "demo", matrix_presets: [] }\n',
        status=status,
        last_compile_status=status,
        last_compile_errors=[],
        last_compiled_at=None,
        updated_at=None,
    )


@pytest.mark.asyncio
async def test_create_version_from_draft_persists_snapshot(monkeypatch: pytest.MonkeyPatch) -> None:
    session = _DummySession()
    compile_capture = _CompileCapture(
        PromptPackCompileResult(
            ok=True,
            status="compile_ok",
            diagnostics=[],
            pack_yaml="version: 1.0.0\npackage_name: demo\n",
            manifest_yaml="id: demo\nmatrix_presets: []\n",
            pack_json={"package_name": "demo", "blocks": [{"id": "pose"}]},
            blocks_json=[{"id": "pose"}],
        )
    )
    service = PromptPackVersionService(session, compile_service=compile_capture)

    async def _next_version_number(_draft_id):
        return 2

    monkeypatch.setattr(service, "_next_version_number", _next_version_number)
    draft = _draft(status="compile_ok")

    version = await service.create_version_from_draft(draft)

    assert compile_capture.calls[0]["namespace"] == "user.7"
    assert version.version == 2
    assert version.draft_id == draft.id
    assert version.checksum and len(version.checksum) == 64
    assert version.compiled_blocks_json == [{"id": "pose"}]
    assert session.flush_calls == 1
    assert len(session.added) == 1


@pytest.mark.asyncio
async def test_create_version_from_draft_raises_on_compile_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    session = _DummySession()
    compile_capture = _CompileCapture(
        PromptPackCompileResult(
            ok=False,
            status="compile_failed",
            diagnostics=[{"code": "cue.syntax_error", "message": "expected '}'"}],
            pack_yaml=None,
            manifest_yaml=None,
            pack_json=None,
            blocks_json=None,
        )
    )
    service = PromptPackVersionService(session, compile_service=compile_capture)

    async def _next_version_number(_draft_id):
        return 1

    monkeypatch.setattr(service, "_next_version_number", _next_version_number)
    draft = _draft(status="compile_ok")

    with pytest.raises(PromptPackVersionError) as exc:
        await service.create_version_from_draft(draft)

    assert exc.value.status_code == 422
    assert draft.status == "compile_failed"
    assert draft.last_compile_errors[0]["code"] == "cue.syntax_error"
    assert session.flush_calls == 0
    assert session.added == []
