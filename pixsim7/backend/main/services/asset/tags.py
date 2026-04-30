"""Asset tagging helper - derive ontology-aligned tags from asset metadata

This module provides helpers to extract ontology IDs from assets
based on their generation prompts and provider metadata.
"""
from typing import Dict, Any, List, Optional
from sqlmodel import Session

from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.composition import resolve_role_from_tags
from pixsim7.backend.main.domain.generation.models import Generation
from pixsim7.backend.main.services.prompt.parser import SimplePromptParser


async def tag_asset_from_metadata(
    asset: Asset,
    generation: Optional[Generation] = None,
) -> Dict[str, Any]:
    """Derive ontology IDs for an asset from its generation prompt.

    Returns a dict shaped {"ontology_ids": [...]} for compatibility with
    fit-scoring's `asset_tags.get("ontology_ids")` contract.
    """
    ontology_ids: List[str] = []

    if generation and generation.final_prompt:
        parser = SimplePromptParser()
        parsed = await parser.parse(generation.final_prompt)
        for segment in parsed.segments:
            metadata = getattr(segment, "metadata", None)
            if not isinstance(metadata, dict):
                continue
            for oid in metadata.get("ontology_ids", []) or []:
                if isinstance(oid, str) and oid and oid not in ontology_ids:
                    ontology_ids.append(oid)

    return {"ontology_ids": ontology_ids}


# ===== COMPOSITION ROLE INFERENCE =====


def infer_composition_role_from_namespace(
    namespace: str,
    *,
    name: Optional[str] = None,
    slug: Optional[str] = None,
) -> Optional[str]:
    """
    Infer composition role from tag namespace/name.
    """
    tag_slug = slug or (f"{namespace}:{name}" if name else namespace)
    role_ref = resolve_role_from_tags([tag_slug] if tag_slug else [])
    return role_ref.id if role_ref else None


async def infer_composition_role_from_tags(
    asset: Asset,
    session: Session
) -> Optional[str]:
    """
    Infer composition role from asset tags.

    Strategy:
    1. Load all tags for the asset
    2. Resolve role through the shared domain resolver
    """
    from sqlmodel import select
    from pixsim7.backend.main.domain.assets.tag import AssetTag, Tag

    query = (
        select(Tag)
        .join(AssetTag, AssetTag.tag_id == Tag.id)
        .where(AssetTag.asset_id == asset.id)
    )

    result = await session.execute(query)
    tags = result.scalars().all()

    tag_slugs: List[str] = []
    for tag in tags:
        slug = getattr(tag, "slug", None)
        if slug:
            tag_slugs.append(str(slug))
            continue
        namespace = str(getattr(tag, "namespace", "") or "").strip()
        name = str(getattr(tag, "name", "") or "").strip()
        if namespace and name:
            tag_slugs.append(f"{namespace}:{name}")
        elif namespace:
            tag_slugs.append(namespace)

    role_ref = resolve_role_from_tags(tag_slugs)
    return role_ref.id if role_ref else None

