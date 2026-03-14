from __future__ import annotations

from pixsim7.backend.main.services.prompt.block.op_signatures import (
    get_op_signature,
    list_op_signatures,
    validate_signature_contract,
)

TEST_SUITE = {
    "id": "prompt-op-signatures",
    "label": "Op Signature Registry & Contract Tests",
    "kind": "contract",
    "category": "backend/prompt-block",
    "subcategory": "op-signatures",
    "covers": [
        "pixsim7/backend/main/services/prompt/block/op_signatures.py",
        "pixsim7/backend/main/services/prompt/block/op_signature_registry.yaml",
    ],
    "order": 26.1,
}


def test_get_op_signature_unknown_returns_none() -> None:
    assert get_op_signature("missing.signature.v1") is None


def test_list_op_signatures_contains_known_ids() -> None:
    signature_ids = {signature.id for signature in list_op_signatures()}
    assert "camera.motion.v1" in signature_ids
    assert "scene.relation.v1" in signature_ids
    assert "sequence.continuity.v1" in signature_ids
    assert "subject.motion.v1" in signature_ids
    assert "subject.hands.v1" in signature_ids
    assert "subject.interaction.v1" in signature_ids
    assert "subject.look.v1" in signature_ids
    assert "light.state.v1" in signature_ids


def test_validate_signature_contract_requires_variant_template_when_declared() -> None:
    signature = get_op_signature("camera.motion.v1")
    assert signature is not None

    errors = validate_signature_contract(
        signature=signature,
        op_id="camera.motion.zoom",
        op_id_template=None,
        params=[
            {"key": "speed"},
            {"key": "direction"},
        ],
        refs=[],
        modalities=["video"],
    )

    assert any("requires op_id_template" in error for error in errors)


def test_validate_signature_contract_reports_prefix_mismatch() -> None:
    signature = get_op_signature("camera.motion.v1")
    assert signature is not None

    errors = validate_signature_contract(
        signature=signature,
        op_id=None,
        op_id_template="subject.move.{variant}",
        params=[
            {"key": "speed"},
            {"key": "direction"},
        ],
        refs=[],
        modalities=["video"],
    )

    assert any("must start with 'camera.motion.'" in error for error in errors)


def test_validate_signature_contract_reports_unsupported_modalities() -> None:
    signature = get_op_signature("subject.motion.v1")
    assert signature is not None

    errors = validate_signature_contract(
        signature=signature,
        op_id="subject.move.forward",
        op_id_template=None,
        params=[
            {"key": "direction"},
            {"key": "speed"},
            {"key": "gait"},
        ],
        refs=[],
        modalities=["image"],
    )

    assert any("unsupported modalities for signature" in error for error in errors)


def test_validate_signature_contract_reports_missing_required_refs() -> None:
    signature = get_op_signature("scene.relation.v1")
    assert signature is not None

    errors = validate_signature_contract(
        signature=signature,
        op_id="scene.relation.place",
        op_id_template=None,
        params=[
            {"key": "relation"},
            {"key": "distance"},
            {"key": "orientation"},
        ],
        refs=[
            {"key": "subject"},
        ],
        modalities=["image"],
    )

    assert any("missing required refs: target" in error for error in errors)


def test_validate_signature_contract_accepts_subject_interaction_contract() -> None:
    signature = get_op_signature("subject.interaction.v1")
    assert signature is not None

    errors = validate_signature_contract(
        signature=signature,
        op_id="subject.interaction.apply",
        op_id_template=None,
        params=[
            {"key": "beat_type"},
            {"key": "contact_stage"},
            {"key": "response_mode"},
            {"key": "social_tone"},
        ],
        refs=[
            {"key": "subject"},
            {"key": "target"},
        ],
        modalities=["image", "video"],
    )

    assert errors == []


def test_validate_signature_contract_accepts_sequence_continuity_contract() -> None:
    signature = get_op_signature("sequence.continuity.v1")
    assert signature is not None

    errors = validate_signature_contract(
        signature=signature,
        op_id="sequence.continuity.apply",
        op_id_template=None,
        params=[
            {"key": "role_in_sequence"},
            {"key": "continuity_focus"},
            {"key": "continuity_priority"},
        ],
        refs=[],
        modalities=["image", "video"],
    )

    assert errors == []


def test_validate_signature_contract_rejects_underscore_op_id_under_dotted_namespace() -> None:
    """An op_id like 'subject.look_at' must not match namespace 'subject.look'."""
    signature = get_op_signature("subject.look.v1")
    assert signature is not None

    errors = validate_signature_contract(
        signature=signature,
        op_id="subject.look_at",
        op_id_template=None,
        params=[
            {"key": "focus"},
            {"key": "intensity"},
        ],
        refs=[],
        modalities=["image"],
    )

    assert any("must start with 'subject.look.'" in error for error in errors)


def test_validate_signature_contract_accepts_subject_look_dotted_op_id() -> None:
    """subject.look.apply matches namespace 'subject.look'."""
    signature = get_op_signature("subject.look.v1")
    assert signature is not None

    errors = validate_signature_contract(
        signature=signature,
        op_id="subject.look.apply",
        op_id_template=None,
        params=[
            {"key": "focus"},
            {"key": "intensity"},
        ],
        refs=[],
        modalities=["image"],
    )

    assert errors == []
