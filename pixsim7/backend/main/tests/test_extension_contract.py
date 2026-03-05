from __future__ import annotations

import pytest

from pixsim7.backend.main.shared.extension_contract import (
    ExtensionIdentity,
    ExtensionLifecycleStatus,
    build_extension_identity,
    can_approve_lifecycle,
    can_publish_lifecycle,
    can_submit_lifecycle,
    is_canonical_extension_id,
    is_editable_lifecycle,
    parse_extension_identity,
)


def test_parse_canonical_extension_id_with_version() -> None:
    parsed = parse_extension_identity(
        "plugin:user.stefan/camera-toolkit@0.1.0",
        expected_kind="plugin",
    )
    assert parsed.kind == "plugin"
    assert parsed.scope == "user"
    assert parsed.owner == "stefan"
    assert parsed.name == "camera-toolkit"
    assert parsed.version == "0.1.0"
    assert parsed.canonical is True
    assert parsed.key == "plugin:user.stefan/camera-toolkit"


def test_parse_canonical_extension_id_without_version() -> None:
    parsed = parse_extension_identity("analyzer:core.pixsim/object-detection")
    assert parsed.kind == "analyzer"
    assert parsed.scope == "core"
    assert parsed.owner == "pixsim"
    assert parsed.name == "object-detection"
    assert parsed.version is None


def test_parse_canonical_kind_mismatch_raises() -> None:
    with pytest.raises(ValueError, match="kind mismatch"):
        parse_extension_identity(
            "analyzer:core.pixsim/object-detection",
            expected_kind="plugin",
        )


def test_canonical_detection() -> None:
    assert is_canonical_extension_id("plugin:user.stefan/camera-toolkit@0.1.0")
    assert not is_canonical_extension_id("scene-view:comic-panels")


def test_parse_legacy_with_expected_kind() -> None:
    parsed = parse_extension_identity(
        "scene-view:comic-panels",
        expected_kind="plugin",
        allow_legacy=True,
    )
    assert parsed.kind == "plugin"
    assert parsed.scope == "legacy"
    assert parsed.owner == "legacy"
    assert parsed.name == "scene-view:comic-panels"
    assert parsed.canonical is False


def test_parse_legacy_with_inferred_kind_prefix() -> None:
    parsed = parse_extension_identity(
        "plugin:scene-view:comic-panels",
        allow_legacy=True,
    )
    assert parsed.kind == "plugin"
    assert parsed.name == "scene-view:comic-panels"
    assert parsed.canonical is False


def test_build_extension_identity_canonical() -> None:
    identity = ExtensionIdentity(
        kind="plugin",
        scope="user",
        owner="stefan",
        name="camera-toolkit",
        version="0.1.0",
        canonical=True,
    )
    assert build_extension_identity(identity) == "plugin:user.stefan/camera-toolkit@0.1.0"


def test_build_extension_identity_legacy_prefers_raw() -> None:
    identity = ExtensionIdentity(
        kind="plugin",
        scope="legacy",
        owner="legacy",
        name="scene-view:comic-panels",
        canonical=False,
        raw="scene-view:comic-panels",
    )
    assert build_extension_identity(identity) == "scene-view:comic-panels"


def test_lifecycle_helpers() -> None:
    assert is_editable_lifecycle(ExtensionLifecycleStatus.DRAFT)
    assert is_editable_lifecycle("rejected")
    assert not is_editable_lifecycle("approved")

    assert can_submit_lifecycle("draft")
    assert can_submit_lifecycle("rejected")
    assert not can_submit_lifecycle("submitted")

    assert can_approve_lifecycle("submitted")
    assert not can_approve_lifecycle("draft")

    assert can_publish_lifecycle("approved")
    assert not can_publish_lifecycle("submitted")


def test_parse_empty_extension_id_raises() -> None:
    with pytest.raises(ValueError, match="cannot be empty"):
        parse_extension_identity("")
