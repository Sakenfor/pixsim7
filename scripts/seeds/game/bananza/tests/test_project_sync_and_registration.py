from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import httpx
import pytest

from scripts.seeds.game.bananza.flows import api_flow
from scripts.seeds.game.bananza.seed_data import BOOTSTRAP_PROFILE, BOOTSTRAP_SOURCE_KEY

TEST_SUITE = {
    "id": "bananza-project-sync",
    "label": "Bananza Project Sync Tests",
    "kind": "integration",
    "category": "scripts/bananza",
    "subcategory": "sync-registration",
    "covers": ["scripts/seeds/game/bananza/cli.py", "pixsim7/backend/main/shared/extension_contract.py"],
    "order": 52,
}


class _FakeAsyncClient:
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        pass

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> bool:
        return False


class _FakeDeleteClient:
    def __init__(self) -> None:
        self.deleted_paths: list[str] = []

    async def delete(self, path: str) -> httpx.Response:
        self.deleted_paths.append(path)
        return httpx.Response(204, request=httpx.Request("DELETE", f"http://localhost{path}"))


def _project_file_payload(bundle: Dict[str, Any], *, updated_at: str) -> Dict[str, Any]:
    return {
        "schema_version": 1,
        "synced_at": "2026-03-05T00:00:00+00:00",
        "project": {
            "id": 10,
            "name": "Bananza Boat Seed Project",
            "source_world_id": 55,
            "updated_at": updated_at,
            "schema_version": 1,
            "provenance": {},
        },
        "bundle": bundle,
    }


@pytest.mark.asyncio
async def test_api_upsert_project_snapshot_sets_bootstrap_provenance_only_on_create(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_body: Dict[str, Any] = {}

    async def fake_get_json(client: Any, path: str, **kwargs: Any) -> Any:
        if path.endswith("/project/export"):
            return {"schema_version": 1, "core": {"world": {"name": "Bananza Boat", "meta": {}, "world_time": 0.0}}}
        if path == "/api/v1/game/worlds/projects/snapshots":
            return []
        raise AssertionError(f"unexpected path: {path}")

    async def fake_post_json(client: Any, path: str, *, body: Dict[str, Any] | None = None, **kwargs: Any) -> Any:
        assert path == "/api/v1/game/worlds/projects/snapshots"
        captured_body.update(body or {})
        return {"id": 101, "name": "Bananza Boat Seed Project", "source_world_id": 55}

    monkeypatch.setattr(api_flow, "_api_get_json", fake_get_json)
    monkeypatch.setattr(api_flow, "_api_post_json", fake_post_json)

    await api_flow._api_upsert_project_snapshot(
        object(),
        world_id=55,
        world_name="Bananza Boat",
        project_name="Bananza Boat Seed Project",
        project_id=None,
        prune_duplicates=False,
    )

    assert captured_body.get("overwrite_project_id") is None
    provenance = captured_body.get("provenance")
    assert isinstance(provenance, dict)
    assert provenance.get("kind") == "import"
    assert provenance.get("source_key") == BOOTSTRAP_SOURCE_KEY
    meta = provenance.get("meta") if isinstance(provenance.get("meta"), dict) else {}
    assert meta.get("bootstrap_profile") == BOOTSTRAP_PROFILE


@pytest.mark.asyncio
async def test_api_upsert_project_snapshot_uses_overwrite_without_provenance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_body: Dict[str, Any] = {}

    async def fake_get_json(client: Any, path: str, **kwargs: Any) -> Any:
        if path.endswith("/project/export"):
            return {"schema_version": 1, "core": {"world": {"name": "Bananza Boat", "meta": {}, "world_time": 0.0}}}
        if path == "/api/v1/game/worlds/projects/snapshots":
            return [
                {"id": 30, "name": "Bananza Boat Seed Project", "updated_at": "2026-03-05T10:00:00+00:00"},
                {"id": 29, "name": "Bananza Boat Seed Project", "updated_at": "2026-03-05T09:00:00+00:00"},
            ]
        raise AssertionError(f"unexpected path: {path}")

    async def fake_post_json(client: Any, path: str, *, body: Dict[str, Any] | None = None, **kwargs: Any) -> Any:
        assert path == "/api/v1/game/worlds/projects/snapshots"
        captured_body.update(body or {})
        return {"id": 30, "name": "Bananza Boat Seed Project", "source_world_id": 55}

    monkeypatch.setattr(api_flow, "_api_get_json", fake_get_json)
    monkeypatch.setattr(api_flow, "_api_post_json", fake_post_json)

    await api_flow._api_upsert_project_snapshot(
        object(),
        world_id=55,
        world_name="Bananza Boat",
        project_name="Bananza Boat Seed Project",
        project_id=None,
        prune_duplicates=False,
    )

    assert captured_body.get("overwrite_project_id") == 30
    assert "provenance" not in captured_body


@pytest.mark.asyncio
async def test_api_upsert_project_snapshot_migrates_legacy_seed_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_body: Dict[str, Any] = {}

    async def fake_get_json(client: Any, path: str, **kwargs: Any) -> Any:
        if path.endswith("/project/export"):
            return {"schema_version": 1, "core": {"world": {"name": "Bananza Boat", "meta": {}, "world_time": 0.0}}}
        if path == "/api/v1/game/worlds/projects/snapshots":
            return [
                {
                    "id": 30,
                    "name": "Bananza Boat Seed Project",
                    "updated_at": "2026-03-05T10:00:00+00:00",
                    "provenance": {"kind": "seed", "source_key": BOOTSTRAP_PROFILE},
                },
                {
                    "id": 29,
                    "name": "Bananza Boat Seed Project",
                    "updated_at": "2026-03-05T09:00:00+00:00",
                    "provenance": {"kind": "seed", "source_key": BOOTSTRAP_PROFILE},
                },
            ]
        raise AssertionError(f"unexpected path: {path}")

    async def fake_post_json(client: Any, path: str, *, body: Dict[str, Any] | None = None, **kwargs: Any) -> Any:
        assert path == "/api/v1/game/worlds/projects/snapshots"
        captured_body.update(body or {})
        return {"id": 31, "name": "Bananza Boat Seed Project", "source_world_id": 55}

    monkeypatch.setattr(api_flow, "_api_get_json", fake_get_json)
    monkeypatch.setattr(api_flow, "_api_post_json", fake_post_json)

    client = _FakeDeleteClient()
    result = await api_flow._api_upsert_project_snapshot(
        client,
        world_id=55,
        world_name="Bananza Boat",
        project_name="Bananza Boat Seed Project",
        project_id=None,
        prune_duplicates=True,
    )

    assert "overwrite_project_id" not in captured_body
    assert captured_body.get("provenance", {}).get("kind") == "import"
    assert result["migrated_from_legacy_seed"] is True
    assert client.deleted_paths == [
        "/api/v1/game/worlds/projects/snapshots/30",
        "/api/v1/game/worlds/projects/snapshots/29",
    ]


@pytest.mark.asyncio
async def test_api_upsert_project_snapshot_prefers_non_legacy_even_when_legacy_is_newer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_body: Dict[str, Any] = {}

    async def fake_get_json(client: Any, path: str, **kwargs: Any) -> Any:
        if path.endswith("/project/export"):
            return {"schema_version": 1, "core": {"world": {"name": "Bananza Boat", "meta": {}, "world_time": 0.0}}}
        if path == "/api/v1/game/worlds/projects/snapshots":
            return [
                {
                    "id": 40,
                    "name": "Bananza Boat Seed Project",
                    "updated_at": "2026-03-05T10:00:00+00:00",
                    "provenance": {"kind": "seed", "source_key": BOOTSTRAP_PROFILE},
                },
                {
                    "id": 31,
                    "name": "Bananza Boat Seed Project",
                    "updated_at": "2026-03-05T09:00:00+00:00",
                    "provenance": {"kind": "import", "source_key": BOOTSTRAP_SOURCE_KEY},
                },
            ]
        raise AssertionError(f"unexpected path: {path}")

    async def fake_post_json(client: Any, path: str, *, body: Dict[str, Any] | None = None, **kwargs: Any) -> Any:
        assert path == "/api/v1/game/worlds/projects/snapshots"
        captured_body.update(body or {})
        return {"id": 31, "name": "Bananza Boat Seed Project", "source_world_id": 55}

    monkeypatch.setattr(api_flow, "_api_get_json", fake_get_json)
    monkeypatch.setattr(api_flow, "_api_post_json", fake_post_json)

    client = _FakeDeleteClient()
    result = await api_flow._api_upsert_project_snapshot(
        client,
        world_id=55,
        world_name="Bananza Boat",
        project_name="Bananza Boat Seed Project",
        project_id=None,
        prune_duplicates=True,
    )

    assert captured_body.get("overwrite_project_id") == 31
    assert "provenance" not in captured_body
    assert result["migrated_from_legacy_seed"] is False
    assert client.deleted_paths == ["/api/v1/game/worlds/projects/snapshots/40"]


@pytest.mark.asyncio
async def test_api_find_project_snapshot_detail_prefers_non_legacy_when_names_collide(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_project_id: Dict[str, int] = {}

    async def fake_get_json(client: Any, path: str, **kwargs: Any) -> Any:
        assert path == "/api/v1/game/worlds/projects/snapshots"
        return [
            {
                "id": 200,
                "name": "Bananza Boat Seed Project",
                "updated_at": "2026-03-06T11:00:00+00:00",
                "provenance": {"kind": "seed", "source_key": BOOTSTRAP_PROFILE},
            },
            {
                "id": 150,
                "name": "Bananza Boat Seed Project",
                "updated_at": "2026-03-05T10:00:00+00:00",
                "provenance": {"kind": "import", "source_key": BOOTSTRAP_SOURCE_KEY},
            },
        ]

    async def fake_get_saved_project_detail(client: Any, *, project_id: int) -> Dict[str, Any]:
        captured_project_id["value"] = project_id
        return {"id": project_id, "name": "Bananza Boat Seed Project"}

    monkeypatch.setattr(api_flow, "_api_get_json", fake_get_json)
    monkeypatch.setattr(api_flow, "_api_get_saved_project_detail", fake_get_saved_project_detail)

    result = await api_flow._api_find_project_snapshot_detail(
        object(),
        project_name="Bananza Boat Seed Project",
        project_id=None,
    )

    assert captured_project_id["value"] == 150
    assert isinstance(result, dict)
    assert result["id"] == 150


@pytest.mark.asyncio
async def test_resolve_auth_token_accepts_pixsim_api_token_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FailAsyncClient:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            raise AssertionError("unexpected login request")

    monkeypatch.delenv("PIXSIM_AUTH_TOKEN", raising=False)
    monkeypatch.setenv("PIXSIM_API_TOKEN", "api-token-value")
    monkeypatch.setattr(api_flow.httpx, "AsyncClient", _FailAsyncClient)

    token = await api_flow._resolve_auth_token(
        api_base="http://localhost:8000",
        explicit_token=None,
        username="admin",
        password="admin",
    )

    assert token == "api-token-value"


@pytest.mark.asyncio
async def test_resolve_auth_token_prefers_pixsim_auth_token_over_api_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PIXSIM_AUTH_TOKEN", "auth-token-value")
    monkeypatch.setenv("PIXSIM_API_TOKEN", "api-token-value")

    token = await api_flow._resolve_auth_token(
        api_base="http://localhost:8000",
        explicit_token=None,
        username="admin",
        password="admin",
    )

    assert token == "auth-token-value"


@pytest.mark.asyncio
async def test_api_ensure_world_prefers_snapshot_world_when_names_collide(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fetched_paths: list[str] = []
    updated_paths: list[str] = []
    updated_meta: Dict[str, Any] = {}

    async def fake_find_project_snapshot_detail(
        client: Any,
        *,
        project_name: str,
        project_id: Any = None,
    ) -> Dict[str, Any]:
        assert project_name == "Bananza Boat Seed Project"
        assert project_id is None
        return {"id": 150, "source_world_id": 22}

    async def fake_get_json(client: Any, path: str, **kwargs: Any) -> Any:
        if path == "/api/v1/game/worlds":
            return {
                "worlds": [
                    {"id": 11, "name": "Bananza Boat"},
                    {"id": 22, "name": "Bananza Boat"},
                ]
            }
        fetched_paths.append(path)
        if path == "/api/v1/game/worlds/22":
            return {"id": 22, "name": "Bananza Boat", "meta": {"existing": True}}
        raise AssertionError(f"unexpected path: {path}")

    async def fake_put_json(client: Any, path: str, *, body: Dict[str, Any] | None = None, **kwargs: Any) -> Any:
        updated_paths.append(path)
        updated_meta.clear()
        updated_meta.update((body or {}).get("meta") or {})
        return {"id": 22, "name": "Bananza Boat", "meta": (body or {}).get("meta") or {}}

    async def fail_post_json(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("unexpected create world call")

    monkeypatch.setattr(api_flow, "_api_find_project_snapshot_detail", fake_find_project_snapshot_detail)
    monkeypatch.setattr(api_flow, "_api_get_json", fake_get_json)
    monkeypatch.setattr(api_flow, "_api_put_json", fake_put_json)
    monkeypatch.setattr(api_flow, "_api_post_json", fail_post_json)

    result = await api_flow._api_ensure_world(
        object(),
        world_name="Bananza Boat",
        project_name="Bananza Boat Seed Project",
        project_id=None,
    )

    assert result["id"] == 22
    assert fetched_paths == ["/api/v1/game/worlds/22"]
    assert updated_paths == ["/api/v1/game/worlds/22/meta"]
    assert updated_meta.get("project_world_upsert_key") == f"{BOOTSTRAP_SOURCE_KEY}:world:Bananza Boat"


@pytest.mark.asyncio
async def test_api_ensure_world_creates_when_snapshot_world_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fetched_paths: list[str] = []
    created_body: Dict[str, Any] = {}

    async def fake_find_project_snapshot_detail(
        client: Any,
        *,
        project_name: str,
        project_id: Any = None,
    ) -> Dict[str, Any]:
        assert project_name == "Bananza Boat Seed Project"
        assert project_id is None
        return {"id": 150, "source_world_id": 999}

    async def fake_get_json(client: Any, path: str, **kwargs: Any) -> Any:
        if path == "/api/v1/game/worlds":
            return {"worlds": []}
        fetched_paths.append(path)
        if path == "/api/v1/game/worlds/999":
            raise RuntimeError("get_world: HTTP 404 {'detail': 'Not Found'}")
        raise AssertionError(f"unexpected path: {path}")

    async def fake_post_json(client: Any, path: str, *, body: Dict[str, Any] | None = None, **kwargs: Any) -> Any:
        assert path == "/api/v1/game/worlds"
        created_body.update(body or {})
        return {"id": 77, "name": "Bananza Boat", "meta": created_body.get("meta") or {}}

    async def fail_put_json(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("unexpected meta update call")

    monkeypatch.setattr(api_flow, "_api_find_project_snapshot_detail", fake_find_project_snapshot_detail)
    monkeypatch.setattr(api_flow, "_api_get_json", fake_get_json)
    monkeypatch.setattr(api_flow, "_api_post_json", fake_post_json)
    monkeypatch.setattr(api_flow, "_api_put_json", fail_put_json)

    result = await api_flow._api_ensure_world(
        object(),
        world_name="Bananza Boat",
        project_name="Bananza Boat Seed Project",
        project_id=None,
    )

    assert result["id"] == 77
    assert fetched_paths == ["/api/v1/game/worlds/999"]
    assert created_body.get("name") == "Bananza Boat"
    assert created_body.get("upsert_key") == f"{BOOTSTRAP_SOURCE_KEY}:world:Bananza Boat"
    bootstrap = created_body.get("meta", {}).get("bootstrap")
    assert isinstance(bootstrap, dict)
    assert bootstrap.get("source") == BOOTSTRAP_SOURCE_KEY
    assert (
        created_body.get("meta", {}).get("project_world_upsert_key")
        == f"{BOOTSTRAP_SOURCE_KEY}:world:Bananza Boat"
    )


@pytest.mark.asyncio
async def test_sync_two_way_pushes_file_when_file_mtime_is_newer(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    project_file = tmp_path / "bananza-project.json"
    file_bundle = {"schema_version": 1, "core": {"world": {"name": "file", "meta": {}, "world_time": 0.0}}}
    with open(project_file, "w", encoding="utf-8") as fh:
        json.dump(_project_file_payload(file_bundle, updated_at="2026-03-05T08:00:00+00:00"), fh)
    os.utime(project_file, (datetime(2026, 3, 5, 12, 0, tzinfo=timezone.utc).timestamp(),) * 2)

    backend_snapshot = {
        "id": 44,
        "name": "Bananza Boat Seed Project",
        "source_world_id": 55,
        "updated_at": "2026-03-05T10:00:00+00:00",
        "schema_version": 1,
        "provenance": {},
        "bundle": {"schema_version": 1, "core": {"world": {"name": "backend", "meta": {}, "world_time": 0.0}}},
    }

    captured_push_body: Dict[str, Any] = {}

    async def fake_resolve_auth_token(**kwargs: Any) -> str:
        return "token"

    async def fake_find_snapshot(*args: Any, **kwargs: Any) -> Dict[str, Any]:
        return backend_snapshot

    async def fake_post_json(client: Any, path: str, *, body: Dict[str, Any] | None = None, **kwargs: Any) -> Any:
        assert path == "/api/v1/game/worlds/projects/snapshots"
        captured_push_body.update(body or {})
        return {"id": 44}

    async def fake_get_saved_project_detail(*args: Any, **kwargs: Any) -> Dict[str, Any]:
        return {
            **backend_snapshot,
            "bundle": file_bundle,
            "updated_at": "2026-03-05T12:00:01+00:00",
        }

    monkeypatch.setattr(api_flow, "_resolve_auth_token", fake_resolve_auth_token)
    monkeypatch.setattr(api_flow.httpx, "AsyncClient", _FakeAsyncClient)
    monkeypatch.setattr(api_flow, "_api_find_project_snapshot_detail", fake_find_snapshot)
    monkeypatch.setattr(api_flow, "_api_post_json", fake_post_json)
    monkeypatch.setattr(api_flow, "_api_get_saved_project_detail", fake_get_saved_project_detail)

    result = await api_flow.sync_project_snapshot_file_via_api(
        api_base="http://localhost:8000",
        auth_token=None,
        username="admin",
        password="admin",
        project_name="Bananza Boat Seed Project",
        project_file=str(project_file),
        sync_mode="two_way",
    )

    assert result["action"] == "pushed"
    assert captured_push_body.get("overwrite_project_id") == 44
    assert captured_push_body.get("bundle") == file_bundle


@pytest.mark.asyncio
async def test_sync_two_way_pulls_backend_when_backend_is_newer(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    project_file = tmp_path / "bananza-project.json"
    stale_file_bundle = {"schema_version": 1, "core": {"world": {"name": "file", "meta": {}, "world_time": 0.0}}}
    with open(project_file, "w", encoding="utf-8") as fh:
        json.dump(_project_file_payload(stale_file_bundle, updated_at="2026-03-05T08:00:00+00:00"), fh)
    os.utime(project_file, (datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc).timestamp(),) * 2)

    backend_bundle = {"schema_version": 1, "core": {"world": {"name": "backend", "meta": {}, "world_time": 0.0}}}
    backend_snapshot = {
        "id": 44,
        "name": "Bananza Boat Seed Project",
        "source_world_id": 55,
        "updated_at": "2026-03-05T11:00:00+00:00",
        "schema_version": 1,
        "provenance": {},
        "bundle": backend_bundle,
    }

    async def fake_resolve_auth_token(**kwargs: Any) -> str:
        return "token"

    async def fake_find_snapshot(*args: Any, **kwargs: Any) -> Dict[str, Any]:
        return backend_snapshot

    async def fail_post_json(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("unexpected push call")

    monkeypatch.setattr(api_flow, "_resolve_auth_token", fake_resolve_auth_token)
    monkeypatch.setattr(api_flow.httpx, "AsyncClient", _FakeAsyncClient)
    monkeypatch.setattr(api_flow, "_api_find_project_snapshot_detail", fake_find_snapshot)
    monkeypatch.setattr(api_flow, "_api_post_json", fail_post_json)

    result = await api_flow.sync_project_snapshot_file_via_api(
        api_base="http://localhost:8000",
        auth_token=None,
        username="admin",
        password="admin",
        project_name="Bananza Boat Seed Project",
        project_file=str(project_file),
        sync_mode="two_way",
    )

    assert result["action"] == "pulled"
    backup_file = project_file.with_suffix(".json.bak")
    assert result.get("backup_file") == str(backup_file)
    assert backup_file.exists()
    with open(backup_file, "r", encoding="utf-8") as fh:
        backup_payload = json.load(fh)
    assert backup_payload["bundle"] == stale_file_bundle

    with open(project_file, "r", encoding="utf-8") as fh:
        written = json.load(fh)
    assert written["bundle"] == backend_bundle
    assert written["project"]["id"] == 44


@pytest.mark.asyncio
async def test_api_verify_required_blocks_rejects_unregistered_source_pack(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(api_flow, "REQUIRED_BLOCK_IDS", ["custom.example.block"])
    monkeypatch.setattr(api_flow, "expected_source_pack_for_block_id", lambda _bid: None)

    async def fake_get_json(client: Any, path: str, **kwargs: Any) -> Any:
        assert path == "/api/v1/block-templates/meta/blocks/catalog"
        return [{"block_id": "custom.example.block", "tags": {"source_pack": "implicit_custom_pack"}}]

    monkeypatch.setattr(api_flow, "_api_get_json", fake_get_json)

    with pytest.raises(RuntimeError, match="not explicitly registered"):
        await api_flow._api_verify_required_blocks(object())


@pytest.mark.asyncio
async def test_api_verify_required_templates_rejects_unregistered_template_pack(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(api_flow, "REQUIRED_TEMPLATE_SLUGS", ["custom-template-slug"])

    async def fake_get_json(client: Any, path: str, **kwargs: Any) -> Any:
        assert path == "/api/v1/block-templates/by-slug/custom-template-slug"
        return {"slug": "custom-template-slug", "package_name": "implicit_template_pack"}

    monkeypatch.setattr(api_flow, "_api_get_json", fake_get_json)

    with pytest.raises(RuntimeError, match="not explicitly registered"):
        await api_flow._api_verify_required_templates(object())
