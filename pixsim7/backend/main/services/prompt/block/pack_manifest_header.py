"""Shared pack-level manifest header reader.

A content pack's `manifest.yaml` carries two distinct concerns:

1. **Pack-level metadata** (id, title, description, version, category) — read once
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

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, Optional

from pixsim7.backend.main.services.prompt.block.content_pack_manifests import (
    ManifestValidationError,
    _ensure_optional_string,
    _load_yaml,
)

_ROOT_MANIFEST_NAMES = ("manifest.yaml", "manifest.yml")


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
    }


def read_pack_manifest_header(pack_dir: Path) -> Optional[PackManifestHeader]:
    """Read the root `manifest.yaml` (if any) and return its validated header.

    Subdirectory manifests (e.g. `blocks/wardrobe/manifest.yaml`) are *not*
    consulted — those carry matrix-preset scope, not pack-level metadata.

    Returns None when no root manifest exists. Raises `ManifestValidationError`
    on type violations (e.g. `category: 42`).
    """
    for name in _ROOT_MANIFEST_NAMES:
        path = pack_dir / name
        if path.exists() and path.is_file():
            data = _load_yaml(path)
            fields = extract_header_fields(data=data, src=path)
            return PackManifestHeader(**fields)
    return None


__all__ = [
    "PackManifestHeader",
    "extract_header_fields",
    "read_pack_manifest_header",
    "ManifestValidationError",
]
