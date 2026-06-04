"""
Storage placement policy — which root a given asset's main file *should* live on.

This is the single source of truth for the tiering rule. Today: video originals
belong on the ``'archive'`` root when one is configured; everything else stays
``'local'``.

Important (Model B): NEW assets are always *created* on the local root — the hot
creation/ingestion path must not depend on a possibly-offline remote archive,
and derivative generation needs the original bytes locally anyway. This policy
is therefore consumed by the **relocation mover** (and any future post-ingest
auto-archive hook), NOT by the creation call sites. ``storage_root_id`` records
where a file *currently* lives; this function says where it *should* live.

See plan ``media-storage-tiering``.
"""
from __future__ import annotations

from typing import Optional

from pixsim7.backend.main.services.storage.roots import LOCAL_ROOT_ID, get_root_specs

# Canonical id for the cold/archive root. A deployment opts in by declaring a
# root with this id in settings.media_storage_roots.
ARCHIVE_ROOT_ID = "archive"


def _is_video(media_type) -> bool:
    """True for video assets (accepts a MediaType enum or a plain string)."""
    value = getattr(media_type, "value", media_type)
    return str(value).lower() == "video"


def archive_configured() -> bool:
    """Whether a cold/archive root is configured (tiering is otherwise a no-op)."""
    return ARCHIVE_ROOT_ID in get_root_specs()


def resolve_storage_root_id(media_type) -> str:
    """
    Return the root id this media *should* live on.

    Video originals → ``'archive'`` when an archive root is configured; all other
    media (and everything when no archive exists) → ``'local'``.
    """
    if _is_video(media_type) and archive_configured():
        return ARCHIVE_ROOT_ID
    return LOCAL_ROOT_ID


def should_archive(media_type, current_root_id: Optional[str]) -> bool:
    """
    True if an asset currently on ``current_root_id`` ought to be relocated to
    the archive (used by the mover to select candidates).
    """
    target = resolve_storage_root_id(media_type)
    return target == ARCHIVE_ROOT_ID and (current_root_id or LOCAL_ROOT_ID) != target
