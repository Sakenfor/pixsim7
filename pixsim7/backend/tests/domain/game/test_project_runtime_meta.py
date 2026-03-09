from __future__ import annotations

from pixsim7.backend.main.domain.game.project_runtime_meta import (
    LEGACY_BANANZA_META_SEEDER_MODE,
    LEGACY_BANANZA_META_SYNC_MODE,
    LEGACY_BANANZA_META_WATCH_ENABLED,
    LEGACY_BANANZA_RUNTIME_META_KEY,
    PROJECT_META_RUNTIME_MODE,
    PROJECT_META_SYNC_MODE,
    PROJECT_META_WATCH_ENABLED,
    PROJECT_RUNTIME_META_KEY,
    canonicalize_project_runtime_meta,
    read_project_runtime_preferences,
)


def test_canonicalize_project_runtime_meta_migrates_legacy_keys() -> None:
    raw = {
        LEGACY_BANANZA_RUNTIME_META_KEY: {
            "seeder_mode": "direct",
            "sync_mode": "file_to_backend",
            "watch_enabled": False,
        },
        LEGACY_BANANZA_META_SEEDER_MODE: "api",
        LEGACY_BANANZA_META_SYNC_MODE: "none",
        LEGACY_BANANZA_META_WATCH_ENABLED: True,
    }

    canonical = canonicalize_project_runtime_meta(raw)

    assert canonical[PROJECT_RUNTIME_META_KEY] == {
        "mode": "direct",
        "sync_mode": "file_to_backend",
        "watch_enabled": False,
    }
    assert canonical[PROJECT_META_RUNTIME_MODE] == "direct"
    assert canonical[PROJECT_META_SYNC_MODE] == "file_to_backend"
    assert canonical[PROJECT_META_WATCH_ENABLED] is False
    assert LEGACY_BANANZA_RUNTIME_META_KEY not in canonical
    assert LEGACY_BANANZA_META_SEEDER_MODE not in canonical
    assert LEGACY_BANANZA_META_SYNC_MODE not in canonical
    assert LEGACY_BANANZA_META_WATCH_ENABLED not in canonical


def test_canonicalize_project_runtime_meta_is_idempotent_and_conflict_free() -> None:
    raw = {
        PROJECT_RUNTIME_META_KEY: {"mode": "api", "sync_mode": "two_way", "watch_enabled": True},
        LEGACY_BANANZA_META_SEEDER_MODE: "direct",
        LEGACY_BANANZA_META_SYNC_MODE: "none",
        LEGACY_BANANZA_META_WATCH_ENABLED: False,
    }

    first = canonicalize_project_runtime_meta(raw)
    second = canonicalize_project_runtime_meta(first)

    assert first == second
    assert second[PROJECT_RUNTIME_META_KEY]["mode"] == "api"
    assert second[PROJECT_RUNTIME_META_KEY]["sync_mode"] == "two_way"
    assert second[PROJECT_RUNTIME_META_KEY]["watch_enabled"] is True
    assert LEGACY_BANANZA_META_SEEDER_MODE not in second
    assert LEGACY_BANANZA_META_SYNC_MODE not in second
    assert LEGACY_BANANZA_META_WATCH_ENABLED not in second


def test_read_project_runtime_preferences_reads_canonicalized_values() -> None:
    prefs = read_project_runtime_preferences(
        {
            LEGACY_BANANZA_RUNTIME_META_KEY: {
                "seeder_mode": "direct",
                "sync_mode": "none",
                "watch_enabled": False,
            }
        }
    )

    assert prefs == {"mode": "direct", "sync_mode": "none", "watch": False}
