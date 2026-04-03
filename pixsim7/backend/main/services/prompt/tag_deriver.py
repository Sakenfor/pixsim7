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

import re
from typing import TYPE_CHECKING, List, Optional
from uuid import UUID

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


def _slugify(value: str) -> str:
    """Lowercase, replace spaces/underscores with hyphens, strip non-slug chars."""
    value = value.lower().strip()
    value = re.sub(r"[\s_]+", "-", value)
    value = re.sub(r"[^a-z0-9-]", "", value)
    return value.strip("-")


def _tag(prefix: str, value: Optional[str]) -> Optional[str]:
    """Build a prefix:value slug, or None if value is empty."""
    if not value:
        return None
    slug = _slugify(value)
    return f"{prefix}:{slug}" if slug else None


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

    # ── 2. Character record ────────────────────────────────────────────────
    if primary_character_id:
        try:
            from sqlalchemy import select
            from pixsim7.backend.main.domain.game.entities.character import Character

            result = await db.execute(
                select(Character).where(Character.id == primary_character_id)
            )
            char = result.scalar_one_or_none()
            if char:
                if t := _tag("character", char.species or char.category):
                    tags.append(t)
                if t := _tag("archetype", char.archetype):
                    tags.append(t)
                # Surface the broad category only if species is present
                # (avoids duplicate when species==category)
                if char.species and char.category and char.species != char.category:
                    if t := _tag("kind", char.category):
                        tags.append(t)
        except Exception:
            pass

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
