"""
Storage roots registry — declares the named storage roots and their backends.

A *root* is a named destination for media files. ``'local'`` always exists: the
hot filesystem root from the path registry (``media_root``). Additional roots
(e.g. an S3/MinIO ``'archive'`` reachable over ZeroTier) are declared via
``settings.media_storage_roots`` (a JSON array).

Placement is tracked per-asset by ``Asset.storage_root_id`` (None == 'local').
``stored_key`` stays root-agnostic; the physical location is
``roots[storage_root_id]`` under ``stored_key``.

See plan ``media-storage-tiering``.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Optional

from pixsim_logging import get_logger

from pixsim7.backend.main.shared.config import settings

logger = get_logger()

# The implicit default root: the hot local filesystem (path registry media_root).
LOCAL_ROOT_ID = "local"

_VALID_KINDS = ("local", "s3")

# A root's role in the pipeline:
#  - 'store'  : a normal read/write tier (the 'local' hot root, the 'archive'
#               cold root). Tiering writes land here.
#  - 'source' : a READ-ONLY external bucket the ingest pipeline enumerates to
#               pull originals from (plan s3-source-root-ingest). Never written
#               to, and never a tiering target (placement only targets the root
#               literally named 'archive').
_VALID_ROLES = ("store", "source")


@dataclass(frozen=True)
class RootSpec:
    """Declaration of a single storage root."""

    id: str
    kind: str  # 'local' | 's3'
    config: dict[str, Any] = field(default_factory=dict)
    role: str = "store"  # 'store' (read/write tier) | 'source' (read-only ingest source)


def _parse_extra_roots(raw: Optional[str]) -> list[RootSpec]:
    """Parse ``settings.media_storage_roots`` JSON into validated specs.

    Bad entries are skipped (logged), never raised — a misconfigured archive
    root must not take the whole app down at import time.
    """
    if not raw or not raw.strip():
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("media_storage_roots_parse_failed", error=str(exc))
        return []
    if not isinstance(data, list):
        logger.error("media_storage_roots_not_a_list", got=type(data).__name__)
        return []

    specs: list[RootSpec] = []
    for entry in data:
        if not isinstance(entry, dict):
            logger.warning("media_storage_root_skipped_not_object", entry=entry)
            continue
        rid = entry.get("id")
        kind = entry.get("kind")
        if not rid or not kind:
            logger.warning("media_storage_root_skipped_missing_id_or_kind", entry=entry)
            continue
        if rid == LOCAL_ROOT_ID:
            logger.warning("media_storage_root_skipped_reserved_local")
            continue
        if kind not in _VALID_KINDS:
            logger.warning("media_storage_root_unknown_kind", id=rid, kind=kind)
            continue
        role = entry.get("role", "store")
        if role not in _VALID_ROLES:
            logger.warning("media_storage_root_unknown_role", id=rid, role=role)
            role = "store"
        cfg = {k: v for k, v in entry.items() if k not in ("id", "kind", "role")}
        specs.append(RootSpec(id=str(rid), kind=str(kind), config=cfg, role=role))
    return specs


# DB/UI override of the env-configured extra roots. When not None it fully
# replaces ``settings.media_storage_roots`` (the UI manages the whole extra-root
# set). Populated at startup by the ``storage_roots`` system_config applier and
# updated live when the Maintenance UI saves a root. None => fall back to env.
_roots_override_json: Optional[str] = None


def set_roots_override(raw: Optional[str]) -> None:
    """Set (or clear, with None) the DB/UI override of the extra-roots JSON.

    Clears the registry cache so the next ``get_root_specs()`` rebuilds.
    """
    global _roots_override_json
    _roots_override_json = raw
    get_root_specs.cache_clear()


def _effective_extra_roots_raw() -> Optional[str]:
    """The extra-roots JSON in effect: DB/UI override if set, else env."""
    return _roots_override_json if _roots_override_json is not None else settings.media_storage_roots


@lru_cache(maxsize=1)
def get_root_specs() -> dict[str, RootSpec]:
    """All configured roots keyed by id. Always includes ``'local'``."""
    roots: dict[str, RootSpec] = {
        LOCAL_ROOT_ID: RootSpec(id=LOCAL_ROOT_ID, kind="local", config={}),
    }
    for spec in _parse_extra_roots(_effective_extra_roots_raw()):
        roots[spec.id] = spec
    if len(roots) > 1:
        logger.info(
            "storage_roots_configured",
            roots=[(s.id, s.kind) for s in roots.values()],
        )
    return roots


def get_source_roots() -> dict[str, RootSpec]:
    """Roots declared ``role='source'`` — read-only buckets the ingest pipeline
    enumerates for originals (plan ``s3-source-root-ingest``). Excludes the
    local + archive store tiers. Empty until at least one source root is
    declared in ``media_storage_roots`` (or the DB/UI override)."""
    return {rid: s for rid, s in get_root_specs().items() if s.role == "source"}


def reset_root_specs_cache() -> None:
    """Clear the cached registry (tests patch settings)."""
    get_root_specs.cache_clear()
