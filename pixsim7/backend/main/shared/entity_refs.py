"""Canonical EntityRef parsing/serialization helpers.

This module provides a thin utility layer over ``shared.schemas.entity_ref``
so services can normalize and stringify refs consistently without repeating
``parse_flexible`` / ``to_string`` patterns in many places.
"""
from __future__ import annotations

from typing import Any, Optional

from pixsim7.backend.main.shared.schemas.entity_ref import EntityRef


def parse_entity_ref(value: Any, *, default_type: Optional[str] = None) -> Optional[EntityRef]:
    """Best-effort parse of an EntityRef-compatible value.

    Returns ``None`` for unparsable values instead of raising.
    """
    if value is None:
        return None

    try:
        return EntityRef.parse_flexible(value, default_type=default_type)
    except Exception:
        return None


def entity_ref_to_string(value: Any, *, default_type: Optional[str] = None) -> Optional[str]:
    """Normalize any EntityRef-compatible value to canonical string form."""
    ref = parse_entity_ref(value, default_type=default_type)
    if ref is None:
        return None
    return ref.to_string()


def extract_entity_id(
    value: Any,
    *,
    entity_type: str,
    default_type: Optional[str] = None,
) -> Optional[int]:
    """Extract integer ID when value resolves to the requested entity type."""
    ref = parse_entity_ref(value, default_type=default_type)
    if ref is None or ref.type != entity_type:
        return None
    return ref.id

