"""Tests for the data-driven op-signature registry loader and validation."""
from __future__ import annotations

import shutil
import textwrap
from pathlib import Path
from uuid import uuid4

import pytest
import yaml

from pixsim7.backend.main.services.prompt.block.op_signatures import (
    OpSignature,
    OpSignatureRegistryError,
    _load_registry,
    _REGISTRY_PATH,
    get_op_signature,
    list_op_signatures,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tmp_registry(content: str) -> Path:
    """Write *content* into a temp YAML file and return its path."""
    root = Path.cwd() / ".tmp-test" / "op-sig-registry" / str(uuid4())
    root.mkdir(parents=True, exist_ok=True)
    path = root / "registry.yaml"
    path.write_text(textwrap.dedent(content), encoding="utf-8")
    return path


def _cleanup(path: Path) -> None:
    top = path
    while top.name != ".tmp-test" and top.parent != top:
        top = top.parent
    shutil.rmtree(top, ignore_errors=True)


# ---------------------------------------------------------------------------
# Registry file validation tests
# ---------------------------------------------------------------------------

class TestRegistryLoaderValidation:
    """Negative-path tests: malformed YAML triggers clear errors."""

    def test_missing_file(self, tmp_path: Path) -> None:
        with pytest.raises(OpSignatureRegistryError, match="not found"):
            _load_registry(tmp_path / "missing.yaml")

    def test_missing_signatures_key(self) -> None:
        path = _tmp_registry("foo: bar\n")
        try:
            with pytest.raises(OpSignatureRegistryError, match="'signatures' key"):
                _load_registry(path)
        finally:
            _cleanup(path)

    def test_signatures_not_a_list(self) -> None:
        path = _tmp_registry("signatures: not_a_list\n")
        try:
            with pytest.raises(OpSignatureRegistryError, match="must be a list"):
                _load_registry(path)
        finally:
            _cleanup(path)

    def test_entry_not_a_mapping(self) -> None:
        path = _tmp_registry("signatures:\n  - just_a_string\n")
        try:
            with pytest.raises(OpSignatureRegistryError, match="expected a mapping"):
                _load_registry(path)
        finally:
            _cleanup(path)

    def test_missing_required_field_id(self) -> None:
        path = _tmp_registry("""\
            signatures:
              - op_id_prefix: "test."
        """)
        try:
            with pytest.raises(OpSignatureRegistryError, match="missing required field 'id'"):
                _load_registry(path)
        finally:
            _cleanup(path)

    def test_missing_required_field_prefix(self) -> None:
        path = _tmp_registry("""\
            signatures:
              - id: test.v1
        """)
        try:
            with pytest.raises(OpSignatureRegistryError, match="missing required field 'op_id_prefix'"):
                _load_registry(path)
        finally:
            _cleanup(path)

    def test_empty_id(self) -> None:
        path = _tmp_registry("""\
            signatures:
              - id: "  "
                op_id_prefix: "x."
        """)
        try:
            with pytest.raises(OpSignatureRegistryError, match="non-empty string"):
                _load_registry(path)
        finally:
            _cleanup(path)

    def test_empty_prefix(self) -> None:
        path = _tmp_registry("""\
            signatures:
              - id: test.v1
                op_id_prefix: ""
        """)
        try:
            with pytest.raises(OpSignatureRegistryError, match="non-empty string"):
                _load_registry(path)
        finally:
            _cleanup(path)

    def test_duplicate_ids(self) -> None:
        path = _tmp_registry("""\
            signatures:
              - id: dupe.v1
                op_id_prefix: "dupe."
              - id: dupe.v1
                op_id_prefix: "dupe2."
        """)
        try:
            with pytest.raises(OpSignatureRegistryError, match="duplicate id 'dupe.v1'"):
                _load_registry(path)
        finally:
            _cleanup(path)

    def test_requires_variant_template_wrong_type(self) -> None:
        path = _tmp_registry("""\
            signatures:
              - id: test.v1
                op_id_prefix: "test."
                requires_variant_template: "yes"
        """)
        try:
            with pytest.raises(OpSignatureRegistryError, match="must be a boolean"):
                _load_registry(path)
        finally:
            _cleanup(path)

    def test_required_params_not_a_list(self) -> None:
        path = _tmp_registry("""\
            signatures:
              - id: test.v1
                op_id_prefix: "test."
                required_params: "speed"
        """)
        try:
            with pytest.raises(OpSignatureRegistryError, match="must be a list"):
                _load_registry(path)
        finally:
            _cleanup(path)

    def test_required_params_empty_string_item(self) -> None:
        path = _tmp_registry("""\
            signatures:
              - id: test.v1
                op_id_prefix: "test."
                required_params: ["speed", ""]
        """)
        try:
            with pytest.raises(OpSignatureRegistryError, match="non-empty string"):
                _load_registry(path)
        finally:
            _cleanup(path)

    def test_unknown_fields_rejected(self) -> None:
        path = _tmp_registry("""\
            signatures:
              - id: test.v1
                op_id_prefix: "test."
                bogus_field: 123
        """)
        try:
            with pytest.raises(OpSignatureRegistryError, match="unknown fields"):
                _load_registry(path)
        finally:
            _cleanup(path)


# ---------------------------------------------------------------------------
# Happy path: valid load
# ---------------------------------------------------------------------------

class TestRegistryLoaderHappyPath:

    def test_minimal_entry(self) -> None:
        path = _tmp_registry("""\
            signatures:
              - id: minimal.v1
                op_id_prefix: "minimal."
        """)
        try:
            registry = _load_registry(path)
            assert "minimal.v1" in registry
            sig = registry["minimal.v1"]
            assert sig.requires_variant_template is False
            assert sig.required_params == ()
            assert sig.required_refs == ()
            assert sig.allowed_modalities == ("image", "video")
        finally:
            _cleanup(path)

    def test_full_entry(self) -> None:
        path = _tmp_registry("""\
            signatures:
              - id: full.v1
                op_id_prefix: "full."
                requires_variant_template: true
                required_params: [a, b]
                required_refs: [subject]
                allowed_modalities: [video]
        """)
        try:
            registry = _load_registry(path)
            sig = registry["full.v1"]
            assert sig.requires_variant_template is True
            assert sig.required_params == ("a", "b")
            assert sig.required_refs == ("subject",)
            assert sig.allowed_modalities == ("video",)
        finally:
            _cleanup(path)

    def test_sorted_by_id(self) -> None:
        path = _tmp_registry("""\
            signatures:
              - id: z.v1
                op_id_prefix: "z."
              - id: a.v1
                op_id_prefix: "a."
              - id: m.v1
                op_id_prefix: "m."
        """)
        try:
            registry = _load_registry(path)
            assert list(registry.keys()) == ["a.v1", "m.v1", "z.v1"]
        finally:
            _cleanup(path)


# ---------------------------------------------------------------------------
# Live registry smoke tests
# ---------------------------------------------------------------------------

# All signature IDs that were in the original hardcoded _OP_SIGNATURES.
_EXPECTED_SIGNATURE_IDS = {
    "camera.angle.v1",
    "camera.focus.v1",
    "camera.motion.v1",
    "camera.pov.v1",
    "camera.shot.v1",
    "direction.axis.v1",
    "light.state.v1",
    "scene.anchor.v1",
    "scene.relation.v1",
    "sequence.continuity.v1",
    "subject.hands.v1",
    "subject.interaction.v1",
    "subject.look.v1",
    "subject.motion.v1",
    "subject.pose.v1",
}


class TestLiveRegistryRegression:
    """Ensure every previously-hardcoded signature is present in the YAML registry."""

    def test_all_legacy_ids_present(self) -> None:
        loaded_ids = {sig.id for sig in list_op_signatures()}
        missing = _EXPECTED_SIGNATURE_IDS - loaded_ids
        assert not missing, f"Missing signatures in registry: {sorted(missing)}"

    def test_count_matches(self) -> None:
        assert len(list_op_signatures()) == len(_EXPECTED_SIGNATURE_IDS)

    def test_deterministic_order(self) -> None:
        ids = [sig.id for sig in list_op_signatures()]
        assert ids == sorted(ids)

    def test_camera_motion_fields_preserved(self) -> None:
        sig = get_op_signature("camera.motion.v1")
        assert sig is not None
        assert sig.op_id_prefix == "camera.motion."
        assert sig.requires_variant_template is True
        assert sig.required_params == ("speed", "direction")
        assert sig.required_refs == ()
        assert sig.allowed_modalities == ("image", "video")

    def test_subject_motion_video_only(self) -> None:
        sig = get_op_signature("subject.motion.v1")
        assert sig is not None
        assert sig.allowed_modalities == ("video",)

    def test_scene_relation_requires_refs(self) -> None:
        sig = get_op_signature("scene.relation.v1")
        assert sig is not None
        assert sig.required_refs == ("subject", "target")

    def test_subject_interaction_fields_preserved(self) -> None:
        sig = get_op_signature("subject.interaction.v1")
        assert sig is not None
        assert sig.required_params == ("beat_type", "contact_stage", "response_mode", "social_tone")
        assert sig.required_refs == ("subject", "target")

    def test_registry_file_exists(self) -> None:
        assert _REGISTRY_PATH.exists(), f"Registry file missing at {_REGISTRY_PATH}"


# ---------------------------------------------------------------------------
# Cross-check: every signature_id used in core packs exists in registry
# ---------------------------------------------------------------------------

class TestContentPackSignaturesCovered:
    """Every signature_id referenced in core pack schemas must be registered."""

    def test_all_pack_signature_ids_exist(self) -> None:
        packs_root = Path(__file__).resolve().parents[3] / "main" / "content_packs" / "prompt"
        schema_files = list(packs_root.glob("*/schema.yaml"))
        assert schema_files, f"No schema.yaml files found under {packs_root}"

        registered_ids = {sig.id for sig in list_op_signatures()}
        missing: list[str] = []

        for schema_path in sorted(schema_files):
            raw = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                continue
            # Walk block_schema entries for signature_id references
            for block in (raw.get("blocks") or []):
                if not isinstance(block, dict):
                    continue
                op = block.get("block_schema", {}).get("op") if isinstance(block.get("block_schema"), dict) else None
                if isinstance(op, dict):
                    sig_id = op.get("signature_id")
                    if isinstance(sig_id, str) and sig_id.strip():
                        if sig_id.strip() not in registered_ids:
                            missing.append(f"{schema_path.parent.name}: {sig_id}")

        assert not missing, (
            f"Content pack schemas reference unregistered signature_ids:\n"
            + "\n".join(f"  - {m}" for m in missing)
        )
