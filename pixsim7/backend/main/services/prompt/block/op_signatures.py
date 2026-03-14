"""Canonical prompt block op signatures.

Signatures provide cross-pack contracts for op templates so packs can reference
stable semantic shapes (required params/refs, op ID namespace, etc.).

Source of truth: ``op_signature_registry.yaml`` (sibling file).

Op namespace rules
------------------
Each signature declares an ``op_namespace`` — a lowercase dotted identifier
(e.g. ``camera.motion``, ``subject.pose``).  Matching is always namespace-
scoped: an ``op_id`` or ``op_id_template`` must start with ``{op_namespace}.``
(namespace + literal dot).  This prevents accidental prefix collisions like
``subject.look`` matching ``subject.look_at`` and makes the boundary explicit.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

import yaml

logger = logging.getLogger(__name__)

_REGISTRY_PATH = Path(__file__).with_name("op_signature_registry.yaml")

# Lowercase dotted identifier: "a", "a.b", "a.b.c" etc.
_NAMESPACE_RE = re.compile(r"^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$")


@dataclass(frozen=True, slots=True)
class OpSignature:
    id: str
    op_namespace: str
    requires_variant_template: bool = False
    required_params: Sequence[str] = ()
    required_refs: Sequence[str] = ()
    allowed_modalities: Sequence[str] = ("image", "video")

    @property
    def op_id_prefix(self) -> str:
        """Derived prefix used for startswith matching: ``op_namespace + '.'``."""
        return self.op_namespace + "."


class OpSignatureRegistryError(Exception):
    """Raised when the registry data file is invalid."""


# ---------------------------------------------------------------------------
# Registry loader
# ---------------------------------------------------------------------------

_REQUIRED_FIELDS = {"id", "op_namespace"}
_ALL_FIELDS = {
    "id", "op_namespace", "requires_variant_template",
    "required_params", "required_refs", "allowed_modalities",
}


def _validate_entry(entry: Any, index: int) -> None:
    """Validate a single registry entry, raising on first error."""
    if not isinstance(entry, dict):
        raise OpSignatureRegistryError(
            f"signatures[{index}]: expected a mapping, got {type(entry).__name__}"
        )
    for field in _REQUIRED_FIELDS:
        if field not in entry:
            raise OpSignatureRegistryError(
                f"signatures[{index}]: missing required field '{field}'"
            )
    sig_id = entry["id"]
    if not isinstance(sig_id, str) or not sig_id.strip():
        raise OpSignatureRegistryError(
            f"signatures[{index}]: 'id' must be a non-empty string"
        )
    namespace = entry["op_namespace"]
    if not isinstance(namespace, str) or not namespace.strip():
        raise OpSignatureRegistryError(
            f"signatures[{index}] ({sig_id}): 'op_namespace' must be a non-empty string"
        )
    if not _NAMESPACE_RE.match(namespace.strip()):
        raise OpSignatureRegistryError(
            f"signatures[{index}] ({sig_id}): 'op_namespace' must be a lowercase "
            f"dotted identifier (got '{namespace.strip()}')"
        )
    if "requires_variant_template" in entry:
        val = entry["requires_variant_template"]
        if not isinstance(val, bool):
            raise OpSignatureRegistryError(
                f"signatures[{index}] ({sig_id}): 'requires_variant_template' must be a boolean"
            )
    for list_field in ("required_params", "required_refs", "allowed_modalities"):
        if list_field in entry:
            val = entry[list_field]
            if not isinstance(val, list):
                raise OpSignatureRegistryError(
                    f"signatures[{index}] ({sig_id}): '{list_field}' must be a list"
                )
            for i, item in enumerate(val):
                if not isinstance(item, str) or not item.strip():
                    raise OpSignatureRegistryError(
                        f"signatures[{index}] ({sig_id}): '{list_field}[{i}]' must be a non-empty string"
                    )
    unknown = set(entry.keys()) - _ALL_FIELDS
    if unknown:
        raise OpSignatureRegistryError(
            f"signatures[{index}] ({sig_id}): unknown fields: {sorted(unknown)}"
        )


def _load_registry(path: Path) -> Dict[str, OpSignature]:
    """Load and validate the YAML registry, returning an ordered dict."""
    if not path.exists():
        raise OpSignatureRegistryError(f"Registry file not found: {path}")

    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or "signatures" not in raw:
        raise OpSignatureRegistryError(
            "Registry file must contain a top-level 'signatures' key"
        )

    entries = raw["signatures"]
    if not isinstance(entries, list):
        raise OpSignatureRegistryError("'signatures' must be a list")

    seen_ids: Dict[str, int] = {}
    result: Dict[str, OpSignature] = {}

    for index, entry in enumerate(entries):
        _validate_entry(entry, index)
        sig_id = entry["id"].strip()
        if sig_id in seen_ids:
            raise OpSignatureRegistryError(
                f"signatures[{index}]: duplicate id '{sig_id}' (first at index {seen_ids[sig_id]})"
            )
        seen_ids[sig_id] = index
        result[sig_id] = OpSignature(
            id=sig_id,
            op_namespace=entry["op_namespace"].strip(),
            requires_variant_template=entry.get("requires_variant_template", False),
            required_params=tuple(entry.get("required_params") or ()),
            required_refs=tuple(entry.get("required_refs") or ()),
            allowed_modalities=tuple(entry.get("allowed_modalities") or ("image", "video")),
        )

    return dict(sorted(result.items()))


# Module-level load — fail fast on import if registry is broken.
_OP_SIGNATURES: Dict[str, OpSignature] = _load_registry(_REGISTRY_PATH)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

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
    prefix = signature.op_id_prefix  # "namespace."

    if signature.requires_variant_template and op_id_template is None:
        errors.append("signature requires op_id_template containing '{variant}'")

    if op_id is not None and not op_id.startswith(prefix):
        errors.append(
            f"op_id '{op_id}' must start with '{prefix}'"
        )
    if op_id_template is not None:
        if not op_id_template.startswith(prefix):
            errors.append(
                f"op_id_template '{op_id_template}' must start with '{prefix}'"
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
