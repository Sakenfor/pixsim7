"""Batch cohort-count queries for the media-card similarity badge.

For each asset we count how many of the user's assets fall in the same
*cohort* for every combination of three facets — Inputs (I), Prompt (P), Seed
(S). All counts are **user-scoped** and **include-self**.

* Inputs  — the denormalized ``Asset.input_assets_key`` (the set of input
  assets). NULL for text-to-* generations and uploads.
* Prompt  — ``COALESCE(prompt_family_id, prompt_version_id)``: the prompt
  family when the prompt belongs to one, else the exact version for one-off
  prompts. A single grouping value either way (the two id-spaces never collide).
* Seed    — the denormalized provider seed ``Asset.gen_seed`` (sentinel seeds
  ``<= 0`` are stored as NULL upstream, so "pick a random seed" never groups).

The result is a per-asset map keyed by the lit-facet letters in canonical
``i`` < ``p`` < ``s`` order: ``{"i", "p", "s", "ip", "is", "ps", "ips"}``. A
combo is only counted for an asset that has a non-null value for *every* facet
in it (e.g. ``ips`` needs inputs AND a prompt AND a seed); otherwise it stays 0
and the frontend hides the badge. The frontend picks which combo to display
from a user-chosen facet lens, so shipping the whole map lets it switch the
displayed count instantly with no extra round-trip.

Mirrors ``AssetLineageService.has_children_map`` — a handful of GROUP BY
queries batch a whole gallery page. See plan ``media-card-sibling-badges``.
"""
from __future__ import annotations

from typing import Callable, Dict, Iterable, List, Tuple

from sqlalchemy import func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.services.asset.signal_analysis import (
    heuristic_broken_clause,
    not_effectively_broken_clause,
)

# A single prompt grouping value: the family if the prompt belongs to one, else
# the exact version (one-off prompts). family_id and version_id are disjoint
# id-spaces, so coalescing them can never produce a false match.
_PROMPT_KEY = func.coalesce(Asset.prompt_family_id, Asset.prompt_version_id)

# Facet letter -> (grouping column/expr, pivot-value extractor from an Asset).
# The extractor returns None when the asset has no value for that facet, which
# excludes it from every combo containing the facet.
_FACETS: Dict[str, Tuple[object, Callable[[Asset], object]]] = {
    "i": (Asset.input_assets_key, lambda a: a.input_assets_key),
    "p": (_PROMPT_KEY, lambda a: a.prompt_family_id or a.prompt_version_id),
    "s": (Asset.gen_seed, lambda a: a.gen_seed),
}

# All non-empty facet combinations, letters in canonical i<p<s order so the
# keys match what the frontend builds from its facet lens.
_COMBOS: Tuple[str, ...] = ("i", "p", "s", "ip", "is", "ps", "ips")


class AssetSiblingCountService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def counts_map(
        self,
        assets: Iterable[Asset],
        owner_user_id: int,
        broken_score_cutoff: int | None = None,
    ) -> Dict[int, Dict[str, int]]:
        """Return ``{asset_id: {combo_key: count}}`` for every facet combo.

        When ``broken_score_cutoff`` is set, siblings whose CURRENT-version
        heuristic score is at/above it (and not Keep-overridden) are also dropped
        from the counts — the opt-in "hide high-confidence broken" the similarity
        badge exposes in settings. Manual-flag-broken clips are always excluded
        regardless (see ``not_effectively_broken_clause``).
        """
        asset_list = [a for a in assets if a is not None]
        result: Dict[int, Dict[str, int]] = {
            a.id: {combo: 0 for combo in _COMBOS} for a in asset_list
        }
        if not asset_list:
            return result

        for combo in _COMBOS:
            await self._fill_combo(
                asset_list, owner_user_id, result, combo, broken_score_cutoff
            )
        return result

    async def _fill_combo(
        self,
        assets: List[Asset],
        owner_user_id: int,
        result: Dict[int, Dict[str, int]],
        combo: str,
        broken_score_cutoff: int | None = None,
    ) -> None:
        cols = [_FACETS[c][0] for c in combo]
        extractors = [_FACETS[c][1] for c in combo]

        def pivot_key(a: Asset):
            vals = tuple(ex(a) for ex in extractors)
            return vals if all(v is not None for v in vals) else None

        keys = {k for a in assets if (k := pivot_key(a)) is not None}
        if not keys:
            return

        # Composite IN over the exact facet columns; any cross-pair rows the IN
        # admits are simply never read back (we look up exact pivot tuples).
        q = (
            select(*cols, func.count(Asset.id))
            .where(Asset.user_id == owner_user_id)
            .where(tuple_(*cols).in_(list(keys)))
            # Don't let broken clips inflate the cohort counts shown on cards.
            # Always drop manually-flagged broken (the same definition the
            # default gallery hides — see effectively_broken_clause).
            .where(not_effectively_broken_clause())
            .group_by(*cols)
        )
        # Optionally also drop high-confidence heuristic-broken siblings (the
        # similarity badge's "hide broken" setting). Kept SEPARATE from the
        # manual clause above because the scoring heuristic over-fires for a
        # blanket default hide — it's opt-in, with a caller-chosen score cutoff.
        if broken_score_cutoff is not None:
            q = q.where(~heuristic_broken_clause(broken_score_cutoff))
        counts: Dict[tuple, int] = {}
        for row in (await self.db.execute(q)).all():
            *key_vals, n = row
            counts[tuple(key_vals)] = int(n)

        for a in assets:
            k = pivot_key(a)
            if k is not None:
                result[a.id][combo] = counts.get(k, 0)
