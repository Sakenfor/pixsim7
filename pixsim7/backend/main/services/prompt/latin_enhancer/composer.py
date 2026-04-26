"""Latin enhancer composer.

Pure-ish picker that selects N tagged Latin variants from blocks declaring
the `latin.enhancer` capability and joins them into a single multi-clause
output.

Design: keep the picker logic (`compose_pure`) free of DB/IO so it can be
unit-tested with synthetic pools. The async `compose` is a thin wrapper
that fetches and adapts.
"""

from __future__ import annotations

import random
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Iterable, Literal, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.blocks import BlockPrimitive

LATIN_ENHANCER_CAPABILITY = "latin.enhancer"

LENGTH_TIER_COUNTS: dict[str, int] = {
    "brief": 1,
    "short": 2,
    "medium": 3,
    "long": 4,
}

INTENSITY_ORDER: tuple[str, ...] = ("subtle", "moderate", "firm", "absolute")

LengthTier = Literal["brief", "short", "medium", "long"]
RegisterChoice = Literal["technical", "poetic", "mixed"]
IntensityChoice = Literal["subtle", "moderate", "firm", "absolute", "escalating"]


@dataclass(frozen=True)
class ComposeRequest:
    length: LengthTier = "short"
    register: RegisterChoice = "mixed"
    intensity: IntensityChoice = "moderate"
    domains: Optional[tuple[str, ...]] = None  # tag.domain overlap; None = all
    seed: Optional[int] = None


@dataclass(frozen=True)
class ComposedVariant:
    block_id: str
    text: str
    register: Optional[str]
    intensity: Optional[str]
    motion_type: Optional[str]
    applies_to: Optional[str]
    latin_form: Optional[str]
    domains: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class ComposeResponse:
    text: str
    variants: tuple[ComposedVariant, ...]
    pool_size: int
    intensity_curve: tuple[str, ...]


def resolve_intensity_curve(setting: IntensityChoice, n: int) -> tuple[str, ...]:
    """Map an intensity setting to N target tier strings.

    `escalating` distributes across the INTENSITY_ORDER tiers. Fixed settings
    repeat the same tier N times.
    """
    if n <= 0:
        return ()
    if setting != "escalating":
        return tuple([setting] * n)
    # Spread across the 4 tiers depending on how many picks we have.
    if n == 1:
        return ("moderate",)
    if n == 2:
        return ("moderate", "firm")
    if n == 3:
        return ("subtle", "moderate", "firm")
    # n >= 4: walk subtle → absolute, then repeat firm for any extras.
    base = list(INTENSITY_ORDER)
    if n <= len(base):
        return tuple(base[:n])
    extras = ["firm"] * (n - len(base))
    return tuple(base + extras)


def _row_to_variant(row: BlockPrimitive) -> ComposedVariant:
    tags = row.tags or {}
    raw_domain = tags.get("domain")
    if isinstance(raw_domain, str):
        domains = (raw_domain,)
    elif isinstance(raw_domain, (list, tuple)):
        domains = tuple(str(d) for d in raw_domain if isinstance(d, str))
    else:
        domains = ()
    return ComposedVariant(
        block_id=row.block_id,
        text=str(row.text or "").strip(),
        register=_string_tag(tags, "register"),
        intensity=_string_tag(tags, "intensity"),
        motion_type=_string_tag(tags, "motion_type"),
        applies_to=_string_tag(tags, "applies_to"),
        latin_form=_string_tag(tags, "latin_form"),
        domains=domains,
    )


def _string_tag(tags: dict[str, Any], key: str) -> Optional[str]:
    value = tags.get(key)
    if isinstance(value, str):
        text = value.strip()
        return text or None
    return None


async def fetch_latin_pool(
    blocks_db: AsyncSession,
    *,
    register: RegisterChoice = "mixed",
    domains: Optional[Sequence[str]] = None,
) -> list[ComposedVariant]:
    """Fetch all latin.enhancer variants matching register + domain filters."""
    stmt = select(BlockPrimitive).where(
        BlockPrimitive.capabilities.cast(JSONB).contains([LATIN_ENHANCER_CAPABILITY])
    )
    if register != "mixed":
        stmt = stmt.where(BlockPrimitive.tags["register"].astext == register)

    rows = (await blocks_db.execute(stmt)).scalars().all()
    pool = [_row_to_variant(r) for r in rows if r.text and (r.text or "").strip()]

    if domains:
        wanted = {d for d in domains if d}
        if wanted:
            pool = [v for v in pool if wanted.intersection(v.domains)]
    return pool


def compose_pure(
    pool: Iterable[ComposedVariant],
    req: ComposeRequest,
) -> ComposeResponse:
    """Pick N variants and join them. Pure — no IO, no globals beyond `random`."""
    pool_list = [v for v in pool if v.text]
    n = LENGTH_TIER_COUNTS.get(req.length, 0)
    if n == 0 or not pool_list:
        return ComposeResponse(
            text="",
            variants=(),
            pool_size=len(pool_list),
            intensity_curve=(),
        )

    target_curve = resolve_intensity_curve(req.intensity, n)
    rng = random.Random(req.seed)
    used_motion: deque[str] = deque(maxlen=2)
    used_target_history: list[str] = []
    chosen_ids: set[str] = set()
    picks: list[ComposedVariant] = []

    for tier in target_curve:
        candidates = _filter_strict(pool_list, tier, used_motion, used_target_history, chosen_ids)
        if not candidates:
            candidates = _filter_relaxed_motion(pool_list, tier, used_target_history, chosen_ids)
        if not candidates:
            candidates = _filter_relaxed_target(pool_list, tier, chosen_ids)
        if not candidates:
            candidates = [v for v in pool_list if v.block_id not in chosen_ids]
        if not candidates:
            break
        chosen = rng.choice(candidates)
        picks.append(chosen)
        chosen_ids.add(chosen.block_id)
        if chosen.motion_type:
            used_motion.append(chosen.motion_type)
        if chosen.applies_to:
            used_target_history.append(chosen.applies_to)

    return ComposeResponse(
        text=join_picks(picks),
        variants=tuple(picks),
        pool_size=len(pool_list),
        intensity_curve=target_curve,
    )


def _filter_strict(
    pool: list[ComposedVariant],
    tier: str,
    used_motion: deque[str],
    used_target_history: list[str],
    chosen_ids: set[str],
) -> list[ComposedVariant]:
    """Match tier exactly; reject same recent motion and over-used target."""
    return [
        v
        for v in pool
        if v.block_id not in chosen_ids
        and v.intensity == tier
        and (not v.motion_type or v.motion_type not in used_motion)
        and (not v.applies_to or used_target_history.count(v.applies_to) < 2)
    ]


def _filter_relaxed_motion(
    pool: list[ComposedVariant],
    tier: str,
    used_target_history: list[str],
    chosen_ids: set[str],
) -> list[ComposedVariant]:
    return [
        v
        for v in pool
        if v.block_id not in chosen_ids
        and v.intensity == tier
        and (not v.applies_to or used_target_history.count(v.applies_to) < 2)
    ]


def _filter_relaxed_target(
    pool: list[ComposedVariant],
    tier: str,
    chosen_ids: set[str],
) -> list[ComposedVariant]:
    return [v for v in pool if v.block_id not in chosen_ids and v.intensity == tier]


def join_picks(picks: Sequence[ComposedVariant]) -> str:
    """Join picks with sentence-vs-noun-phrase aware separators.

    First clause renders as-is. Subsequent predications start a new sentence
    (capitalize, prefix `. `). Subsequent noun phrases attach with `; ` to
    the previous clause without sentence-ending the prior text.
    """
    if not picks:
        return ""
    out: list[str] = []
    for i, v in enumerate(picks):
        text = v.text.strip()
        if not text:
            continue
        if i == 0:
            out.append(text)
            continue
        if v.latin_form == "noun_phrase":
            out.append(f"; {text}")
        else:
            capitalized = text[:1].upper() + text[1:]
            out.append(f". {capitalized}")
    if not out:
        return ""
    joined = "".join(out)
    # End on a period unless the final piece was a noun-phrase tail.
    if not joined.endswith("."):
        joined = joined + "."
    return joined


async def compose(
    blocks_db: AsyncSession,
    req: ComposeRequest,
) -> ComposeResponse:
    """Async wrapper: fetch pool by register/domains then run compose_pure."""
    pool = await fetch_latin_pool(
        blocks_db,
        register=req.register,
        domains=req.domains,
    )
    return compose_pure(pool, req)
