"""Helpers for the early-CDN-termination signal.

Pixverse occasionally serves a real CDN URL for ~1-2 seconds before its
moderation pipeline replaces the response with a filtered/placeholder
state. The poller surfaces this as two metadata keys on the provider
status result:

  - ``video_early_cdn_terminal``: bool — provider exposed a usable CDN
    URL even though the canonical status was non-terminal (e.g. still
    "processing" or already "filtered").
  - ``video_original_status``: str  — the canonical provider status as
    seen at the moment of promotion (e.g. ``"filtered"``).

Both consumers (asset creation, status poller) need to read these
fields, so the field names live here once.
"""
from __future__ import annotations


def is_early_cdn_terminal(metadata: dict | None) -> bool:
    """True when the provider exposed a usable CDN URL early.

    Used to pick the shorter (15s) moderation recheck delay so we catch
    the credit refund quickly.
    """
    return bool((metadata or {}).get("video_early_cdn_terminal"))


def is_early_cdn_filtered(metadata: dict | None) -> bool:
    """True when the early-CDN URL was served despite a ``filtered`` status.

    Used to skip local billing + provider credit refresh (Pixverse
    auto-refunds; the moderation recheck reconciles later) and to stamp
    ``provider_flagged=True`` on the asset at create time.
    """
    meta = metadata or {}
    return (
        bool(meta.get("video_early_cdn_terminal"))
        and meta.get("video_original_status") == "filtered"
    )
