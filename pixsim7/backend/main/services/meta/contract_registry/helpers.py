"""Shared helpers for building built-in contract surfaces."""
from __future__ import annotations

from typing import Dict, List, Optional
from .models import MetaContractEndpoint


def _inject_focus_tags(
    endpoints: List[MetaContractEndpoint],
    parent_tag: str,
    *,
    group_consolidation: Optional[Dict[str, str]] = None,
) -> List[str]:
    """Inject ``parent_tag:group`` focus tags into *endpoints* in-place.

    For each endpoint, the *first* tag (if any) is treated as the domain key.
    That key is optionally consolidated via *group_consolidation*, then
    combined with *parent_tag* to form a sub-focus tag
    ``{parent_tag}:{group}`` which is appended to the endpoint's tags list.

    Returns the sorted list of unique child focus tags that were emitted —
    ready to be spread into the contract's ``provides`` list.
    """
    consolidation = group_consolidation or {}
    for ep in endpoints:
        if not ep.tags:
            continue
        domain = ep.tags[0]
        # Skip tags that are already focus-tagged or are generic ops
        if domain in ("read", "write"):
            domain = ep.tags[1] if len(ep.tags) > 1 else None
        if not domain or ":" in domain:
            continue
        group = consolidation.get(domain, domain)
        focus_tag = f"{parent_tag}:{group}"
        if focus_tag not in ep.tags:
            ep.tags.append(focus_tag)

    return sorted({
        t for ep in endpoints for t in ep.tags
        if ":" in t and t.startswith(f"{parent_tag}:")
    })
