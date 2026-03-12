from __future__ import annotations

from pixsim7.backend.main.services.prompt.block.op_signatures import (
    get_op_signature,
    list_op_signatures,
    validate_signature_contract,
)


def test_get_op_signature_unknown_returns_none() -> None:
    assert get_op_signature("missing.signature.v1") is None


def test_list_op_signatures_contains_known_ids() -> None:
    signature_ids = {signature.id for signature in list_op_signatures()}
    assert "camera.motion.v1" in signature_ids
    assert "subject.motion.v1" in signature_ids
    assert "subject.hands.v1" in signature_ids
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
