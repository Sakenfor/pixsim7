"""
Shared image composition roles and mapping utilities.

This module defines the canonical composition roles used across prompt blocks,
fusion, and multi-image editing. Provider adapters collapse these roles into
provider-specific formats.

Role mappings are loaded from composition-roles.yaml (single source of truth).
Frontend generates equivalent TS constants via scripts/generate-composition-roles.ts.
"""
from __future__ import annotations

import copy
import os
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml


# ============================================================================
# YAML Loading (Single Source of Truth)
# ============================================================================


def _resolve_data_path() -> Path:
    """Resolve path to composition-roles.yaml with robust fallbacks."""
    # Primary: same directory as this module
    candidate = Path(__file__).resolve().parent / "composition-roles.yaml"
    if candidate.exists():
        return candidate

    # Fallback: check PIXSIM_DATA_DIR env var
    env_dir = os.environ.get("PIXSIM_DATA_DIR")
    if env_dir:
        candidate = Path(env_dir) / "composition-roles.yaml"
        if candidate.exists():
            return candidate

    raise FileNotFoundError(
        f"composition-roles.yaml not found. "
        f"Checked: {Path(__file__).resolve().parent / 'composition-roles.yaml'}. "
        f"Set PIXSIM_DATA_DIR or ensure file exists alongside composition.py."
    )


def _load_role_data() -> Dict[str, Any]:
    """Load and validate composition role data from YAML."""
    data_path = _resolve_data_path()
    with open(data_path, encoding="utf-8") as f:
        data = yaml.safe_load(f)

    required = ["roles", "priority", "slugMappings", "namespaceMappings", "aliases"]
    missing = [k for k in required if k not in data]
    if missing:
        raise ValueError(
            f"composition-roles.yaml missing required keys: {missing}"
        )
    return data


# Load at module init - fail fast with clear error
_ROLE_DATA = _load_role_data()


def _build_composition_role_enum() -> type:
    """Dynamically build ImageCompositionRole enum from YAML roles."""
    # roles is now an object with metadata, extract keys
    roles_data = _ROLE_DATA["roles"]
    role_ids = list(roles_data.keys())
    # Create enum members: MAIN_CHARACTER = "main_character", etc.
    members = {role.upper(): role for role in role_ids}
    return Enum("ImageCompositionRole", members, type=str)


# Build enum dynamically from YAML - no separate Python edits needed
ImageCompositionRole = _build_composition_role_enum()

# Role mappings from YAML
COMPOSITION_ROLE_ALIASES: Dict[str, str] = _ROLE_DATA["aliases"]
TAG_NAMESPACE_TO_COMPOSITION_ROLE: Dict[str, str] = _ROLE_DATA["namespaceMappings"]
TAG_SLUG_TO_COMPOSITION_ROLE: Dict[str, str] = _ROLE_DATA["slugMappings"]
COMPOSITION_ROLE_PRIORITY: List[str] = _ROLE_DATA["priority"]


def get_composition_role_metadata() -> Dict[str, Dict[str, Any]]:
    """Return a defensive copy of role metadata from YAML."""
    return copy.deepcopy(_ROLE_DATA["roles"])

# Prompt role mapping (PromptSegmentRole -> composition role)
# Not in YAML because prompt roles are a separate concern from tag/alias roles
PROMPT_ROLE_TO_COMPOSITION_ROLE = {
    "character": ImageCompositionRole.MAIN_CHARACTER.value,
    "setting": ImageCompositionRole.ENVIRONMENT.value,
    "mood": ImageCompositionRole.STYLE_REFERENCE.value,
    "romance": ImageCompositionRole.STYLE_REFERENCE.value,
    "action": ImageCompositionRole.EFFECT.value,
    "camera": ImageCompositionRole.EFFECT.value,
}


def normalize_composition_role(role: Optional[str]) -> Optional[str]:
    """Normalize a role string to a canonical composition role id."""
    if not role:
        return None
    key = role.strip().lower()
    if key.startswith("role:"):
        key = key.split(":", 1)[1]
    return COMPOSITION_ROLE_ALIASES.get(key, key)


def map_prompt_role_to_composition_role(prompt_role: Optional[str]) -> Optional[str]:
    """Map a prompt role id to a composition role id."""
    if not prompt_role:
        return None
    key = prompt_role.strip().lower()
    return PROMPT_ROLE_TO_COMPOSITION_ROLE.get(key, normalize_composition_role(key))


def map_tag_to_composition_role(
    namespace: Optional[str],
    *,
    name: Optional[str] = None,
    slug: Optional[str] = None,
) -> Optional[str]:
    """Map a tag namespace/name/slug to a composition role id."""
    if not namespace:
        return None
    namespace_key = namespace.strip().lower()
    name_key = name.strip().lower() if name else None
    slug_key = slug.strip().lower() if slug else None

    if slug_key and slug_key in TAG_SLUG_TO_COMPOSITION_ROLE:
        return TAG_SLUG_TO_COMPOSITION_ROLE[slug_key]

    if namespace_key == "role" and name_key:
        return normalize_composition_role(name_key)

    return TAG_NAMESPACE_TO_COMPOSITION_ROLE.get(namespace_key)


def map_composition_role_to_pixverse_type(
    role: Optional[str],
    *,
    layer: Optional[int] = None,
) -> Optional[str]:
    """
    Collapse a composition role to Pixverse's subject/background role.

    If role is missing, fall back to layer: layer<=0 -> background, else subject.
    """
    normalized = normalize_composition_role(role) if role else None
    if normalized == ImageCompositionRole.ENVIRONMENT.value:
        return "background"
    if normalized:
        return "subject"
    if layer is not None:
        return "background" if layer <= 0 else "subject"
    return None
