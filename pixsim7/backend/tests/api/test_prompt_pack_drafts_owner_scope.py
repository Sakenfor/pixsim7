"""Prompt pack drafts API ownership and scope tests."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

import pixsim7.backend.main.api.v1.prompt_packs as prompt_packs_module
from pixsim7.backend.main.api.v1.prompt_packs import (
    PromptPackDraftSourceUpdate,
    PromptPackDraftCreate,
    PromptPackDraftUpdate,
    compile_prompt_pack_draft,
    create_prompt_pack_version,
    create_prompt_pack_draft,
    get_prompt_pack_version,
    get_prompt_pack_draft,
    list_prompt_pack_drafts,
    list_prompt_pack_versions,
    replace_prompt_pack_draft_source,
    update_prompt_pack_draft,
    validate_prompt_pack_draft,
)


def _user(*, user_id: int, username: str = "user", is_admin: bool = False) -> SimpleNamespace:
    return SimpleNamespace(
        id=user_id,
        username=username,
        is_admin=(lambda: is_admin),
    )


def _draft(*, owner_user_id: int = 7, namespace: str = "user.7", pack_slug: str = "my-pack") -> SimpleNamespace:
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=uuid4(),
        owner_user_id=owner_user_id,
        namespace=namespace,
        pack_slug=pack_slug,
        status="draft",
        cue_source="pack: {}",
        last_compile_status=None,
        last_compile_errors=[],
        last_compiled_at=None,
        created_at=now,
        updated_at=now,
    )


def _version(*, draft_id=None, version: int = 1) -> SimpleNamespace:
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=uuid4(),
        draft_id=draft_id or uuid4(),
        version=version,
        cue_source="pack: {}",
        compiled_schema_yaml="version: 1.0.0\n",
        compiled_manifest_yaml="id: demo\n",
        compiled_blocks_json=[{"id": "pose"}],
        checksum="a" * 64,
        created_at=now,
    )


class _DummyDB:
    def __init__(self) -> None:
        self.commit_calls = 0

    async def commit(self) -> None:
        self.commit_calls += 1


class _ServiceCapture:
    def __init__(self, *, draft: SimpleNamespace | None = None) -> None:
        self._draft = draft or _draft()
        self.create_calls: list[dict] = []
        self.list_calls: list[dict] = []
        self.get_calls: list[dict] = []
        self.update_calls: list[dict] = []
        self.replace_source_calls: list[dict] = []
        self.record_compile_calls: list[dict] = []

    async def create_draft(self, **kwargs):
        self.create_calls.append(dict(kwargs))
        if kwargs.get("owner_user_id") != self._draft.owner_user_id:
            self._draft = _draft(
                owner_user_id=kwargs["owner_user_id"],
                namespace=kwargs.get("namespace") or f"user.{kwargs['owner_user_id']}",
                pack_slug=kwargs.get("pack_slug") or "my-pack",
            )
        return self._draft

    async def list_drafts(self, **kwargs):
        self.list_calls.append(dict(kwargs))
        return [self._draft]

    async def get_draft(self, draft_id):
        self.get_calls.append({"draft_id": draft_id})
        return self._draft

    async def update_draft_metadata(self, **kwargs):
        self.update_calls.append(dict(kwargs))
        if kwargs.get("namespace") is not None:
            self._draft.namespace = kwargs["namespace"]
        if kwargs.get("pack_slug") is not None:
            self._draft.pack_slug = kwargs["pack_slug"]
        if kwargs.get("status") is not None:
            self._draft.status = kwargs["status"]
        return self._draft

    async def replace_draft_source(self, **kwargs):
        self.replace_source_calls.append(dict(kwargs))
        self._draft.cue_source = kwargs.get("cue_source", "")
        self._draft.status = "draft"
        self._draft.last_compile_status = None
        self._draft.last_compile_errors = []
        self._draft.last_compiled_at = None
        return self._draft

    async def record_compile_result(self, **kwargs):
        self.record_compile_calls.append(dict(kwargs))
        self._draft.status = kwargs["status"]
        self._draft.last_compile_status = kwargs["status"]
        self._draft.last_compile_errors = kwargs.get("diagnostics", [])
        self._draft.last_compiled_at = datetime.now(timezone.utc)
        return self._draft


class _CompileCapture:
    def __init__(
        self,
        *,
        validate_result: SimpleNamespace | None = None,
        compile_result: SimpleNamespace | None = None,
    ) -> None:
        self.validate_result = validate_result or SimpleNamespace(
            ok=True,
            status="compile_ok",
            diagnostics=[],
            pack_yaml=None,
            manifest_yaml=None,
            pack_json=None,
            blocks_json=[],
        )
        self.compile_result = compile_result or SimpleNamespace(
            ok=True,
            status="compile_ok",
            diagnostics=[],
            pack_yaml="package_name: demo\n",
            manifest_yaml="id: demo\n",
            pack_json={"package_name": "demo", "blocks": []},
            blocks_json=[],
        )
        self.validate_calls: list[dict] = []
        self.compile_calls: list[dict] = []

    async def validate_source(self, **kwargs):
        self.validate_calls.append(dict(kwargs))
        return self.validate_result

    async def compile_source(self, **kwargs):
        self.compile_calls.append(dict(kwargs))
        return self.compile_result


class _VersionServiceCapture:
    def __init__(
        self,
        *,
        version: SimpleNamespace | None = None,
        raise_on_create: Exception | None = None,
    ) -> None:
        self._version = version or _version()
        self.raise_on_create = raise_on_create
        self.create_calls: list[dict] = []
        self.list_calls: list[dict] = []
        self.get_calls: list[dict] = []

    async def create_version_from_draft(self, draft):
        self.create_calls.append({"draft": draft})
        if self.raise_on_create is not None:
            raise self.raise_on_create
        self._version.draft_id = draft.id
        return self._version

    async def list_versions(self, **kwargs):
        self.list_calls.append(dict(kwargs))
        return [self._version]

    async def get_version(self, version_id):
        self.get_calls.append({"version_id": version_id})
        return self._version


@pytest.mark.asyncio
async def test_list_drafts_defaults_to_current_user_scope(monkeypatch: pytest.MonkeyPatch) -> None:
    capture = _ServiceCapture()
    monkeypatch.setattr(prompt_packs_module, "PromptPackDraftService", lambda _db: capture)

    result = await list_prompt_pack_drafts(
        owner_user_id=None,
        mine=True,
        limit=50,
        offset=0,
        current_user=_user(user_id=7, username="alice"),
        db=_DummyDB(),
    )

    assert capture.list_calls[0]["owner_user_id"] == 7
    assert result[0].owner_user_id == 7
    assert result[0].owner_ref == "user:7"
    assert result[0].owner_username == "alice"


@pytest.mark.asyncio
async def test_list_drafts_blocks_foreign_owner_for_non_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    capture = _ServiceCapture()
    monkeypatch.setattr(prompt_packs_module, "PromptPackDraftService", lambda _db: capture)

    with pytest.raises(HTTPException) as exc:
        await list_prompt_pack_drafts(
            owner_user_id=99,
            mine=False,
            limit=50,
            offset=0,
            current_user=_user(user_id=7, username="alice"),
            db=_DummyDB(),
        )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_create_draft_uses_authenticated_owner(monkeypatch: pytest.MonkeyPatch) -> None:
    capture = _ServiceCapture(draft=_draft(owner_user_id=42, namespace="user.42", pack_slug="starter-pack"))
    db = _DummyDB()
    monkeypatch.setattr(prompt_packs_module, "PromptPackDraftService", lambda _db: capture)

    result = await create_prompt_pack_draft(
        request=PromptPackDraftCreate(pack_slug="starter-pack", cue_source="pack: {}"),
        current_user=_user(user_id=42, username="owner"),
        db=db,
    )

    assert capture.create_calls[0]["owner_user_id"] == 42
    assert db.commit_calls == 1
    assert result.owner_user_id == 42
    assert result.owner_ref == "user:42"
    assert result.owner_username == "owner"


@pytest.mark.asyncio
async def test_get_draft_blocks_non_owner(monkeypatch: pytest.MonkeyPatch) -> None:
    capture = _ServiceCapture(draft=_draft(owner_user_id=8, namespace="user.8"))
    monkeypatch.setattr(prompt_packs_module, "PromptPackDraftService", lambda _db: capture)

    with pytest.raises(HTTPException) as exc:
        await get_prompt_pack_draft(
            draft_id=uuid4(),
            current_user=_user(user_id=7, username="alice"),
            db=_DummyDB(),
        )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_update_draft_requires_metadata_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    capture = _ServiceCapture()
    monkeypatch.setattr(prompt_packs_module, "PromptPackDraftService", lambda _db: capture)

    with pytest.raises(HTTPException) as exc:
        await update_prompt_pack_draft(
            draft_id=uuid4(),
            request=PromptPackDraftUpdate(),
            current_user=_user(user_id=7, username="alice"),
            db=_DummyDB(),
        )

    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_update_draft_writes_metadata_for_owner(monkeypatch: pytest.MonkeyPatch) -> None:
    capture = _ServiceCapture()
    db = _DummyDB()
    monkeypatch.setattr(prompt_packs_module, "PromptPackDraftService", lambda _db: capture)

    result = await update_prompt_pack_draft(
        draft_id=uuid4(),
        request=PromptPackDraftUpdate(
            namespace="user.7.tools",
            pack_slug="next-pack",
            status="compile_ok",
        ),
        current_user=_user(user_id=7, username="alice"),
        db=db,
    )

    assert db.commit_calls == 1
    assert capture.update_calls[0]["owner_user_id"] == 7
    assert capture.update_calls[0]["namespace"] == "user.7.tools"
    assert capture.update_calls[0]["pack_slug"] == "next-pack"
    assert capture.update_calls[0]["status"] == "compile_ok"
    assert result.namespace == "user.7.tools"
    assert result.pack_slug == "next-pack"
    assert result.status == "compile_ok"


@pytest.mark.asyncio
async def test_replace_source_resets_compile_state(monkeypatch: pytest.MonkeyPatch) -> None:
    base_draft = _draft()
    base_draft.status = "compile_ok"
    base_draft.last_compile_status = "compile_ok"
    base_draft.last_compile_errors = [{"code": "cue.old"}]
    base_draft.last_compiled_at = datetime.now(timezone.utc)

    capture = _ServiceCapture(draft=base_draft)
    db = _DummyDB()
    monkeypatch.setattr(prompt_packs_module, "PromptPackDraftService", lambda _db: capture)

    result = await replace_prompt_pack_draft_source(
        draft_id=uuid4(),
        request=PromptPackDraftSourceUpdate(cue_source="pack: {\n  package_name: \"x\"\n}"),
        current_user=_user(user_id=7, username="alice"),
        db=db,
    )

    assert db.commit_calls == 1
    assert capture.replace_source_calls[0]["cue_source"].startswith("pack:")
    assert result.status == "draft"
    assert result.last_compile_status is None
    assert result.last_compile_errors == []
    assert result.last_compiled_at is None


@pytest.mark.asyncio
async def test_validate_draft_persists_compile_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    draft_capture = _ServiceCapture()
    compile_capture = _CompileCapture(
        validate_result=SimpleNamespace(
            ok=False,
            status="compile_failed",
            diagnostics=[
                {
                    "code": "cue.syntax_error",
                    "message": "expected '}'",
                    "line": 4,
                    "column": 1,
                    "source": "draft.cue",
                    "severity": "error",
                }
            ],
            pack_yaml=None,
            manifest_yaml=None,
            pack_json=None,
            blocks_json=[],
        )
    )
    db = _DummyDB()

    monkeypatch.setattr(prompt_packs_module, "PromptPackDraftService", lambda _db: draft_capture)
    monkeypatch.setattr(prompt_packs_module, "PromptPackCompileService", lambda: compile_capture)

    result = await validate_prompt_pack_draft(
        draft_id=uuid4(),
        current_user=_user(user_id=7, username="alice"),
        db=db,
    )

    assert db.commit_calls == 1
    assert compile_capture.validate_calls[0]["namespace"] == "user.7"
    assert draft_capture.record_compile_calls[0]["status"] == "compile_failed"
    assert result.ok is False
    assert result.status == "compile_failed"
    assert result.diagnostics[0]["line"] == 4


@pytest.mark.asyncio
async def test_compile_draft_returns_artifacts(monkeypatch: pytest.MonkeyPatch) -> None:
    draft_capture = _ServiceCapture()
    compile_capture = _CompileCapture(
        compile_result=SimpleNamespace(
            ok=True,
            status="compile_ok",
            diagnostics=[],
            pack_yaml="version: 1.0.0\n",
            manifest_yaml="id: user.pack\n",
            pack_json={"version": "1.0.0", "blocks": [{"id": "pose"}]},
            blocks_json=[{"id": "pose"}],
        )
    )
    db = _DummyDB()

    monkeypatch.setattr(prompt_packs_module, "PromptPackDraftService", lambda _db: draft_capture)
    monkeypatch.setattr(prompt_packs_module, "PromptPackCompileService", lambda: compile_capture)

    result = await compile_prompt_pack_draft(
        draft_id=uuid4(),
        current_user=_user(user_id=7, username="alice"),
        db=db,
    )

    assert db.commit_calls == 1
    assert compile_capture.compile_calls[0]["cue_source"] == "pack: {}"
    assert draft_capture.record_compile_calls[0]["status"] == "compile_ok"
    assert result.ok is True
    assert result.pack_yaml == "version: 1.0.0\n"
    assert result.blocks_json == [{"id": "pose"}]


@pytest.mark.asyncio
async def test_validate_draft_blocks_non_owner(monkeypatch: pytest.MonkeyPatch) -> None:
    draft_capture = _ServiceCapture(draft=_draft(owner_user_id=8, namespace="user.8"))
    compile_capture = _CompileCapture()

    monkeypatch.setattr(prompt_packs_module, "PromptPackDraftService", lambda _db: draft_capture)
    monkeypatch.setattr(prompt_packs_module, "PromptPackCompileService", lambda: compile_capture)

    with pytest.raises(HTTPException) as exc:
        await validate_prompt_pack_draft(
            draft_id=uuid4(),
            current_user=_user(user_id=7, username="alice"),
            db=_DummyDB(),
        )

    assert exc.value.status_code == 403
    assert compile_capture.validate_calls == []


@pytest.mark.asyncio
async def test_create_version_from_compiled_draft(monkeypatch: pytest.MonkeyPatch) -> None:
    draft_obj = _draft()
    draft_obj.last_compile_status = "compile_ok"
    draft_capture = _ServiceCapture(draft=draft_obj)
    version_capture = _VersionServiceCapture(version=_version(draft_id=draft_obj.id, version=3))
    db = _DummyDB()

    monkeypatch.setattr(prompt_packs_module, "PromptPackDraftService", lambda _db: draft_capture)
    monkeypatch.setattr(prompt_packs_module, "PromptPackVersionService", lambda _db: version_capture)

    result = await create_prompt_pack_version(
        draft_id=uuid4(),
        current_user=_user(user_id=7, username="alice"),
        db=db,
    )

    assert db.commit_calls == 1
    assert len(version_capture.create_calls) == 1
    assert result.version == 3
    assert result.owner_user_id == 7
    assert result.owner_username == "alice"
    assert result.compiled_blocks_json == [{"id": "pose"}]


@pytest.mark.asyncio
async def test_create_version_surfaces_compile_diagnostics(monkeypatch: pytest.MonkeyPatch) -> None:
    draft_obj = _draft()
    draft_obj.last_compile_status = "compile_ok"
    draft_capture = _ServiceCapture(draft=draft_obj)
    version_capture = _VersionServiceCapture(
        raise_on_create=prompt_packs_module.PromptPackVersionError(
            "Compile failed while creating version",
            status_code=422,
            diagnostics=[{"code": "cue.syntax_error", "message": "expected '}'"}],
        )
    )

    monkeypatch.setattr(prompt_packs_module, "PromptPackDraftService", lambda _db: draft_capture)
    monkeypatch.setattr(prompt_packs_module, "PromptPackVersionService", lambda _db: version_capture)

    with pytest.raises(HTTPException) as exc:
        await create_prompt_pack_version(
            draft_id=uuid4(),
            current_user=_user(user_id=7, username="alice"),
            db=_DummyDB(),
        )

    assert exc.value.status_code == 422
    assert exc.value.detail["message"] == "Compile failed while creating version"
    assert exc.value.detail["diagnostics"][0]["code"] == "cue.syntax_error"


@pytest.mark.asyncio
async def test_list_versions_for_draft(monkeypatch: pytest.MonkeyPatch) -> None:
    draft_obj = _draft()
    draft_capture = _ServiceCapture(draft=draft_obj)
    version_capture = _VersionServiceCapture(version=_version(draft_id=draft_obj.id, version=2))

    monkeypatch.setattr(prompt_packs_module, "PromptPackDraftService", lambda _db: draft_capture)
    monkeypatch.setattr(prompt_packs_module, "PromptPackVersionService", lambda _db: version_capture)

    result = await list_prompt_pack_versions(
        draft_id=uuid4(),
        limit=25,
        offset=5,
        current_user=_user(user_id=7, username="alice"),
        db=_DummyDB(),
    )

    assert version_capture.list_calls[0]["draft_id"] == draft_obj.id
    assert version_capture.list_calls[0]["limit"] == 25
    assert version_capture.list_calls[0]["offset"] == 5
    assert result[0].version == 2


@pytest.mark.asyncio
async def test_get_version_blocks_non_owner(monkeypatch: pytest.MonkeyPatch) -> None:
    draft_obj = _draft(owner_user_id=8, namespace="user.8")
    draft_capture = _ServiceCapture(draft=draft_obj)
    version_capture = _VersionServiceCapture(version=_version(draft_id=draft_obj.id, version=1))

    monkeypatch.setattr(prompt_packs_module, "PromptPackDraftService", lambda _db: draft_capture)
    monkeypatch.setattr(prompt_packs_module, "PromptPackVersionService", lambda _db: version_capture)

    with pytest.raises(HTTPException) as exc:
        await get_prompt_pack_version(
            version_id=uuid4(),
            current_user=_user(user_id=7, username="alice"),
            db=_DummyDB(),
        )

    assert exc.value.status_code == 403
