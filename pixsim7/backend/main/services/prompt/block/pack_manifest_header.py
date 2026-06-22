"""Shared pack-level manifest header reader.

A content pack's `manifest.yaml` carries two distinct concerns:

1. **Pack-level metadata** (id, title, description, version, category, icon) — read once
   from the *root* manifest, applies to the whole pack. Used by the inventory
   endpoint and by the primitives loader.
2. **Matrix-preset definitions** (prompt packs only) — may live in the root and
   in subdir manifests under `blocks/.../manifest.yaml`. Parsed by
   `content_pack_manifests.parse_manifests`, which is matrix-preset-specific.

This module owns concern (1). It is the single source of truth for what fields
make up a pack's identity at the metadata layer; both prompt packs and
primitives packs go through this reader.
"""
from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, Optional

from pixsim7.backend.main.services.prompt.block.content_pack_manifests import (
    ManifestValidationError,
    _ensure_optional_string,
    _load_yaml,
)

logger = logging.getLogger(__name__)

_ROOT_MANIFEST_NAMES = ("manifest.yaml", "manifest.yml")

# Closed registry of pack-level categories (Path B taxonomy).
#
# This vocabulary describes pack *identity* — what kind of pack this is — and
# is intentionally separate from the block-level `category: #SimpleId` set in
# tools/cue/prompt_packs/schema_v1.cue (which describes block contents).
#
# Adding a new bucket: append it here in the same PR that introduces the first
# pack using it. The reader logs a warning (non-fatal) for any pack declaring
# a category outside this set, catching typos at load time.
#
# See plan content-pack-category-field, Phase 4.
PACK_CATEGORY_REGISTRY: frozenset[str] = frozenset({
    # core block-primitive packs
    "camera",       # core_camera, core_angle, core_direction, core_pov, core_shot, core_focus
    "lighting",     # core_light
    "composition",  # core_placement
    "color",        # core_color
    "subject",      # core_subject_action, _motion, _pose, _interaction
    "expression",   # core_subject_look, _expression
    "anatomy",      # core_subject_repro_organ + creature_foundation
    "hands",        # core_hands
    "manner",       # core_manner
    "continuity",   # core_sequence_continuity
    # prose-overlay enhancers (different shape from CUE primitives)
    "latin",        # all latin_* packs
    # primitives foundation packs
    "mood",         # genre_tone
    "scene",        # scene_foundation
    "style",        # style_foundation
    "demo",         # bananza_boat_demo (and any future demo packs)
})


def is_known_pack_category(value: Optional[str]) -> bool:
    """Return True iff `value` is a registered pack category.

    None, empty string, and unknown values return False.
    """
    if not value:
        return False
    return value in PACK_CATEGORY_REGISTRY


@dataclass(frozen=True)
class PackManifestHeader:
    """Pack-level metadata read from the root `manifest.yaml`.

    All fields are optional; absent or whitespace-only values become None.
    """

    id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    version: Optional[str] = None
    category: Optional[str] = None
    icon: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def extract_header_fields(*, data: Dict[str, Any], src: Path) -> Dict[str, Optional[str]]:
    """Validate and extract header fields from a parsed manifest dict.

    Shared with `content_pack_manifests.parse_manifests` so prompt-pack matrix
    entries and the pack-level inventory header use identical validation.
    """
    return {
        "id": _ensure_optional_string(value=data.get("id"), path=src, field="id"),
        "title": _ensure_optional_string(value=data.get("title"), path=src, field="title"),
        "description": _ensure_optional_string(
            value=data.get("description"), path=src, field="description"
        ),
        "version": _ensure_optional_string(
            value=data.get("version"), path=src, field="version"
        ),
        "category": _ensure_optional_string(
            value=data.get("category"), path=src, field="category"
        ),
        "icon": _ensure_optional_string(
            value=data.get("icon"), path=src, field="icon"
        ),
    }


def read_pack_manifest_header(pack_dir: Path) -> Optional[PackManifestHeader]:
    """Read the root `manifest.yaml` (if any) and return its validated header.

    Subdirectory manifests (e.g. `blocks/wardrobe/manifest.yaml`) are *not*
    consulted — those carry matrix-preset scope, not pack-level metadata.

    Returns None when no root manifest exists. Raises `ManifestValidationError`
    on type violations (e.g. `category: 42`). Logs a warning (non-fatal) when
    a declared `category` is not in `PACK_CATEGORY_REGISTRY` — catches typos
    without breaking pack loading.
    """
    for name in _ROOT_MANIFEST_NAMES:
        path = pack_dir / name
        if path.exists() and path.is_file():
            data = _load_yaml(path)
            fields = extract_header_fields(data=data, src=path)
            header = PackManifestHeader(**fields)
            if header.category is not None and header.category not in PACK_CATEGORY_REGISTRY:
                logger.warning(
                    "pack_manifest_unknown_category pack=%s category=%r path=%s "
                    "(see PACK_CATEGORY_REGISTRY in pack_manifest_header.py)",
                    pack_dir.name, header.category, path,
                )
            return header
    return None


__all__ = [
    "PackManifestHeader",
    "PACK_CATEGORY_REGISTRY",
    "extract_header_fields",
    "is_known_pack_category",
    "read_pack_manifest_header",
    "ManifestValidationError",
]
