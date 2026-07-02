"""
Structural tag derivation for PromptFamily.

Derives tags deterministically from structured authoring context — no LLM
needed.  Runs synchronously at family create/update time and produces
source="derived" tags that are always accurate and available immediately.

Sources (in order of richness):
  1. AuthoringMode.recommended_tags  (from authoring_mode_id)
  2. Character record               (from primary_character_id)
  3. PromptFamily fields            (prompt_type, category)
  4. NPC record                     (from npc_id, for name-based tags)

LLM (source="ai") then fills in what structural data can't cover:
visual style adjectives, mood, specific design choices in the prompt text.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, List, Optional
from uuid import UUID

from pixsim7.backend.main.services.prompt.subject_tag_providers import (
    get_subject_tag_provider,
    tag as _tag,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


async def derive_structural_tags(
    *,
    authoring_mode_id: Optional[str],
    prompt_type: Optional[str],
    category: Optional[str],
    primary_character_id: Optional[UUID],
    npc_id: Optional[UUID],
    db: "AsyncSession",
) -> List[str]:
    """
    Derive library-organization tags from structured authoring context.

    Returns a deduplicated list of validated prefix:value slugs.
    Never raises — on any lookup failure the field is simply skipped.
    """
    tags: list[str] = []

    # ── 1. AuthoringMode.recommended_tags ──────────────────────────────────
    if authoring_mode_id:
        try:
            from pixsim7.backend.main.services.prompt.authoring_mode_registry import (
                authoring_mode_registry,
            )
            mode = authoring_mode_registry.get(authoring_mode_id)
            if mode:
                tags.extend(mode.recommended_tags or [])
        except Exception:
            pass

    # ── 2. Family subject (Character today; pluggable via subject providers) ─
    # The subject is what the family is *about*. Dispatched through the
    # subject-tag registry so new subject types (location, prop, …) can
    # contribute tags without changing this control flow. Today the only
    # subject is primary_character_id → the "character" provider.
    if primary_character_id:
        provider = get_subject_tag_provider("character")
        if provider:
            tags.extend(await provider.derive_tags(primary_character_id, db))

    # ── 3. PromptFamily classification fields ──────────────────────────────
    if t := _tag("type", prompt_type):
        tags.append(t)
    if t := _tag("category", category):
        tags.append(t)

    # ── 4. NPC name tag ────────────────────────────────────────────────────
    if npc_id:
        try:
            from sqlalchemy import select
            # Import lazily — NPC model lives in game domain
            from pixsim7.backend.main.domain.game.entities.npc import NPC  # type: ignore

            result = await db.execute(select(NPC).where(NPC.id == npc_id))
            npc = result.scalar_one_or_none()
            if npc and getattr(npc, "name", None):
                if t := _tag("npc", npc.name):
                    tags.append(t)
        except Exception:
            pass

    # Deduplicate preserving order, validate prefix:value format
    seen: set[str] = set()
    result_tags: list[str] = []
    for tag in tags:
        if tag and ":" in tag and tag not in seen:
            seen.add(tag)
            result_tags.append(tag)

    return result_tags
