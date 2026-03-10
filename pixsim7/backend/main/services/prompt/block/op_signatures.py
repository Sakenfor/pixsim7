"""Canonical prompt block op signatures.

Signatures provide cross-pack contracts for op templates so packs can reference
stable semantic shapes (required params/refs, op ID namespace, etc.).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence


@dataclass(frozen=True, slots=True)
class OpSignature:
    id: str
    op_id_prefix: str
    requires_variant_template: bool = False
    required_params: Sequence[str] = ()
    required_refs: Sequence[str] = ()
    allowed_modalities: Sequence[str] = ("image", "video")


_OP_SIGNATURES: Dict[str, OpSignature] = {
    "camera.motion.v1": OpSignature(
        id="camera.motion.v1",
        op_id_prefix="camera.motion.",
        requires_variant_template=True,
        required_params=("speed", "direction"),
        required_refs=(),
        allowed_modalities=("image", "video"),
    ),
    "camera.angle.v1": OpSignature(
        id="camera.angle.v1",
        op_id_prefix="camera.angle.",
        requires_variant_template=False,
        required_params=("vertical_angle", "roll"),
        required_refs=(),
        allowed_modalities=("image", "video"),
    ),
    "camera.shot.v1": OpSignature(
        id="camera.shot.v1",
        op_id_prefix="camera.shot.",
        requires_variant_template=False,
        required_params=("shot_size", "subject_count"),
        required_refs=(),
        allowed_modalities=("image", "video"),
    ),
    "camera.focus.v1": OpSignature(
        id="camera.focus.v1",
        op_id_prefix="camera.focus.",
        requires_variant_template=False,
        required_params=("focus_target", "depth_of_field", "rack"),
        required_refs=(),
        allowed_modalities=("image", "video"),
    ),
    "camera.pov.v1": OpSignature(
        id="camera.pov.v1",
        op_id_prefix="camera.pov.",
        requires_variant_template=False,
        required_params=("perspective", "camera_height"),
        required_refs=(),
        allowed_modalities=("image", "video"),
    ),
    "scene.anchor.v1": OpSignature(
        id="scene.anchor.v1",
        op_id_prefix="scene.anchor.",
        requires_variant_template=False,
        required_params=("relation", "distance", "orientation"),
        required_refs=(),
        allowed_modalities=("image", "video"),
    ),
    "direction.axis.v1": OpSignature(
        id="direction.axis.v1",
        op_id_prefix="direction.axis.",
        requires_variant_template=True,
        required_params=(),
        required_refs=(),
        allowed_modalities=("image", "video"),
    ),
    "subject.motion.v1": OpSignature(
        id="subject.motion.v1",
        op_id_prefix="subject.move.",
        requires_variant_template=False,
        required_params=("direction", "speed", "gait"),
        required_refs=(),
        allowed_modalities=("video",),
    ),
    "subject.pose.v1": OpSignature(
        id="subject.pose.v1",
        op_id_prefix="subject.pose.",
        requires_variant_template=False,
        required_params=("pose", "hands", "gaze"),
        required_refs=(),
        allowed_modalities=("image", "video"),
    ),
}


def get_op_signature(signature_id: str) -> Optional[OpSignature]:
    return _OP_SIGNATURES.get(signature_id)


def list_op_signatures() -> List[OpSignature]:
    return list(_OP_SIGNATURES.values())


def validate_signature_contract(
    *,
    signature: OpSignature,
    op_id: Optional[str],
    op_id_template: Optional[str],
    params: Iterable[dict],
    refs: Iterable[dict],
    modalities: Iterable[str],
) -> List[str]:
    """Return validation errors for a concrete op template against signature."""
    errors: List[str] = []

    if op_id is not None and not op_id.startswith(signature.op_id_prefix):
        errors.append(
            f"op_id '{op_id}' must start with '{signature.op_id_prefix}'"
        )
    if op_id_template is not None:
        if not op_id_template.startswith(signature.op_id_prefix):
            errors.append(
                f"op_id_template '{op_id_template}' must start with '{signature.op_id_prefix}'"
            )
        if signature.requires_variant_template and "{variant}" not in op_id_template:
            errors.append("op_id_template must include '{variant}'")

    param_keys = {
        str(item.get("key")).strip()
        for item in params
        if isinstance(item, dict) and isinstance(item.get("key"), str) and item.get("key").strip()
    }
    missing_params = [key for key in signature.required_params if key not in param_keys]
    if missing_params:
        errors.append(f"missing required params: {', '.join(missing_params)}")

    ref_keys = {
        str(item.get("key")).strip()
        for item in refs
        if isinstance(item, dict) and isinstance(item.get("key"), str) and item.get("key").strip()
    }
    missing_refs = [key for key in signature.required_refs if key not in ref_keys]
    if missing_refs:
        errors.append(f"missing required refs: {', '.join(missing_refs)}")

    allowed_modalities = set(signature.allowed_modalities)
    unknown_modalities = [m for m in modalities if m not in allowed_modalities]
    if unknown_modalities:
        errors.append(
            f"unsupported modalities for signature: {', '.join(sorted(set(unknown_modalities)))}"
        )

    return errors
