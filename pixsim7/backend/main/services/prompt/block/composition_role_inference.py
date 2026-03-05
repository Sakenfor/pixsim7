"""Infer ImageCompositionRole leaf from block metadata (role, category, tags).

Supports both legacy PromptBlock (role + category) and BlockPrimitive
(category only) via the category-only fallback table.

Registry-driven: all mapping tables are loaded from VocabularyRegistry
(roles.yaml slug_mappings, namespace_mappings, category_mappings) and
the prompt_role→composition_role mapping. A tiny bootstrap fallback is
kept for safety when the registry is unavailable.

Pure function — no DB, no async, no side-effects.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Literal, Mapping

InferenceConfidence = Literal["exact", "heuristic", "ambiguous", "unknown"]


@dataclass(frozen=True)
class CompositionRoleInference:
    role_id: str | None
    confidence: InferenceConfidence
    reason: str
    candidates: tuple[str, ...] = ()


# ── Registry-driven mappings (loaded once at import) ──────────────────────

def _load_registry_mappings() -> dict[str, Dict[str, str]]:
    """Load all inference mapping tables from the vocab registry.

    Returns a dict with keys:
      slug_mappings, namespace_mappings, category_mappings,
      role_to_composition (merged from prompt roles + composition aliases)
    """
    try:
        from pixsim7.backend.main.shared.composition import (
            TAG_SLUG_TO_COMPOSITION_ROLE,
            TAG_NAMESPACE_TO_COMPOSITION_ROLE,
            CATEGORY_TO_COMPOSITION_ROLE,
            PROMPT_ROLE_TO_COMPOSITION_ROLE,
            COMPOSITION_ROLE_ALIASES,
        )
        # Build a combined role mapping: aliases first, then prompt roles override.
        # This ensures that prompt-role-level composition_role takes precedence,
        # but roles without an explicit mapping still resolve via aliases.
        role_map: Dict[str, str] = dict(COMPOSITION_ROLE_ALIASES)
        role_map.update(PROMPT_ROLE_TO_COMPOSITION_ROLE)
        return {
            "slug_mappings": dict(TAG_SLUG_TO_COMPOSITION_ROLE),
            "namespace_mappings": dict(TAG_NAMESPACE_TO_COMPOSITION_ROLE),
            "category_mappings": dict(CATEGORY_TO_COMPOSITION_ROLE),
            "role_to_composition": role_map,
        }
    except Exception:
        return {
            "slug_mappings": {},
            "namespace_mappings": {},
            "category_mappings": {},
            "role_to_composition": {},
        }


_REGISTRY = _load_registry_mappings()


def infer_composition_role(
    *,
    role: str | None,
    category: str | None,
    tags: Mapping[str, Any] | None = None,
) -> CompositionRoleInference:
    """Infer a composition role leaf from block metadata.

    Priority chain (strict precedence):
    1. Tag-based exact match   → confidence "exact"
       a. slug match (tag_key:tag_value)
       b. namespace match (tag_key alone)
    2. Category refinement     → confidence "heuristic"
    3. Role mapping            → confidence "heuristic"
    4. Category-only fallback  → confidence "heuristic" (primitives)
    5. Bootstrap fallback      → confidence "heuristic" (emergency only)
    6. Unknown                 → confidence "unknown", role_id=None
    """
    norm_role = role.strip().lower() if role else None
    norm_cat = category.strip().lower() if category else None
    norm_tags: dict[str, Any] = {}
    if tags:
        norm_tags = {k.strip().lower(): v for k, v in tags.items()}

    slug_mappings = _REGISTRY["slug_mappings"]
    namespace_mappings = _REGISTRY["namespace_mappings"]
    category_mappings = _REGISTRY["category_mappings"]
    role_map = _REGISTRY["role_to_composition"]

    # ── 1. Tag-based exact match ────────────────────────────────────────
    if norm_tags:
        tag_hits: set[str] = set()

        for tag_key, tag_value in norm_tags.items():
            slug_matched = False

            # 1a. Slug match: "tag_key:tag_value" (most specific)
            if isinstance(tag_value, str):
                slug = f"{tag_key}:{tag_value.strip().lower()}"
                if slug in slug_mappings:
                    tag_hits.add(slug_mappings[slug])
                    slug_matched = True

            # 1b. Namespace match: tag_key alone (only if no slug matched)
            if not slug_matched and tag_key in namespace_mappings:
                tag_hits.add(namespace_mappings[tag_key])

        if len(tag_hits) == 1:
            hit = next(iter(tag_hits))
            return CompositionRoleInference(
                role_id=hit,
                confidence="exact",
                reason=f"tag match → {hit}",
            )
        if len(tag_hits) > 1:
            sorted_hits = tuple(sorted(tag_hits))
            return CompositionRoleInference(
                role_id=None,
                confidence="ambiguous",
                reason=f"tags matched multiple roles: {', '.join(sorted_hits)}",
                candidates=sorted_hits,
            )

    # ── 2. Category refinement (when role is present) ───────────────────
    if norm_role and norm_cat and norm_cat in category_mappings:
        hit = category_mappings[norm_cat]
        return CompositionRoleInference(
            role_id=hit,
            confidence="heuristic",
            reason=f"({norm_role}, {norm_cat}) → {hit}",
        )

    # ── 3. Role mapping (prompt_role → composition_role) ────────────────
    if norm_role and norm_role in role_map:
        hit = role_map[norm_role]
        return CompositionRoleInference(
            role_id=hit,
            confidence="heuristic",
            reason=f"role-only: {norm_role} → {hit}",
        )

    # ── 4. Category-only fallback (primitives — no role field) ──────────
    if norm_cat and norm_cat in category_mappings:
        hit = category_mappings[norm_cat]
        return CompositionRoleInference(
            role_id=hit,
            confidence="heuristic",
            reason=f"category-only: {norm_cat} → {hit}",
        )

    # ── 5. Unknown ──────────────────────────────────────────────────────
    parts = []
    if norm_role:
        parts.append(f"role={norm_role}")
    if norm_cat:
        parts.append(f"category={norm_cat}")
    if norm_tags:
        parts.append(f"tags={list(norm_tags.keys())}")
    provided = ", ".join(parts) if parts else "nothing"
    return CompositionRoleInference(
        role_id=None,
        confidence="unknown",
        reason=f"no mapping for {provided}",
    )
