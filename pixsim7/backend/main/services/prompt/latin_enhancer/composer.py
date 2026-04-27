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
    # When True the composer interleaves picks from the latin_connectors pack
    # (latin_form='connector') between content clauses to add structural
    # variety (simile/temporal/consequence/anaphor). Default off so existing
    # callers keep their flat-clause output.
    include_connectors: bool = False


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
    connector_type: Optional[str] = None
    attaches: Optional[str] = None


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
        connector_type=_string_tag(tags, "connector_type"),
        attaches=_string_tag(tags, "attaches"),
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
    """Pick N variants and join them. Pure — no IO, no globals beyond `random`.

    Connectors (latin_form='connector') are excluded from the content pick by
    default. When req.include_connectors is True, they're picked separately
    after content selection and woven into the output via paired rendering.
    """
    full_pool = [v for v in pool if v.text]
    # Connectors never participate in content selection; they only serve as
    # interleaved glue between content clauses.
    content_pool = [v for v in full_pool if v.latin_form != "connector"]
    n = LENGTH_TIER_COUNTS.get(req.length, 0)
    if n == 0 or not content_pool:
        return ComposeResponse(
            text="",
            variants=(),
            pool_size=len(content_pool),
            intensity_curve=(),
        )

    target_curve = resolve_intensity_curve(req.intensity, n)
    rng = random.Random(req.seed)
    used_motion: deque[str] = deque(maxlen=2)
    used_target_history: list[str] = []
    chosen_ids: set[str] = set()
    picks: list[ComposedVariant] = []

    for tier in target_curve:
        candidates = _filter_strict(content_pool, tier, used_motion, used_target_history, chosen_ids)
        if not candidates:
            candidates = _filter_relaxed_motion(content_pool, tier, used_target_history, chosen_ids)
        if not candidates:
            candidates = _filter_relaxed_target(content_pool, tier, chosen_ids)
        if not candidates:
            candidates = [v for v in content_pool if v.block_id not in chosen_ids]
        if not candidates:
            break
        chosen = rng.choice(candidates)
        picks.append(chosen)
        chosen_ids.add(chosen.block_id)
        if chosen.motion_type:
            used_motion.append(chosen.motion_type)
        if chosen.applies_to:
            used_target_history.append(chosen.applies_to)

    connector_picks: list[ComposedVariant] = []
    if req.include_connectors and len(picks) >= 2:
        connector_pool = [v for v in full_pool if v.latin_form == "connector"]
        connector_picks = pick_connectors(connector_pool, len(picks), rng)

    text = join_with_connectors(picks, connector_picks) if connector_picks else join_picks(picks)

    return ComposeResponse(
        text=text,
        variants=tuple([*picks, *connector_picks]),
        pool_size=len(content_pool),
        intensity_curve=target_curve,
    )


def pick_connectors(
    connector_pool: list[ComposedVariant],
    n_content_picks: int,
    rng: random.Random,
) -> list[ComposedVariant]:
    """Pick floor(n/2) connectors with anti-repeat by connector_type.

    Cap at floor(n/2) so output never has more glue than substance — at most
    one connector per pair of content clauses.
    """
    target_count = n_content_picks // 2
    if target_count == 0 or not connector_pool:
        return []
    used_types: deque[str] = deque(maxlen=2)
    chosen_ids: set[str] = set()
    picks: list[ComposedVariant] = []
    for _ in range(target_count):
        candidates = [
            v
            for v in connector_pool
            if v.block_id not in chosen_ids
            and (not v.connector_type or v.connector_type not in used_types)
        ]
        if not candidates:
            candidates = [v for v in connector_pool if v.block_id not in chosen_ids]
        if not candidates:
            break
        chosen = rng.choice(candidates)
        picks.append(chosen)
        chosen_ids.add(chosen.block_id)
        if chosen.connector_type:
            used_types.append(chosen.connector_type)
    return picks


def join_with_connectors(
    content_picks: Sequence[ComposedVariant],
    connector_picks: Sequence[ComposedVariant],
) -> str:
    """Render content + connector picks as interleaved sentences.

    Pair each connector with a content clause (round-robin starting from
    content[0]). Render the pair as a single sentence with `, ` separator
    based on the connector's `attaches` field:
      - leading:  `<Connector>, <content>.`
      - trailing: `<Content>, <connector>.`

    Unpaired content clauses render bare: `<Content>.`
    """
    if not content_picks:
        return ""
    pair_count = min(len(connector_picks), len(content_picks))
    pairs: dict[int, ComposedVariant] = {
        i: connector_picks[i] for i in range(pair_count)
    }
    sentences: list[str] = []
    for i, content in enumerate(content_picks):
        connector = pairs.get(i)
        sentences.append(_render_pair(content, connector))
    return " ".join(sentences)


def _render_pair(content: ComposedVariant, connector: Optional[ComposedVariant]) -> str:
    content_text = content.text.strip()
    if not connector:
        return _ensure_terminal_period(_capitalize(content_text))
    connector_text = connector.text.strip()
    if connector.attaches == "leading":
        merged = f"{_capitalize(connector_text)}, {content_text}"
    else:  # trailing (default for unspecified)
        merged = f"{_capitalize(content_text)}, {connector_text}"
    return _ensure_terminal_period(merged)


def _capitalize(text: str) -> str:
    return text[:1].upper() + text[1:] if text else text


def _ensure_terminal_period(text: str) -> str:
    return text if text.endswith(".") else text + "."


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
