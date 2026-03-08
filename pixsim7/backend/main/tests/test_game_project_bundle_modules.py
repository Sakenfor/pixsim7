from __future__ import annotations

from pixsim7.backend.main.domain.game.schemas.project_bundle import GameProjectBundle


def _minimal_core() -> dict:
    return {
        "world": {
            "name": "Bundle World",
            "meta": {},
            "world_time": 0.0,
        }
    }


def test_bundle_without_modules_remains_valid() -> None:
    payload = {
        "schema_version": 1,
        "exported_at": "2026-03-08T00:00:00Z",
        "core": _minimal_core(),
        "extensions": {},
    }

    bundle = GameProjectBundle.model_validate(payload)
    assert bundle.modules == []


def test_bundle_modules_accept_canonical_and_legacy_ids() -> None:
    payload = {
        "schema_version": 1,
        "exported_at": "2026-03-08T00:00:00Z",
        "core": _minimal_core(),
        "modules": [
            {
                "id": "plugin:user.stefan/mask-tool@0.1.0",
                "enabled": True,
                "capabilities": ["mask.detect"],
            },
            {
                "id": "legacy_mask_tool",
                "enabled": False,
            },
        ],
        "extensions": {},
    }

    bundle = GameProjectBundle.model_validate(payload)
    assert bundle.modules[0].id == "plugin:user.stefan/mask-tool@0.1.0"
    assert bundle.modules[1].id == "legacy_mask_tool"
    dumped = bundle.model_dump(mode="json")
    assert len(dumped["modules"]) == 2


def test_bundle_migrates_legacy_modules_from_extensions() -> None:
    payload = {
        "schema_version": 1,
        "exported_at": "2026-03-08T00:00:00Z",
        "core": _minimal_core(),
        "extensions": {
            "modules": [
                {
                    "id": "plugin:core.pixsim/world-basics@1.0.0",
                    "enabled": True,
                }
            ]
        },
    }

    bundle = GameProjectBundle.model_validate(payload)
    assert len(bundle.modules) == 1
    assert bundle.modules[0].id == "plugin:core.pixsim/world-basics@1.0.0"
