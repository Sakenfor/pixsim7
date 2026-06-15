"""Per-word ("variant slot") success outcomes for related prompts.

Given a set of near-identical prompt versions (an existing family or a
candidate cluster from `family_candidates`), induce the variable slots and
attribute a STATUS-BASED success rate to each alternative word/phrase that
fills a slot. This is what lets the UI say "'through' completes 85% vs 'from'
20% here" and rank word swaps by observed success.

Why status, not `successful_assets`:
    `PromptVersion.successful_assets` ("produced an asset") barely discriminates
    — the probe found most fillers at ~100%. The signal that actually moves is
    `generations.status`: completion_rate = completed / (completed + failed).
    `cancelled` and in-flight rows are ignored (user-initiated, not a
    prompt-quality signal).

Why a Wilson lower bound:
    Most slot fillers have only a handful of generations. A raw rate ("1/1 =
    100%") must never read as proven. `wilson_lower` is the conservative score
    the UI should sort/threshold on; `completion_rate` is the headline number.

Attribution-aware induction lives here because it must keep the value→version
mapping that `family_candidates.induce_template_from_texts` discards. The word
alignment is a small self-contained reimplementation so this module does not
couple to that one's in-flight internals.
"""
from __future__ import annotations

import difflib
import math
import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Mapping, Sequence
from uuid import UUID

from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.prompt import PromptVersion

DEFAULT_STABLE_RATIO = 0.6
DEFAULT_MIN_VALUE_GENS = 3
DEFAULT_MAX_CONTEXT_WORDS = 5
_WILSON_Z = 1.96  # 95% one-sided

# Noise pass — two fillers within this difflib ratio (single-token only) are
# treated as the same word (typos: NIBBLE/NIBBBBLE). Multi-word phrases only
# merge via the truncation-prefix rule, never by ratio.
_TYPO_RATIO = 0.88

# Slot kind — what the varying fillers actually are.
KIND_WORD = "word"  # natural-language choices ("through" vs "from")
KIND_DSL = "dsl"  # template-DSL token edits (ACTOR1_MEANS vs ACTOR_1_MEANS)
KIND_MIXED = "mixed"  # a blend of both

_DSL_TOKEN_RE = re.compile(r"[A-Z0-9_]+")
_PUNCT_SPACING_RE = re.compile(r"\s*([^\w\s])\s*")


# ── data shapes ──────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class SlotAttribution:
    """A variable slot plus which versions contributed each filler value."""

    index: int
    prefix: str  # stable words immediately before the slot (display context)
    suffix: str  # stable words immediately after the slot
    value_versions: Mapping[str, tuple[UUID, ...]]


@dataclass(frozen=True)
class ValueOutcome:
    value: str
    versions: int  # distinct prompt versions carrying this filler
    generations: int  # terminal generations (completed + failed)
    completed: int
    failed: int
    completion_rate: float  # headline number
    wilson_lower: float  # conservative score — sort/threshold on this


@dataclass(frozen=True)
class SlotOutcome:
    index: int
    prefix: str
    suffix: str
    values: tuple[ValueOutcome, ...]  # sorted by wilson_lower desc (post noise pass)
    qualifying: int  # values meeting min_value_gens
    best_rate: float
    worst_rate: float
    delta: float  # best - worst completion_rate among qualifying values
    kind: str  # KIND_WORD | KIND_DSL | KIND_MIXED
    interior: bool  # slot has stable context on BOTH sides (not an edge artifact)


# ── pure helpers ─────────────────────────────────────────────────────────────


def wilson_lower_bound(successes: int, total: int, *, z: float = _WILSON_Z) -> float:
    """Lower bound of the Wilson score interval for a binomial proportion."""
    if total <= 0:
        return 0.0
    phat = successes / total
    denom = 1.0 + z * z / total
    centre = phat + z * z / (2 * total)
    margin = z * math.sqrt((phat * (1 - phat) + z * z / (4 * total)) / total)
    return max(0.0, (centre - margin) / denom)


def _norm_key(value: str) -> str:
    """Canonical key for merging fillers that differ only by case / spacing /
    punctuation spacing: 'IS, ACTOR1)' and 'IS,ACTOR1)' collapse to one."""
    s = value.lower().strip()
    s = _PUNCT_SPACING_RE.sub(r"\1", s)  # drop spaces around punctuation
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def _is_truncation(short: str, long_: str) -> bool:
    """short is a mid-word prefix fragment of long_ ('physica' of 'physicality')
    — a difflib truncation artifact — but NOT a word-boundary extension
    ('naked' of 'naked and exposed', which is a real distinct choice)."""
    if not long_.startswith(short):
        return False
    rest = long_[len(short):]
    return bool(rest) and not rest[0].isspace()


def _same_choice(a: str, b: str) -> bool:
    """Whether two normalized fillers are the same underlying choice (one is a
    truncation of the other, or a single-token typo of it)."""
    if a == b:
        return True
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    if _is_truncation(short, long_):
        return True
    if " " not in a and " " not in b:
        return difflib.SequenceMatcher(None, a, b).ratio() >= _TYPO_RATIO
    return False


def _collapse_values(
    value_versions: Mapping[str, tuple[UUID, ...]]
) -> dict[str, tuple[UUID, ...]]:
    """Noise pass: merge spacing/punctuation dupes, then collapse truncation /
    typo cascades so a slot exposes only genuinely distinct alternatives. The
    canonical display per group is the variant with the most versions (then the
    longest text); merged groups union their contributing versions."""
    # 1) exact-normalized merge (whitespace / punctuation / case).
    by_key: dict[str, dict] = {}
    for value, vids in value_versions.items():
        k = _norm_key(value)
        if not k:
            continue
        entry = by_key.setdefault(k, {"display": value, "versions": []})
        entry["versions"].extend(vids)
        if len(value) > len(entry["display"]):
            entry["display"] = value
    items = [(k, e["display"], e["versions"]) for k, e in by_key.items()]
    n = len(items)
    if n <= 1:
        return {d: tuple(v) for _, d, v in items}

    # 2) fuzzy collapse (truncation / typo) via union-find.
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i in range(n):
        for j in range(i + 1, n):
            if _same_choice(items[i][0], items[j][0]):
                ri, rj = find(i), find(j)
                if ri != rj:
                    parent[rj] = ri

    groups: dict[int, list[int]] = defaultdict(list)
    for i in range(n):
        groups[find(i)].append(i)

    out: dict[str, tuple[UUID, ...]] = {}
    for members in groups.values():
        best = max(members, key=lambda i: (len(items[i][2]), len(items[i][1])))
        merged = [v for i in members for v in items[i][2]]
        out[items[best][1]] = tuple(merged)
    return out


def _is_dsl_token(value: str) -> bool:
    """A template-DSL fragment rather than a natural-language phrase: contains
    structural operators, or every word is UPPER_SNAKE."""
    v = value.strip()
    if not v:
        return False
    if any(c in v for c in "=<>[]()*:"):
        return True
    words = v.split()
    return bool(words) and all(_DSL_TOKEN_RE.fullmatch(w) for w in words) and any(
        "_" in w for w in words
    )


def _is_prose(value: str) -> bool:
    """Clean natural-language filler — what a composer suggestion should show.

    Excludes DSL tokens, SCREAMING-CAPS content (the user authors DSL values in
    caps, so an all-caps span is structure, not a prose word choice), and
    keyword LISTS (>= 3 comma-separated items, e.g. 'MOUNT, NIBBLE, NUZZLE')."""
    v = value.strip()
    if not v or _is_dsl_token(v):
        return False
    letters = [c for c in v if c.isalpha()]
    if not letters:
        return False
    if sum(c.isupper() for c in letters) / len(letters) >= 0.5:
        return False
    if len([seg for seg in v.split(",") if seg.strip()]) >= 3:
        return False
    return True


def _classify_slot(values: Sequence[str]) -> str:
    if values and all(_is_dsl_token(v) for v in values):
        return KIND_DSL
    if values and all(_is_prose(v) for v in values):
        return KIND_WORD
    return KIND_MIXED


def _align_index(ops, i: int) -> int:
    """Map a representative word index to the left edge of the member range."""
    for tag, i1, i2, j1, j2 in ops:
        if i < i1:
            return j1
        if i1 <= i < i2:
            return j1 + (i - i1) if tag == "equal" else j1
    return ops[-1][4] if ops else 0


def induce_slots_attributed(
    items: Sequence[tuple[UUID, str]],
    *,
    stable_ratio: float = DEFAULT_STABLE_RATIO,
    max_context_words: int = DEFAULT_MAX_CONTEXT_WORDS,
) -> list[SlotAttribution]:
    """Induce variable slots from related prompts, keeping value→version map.

    representative = longest member (richest skeleton); for every other member,
    word-level difflib opcodes vs the representative. A rep word is "stable"
    when >= stable_ratio of members keep it (in an 'equal' block). Unstable runs
    become slots; each member's aligned fragment is the filler it contributed.

    Empty fillers (a member that deleted the span) are skipped — this prototype
    scores word-vs-word substitutions, not presence/absence. Returns only slots
    that have >= 2 distinct non-empty fillers.
    """
    members = [(vid, t) for vid, t in items if t and t.strip()]
    if len(members) < 2:
        return []
    rep_idx = max(range(len(members)), key=lambda i: len(members[i][1]))
    rep_id, rep = members[rep_idx]
    rep_words = rep.split()
    n = len(rep_words)
    if n == 0:
        return []

    others = [members[i] for i in range(len(members)) if i != rep_idx]
    keep = [0] * n
    member_ops: list[tuple[UUID, list[str], list]] = []
    for vid, t in others:
        ow = t.split()
        ops = difflib.SequenceMatcher(None, rep_words, ow, autojunk=False).get_opcodes()
        member_ops.append((vid, ow, ops))
        for tag, i1, i2, _j1, _j2 in ops:
            if tag == "equal":
                for i in range(i1, i2):
                    keep[i] += 1

    m = len(others)
    stable = [(keep[i] / m) >= stable_ratio for i in range(n)]

    slots: list[SlotAttribution] = []
    i = 0
    slot_index = 0
    while i < n:
        if stable[i]:
            i += 1
            continue
        s = i
        while i < n and not stable[i]:
            i += 1
        e = i
        slot_index += 1

        pre_words: list[str] = []
        j = s - 1
        while j >= 0 and stable[j] and len(pre_words) < max_context_words:
            pre_words.append(rep_words[j])
            j -= 1
        suf_words: list[str] = []
        j = e
        while j < n and stable[j] and len(suf_words) < max_context_words:
            suf_words.append(rep_words[j])
            j += 1

        value_versions: dict[str, list[UUID]] = defaultdict(list)
        rep_val = " ".join(rep_words[s:e]).strip()
        if rep_val:
            value_versions[rep_val].append(rep_id)
        for vid, ow, ops in member_ops:
            v = " ".join(ow[_align_index(ops, s):_align_index(ops, e)]).strip()
            if v:
                value_versions[v].append(vid)

        if len(value_versions) >= 2:
            slots.append(
                SlotAttribution(
                    index=slot_index,
                    prefix=" ".join(reversed(pre_words)),
                    suffix=" ".join(suf_words),
                    value_versions={k: tuple(v) for k, v in value_versions.items()},
                )
            )
    return slots


def build_slot_outcomes(
    slots: Sequence[SlotAttribution],
    status_counts: Mapping[UUID, tuple[int, int]],
    *,
    min_value_gens: int = DEFAULT_MIN_VALUE_GENS,
) -> list[SlotOutcome]:
    """Roll up status-based outcomes per slot filler. `status_counts` maps a
    version id to (completed, failed)."""
    out: list[SlotOutcome] = []
    for slot in slots:
        collapsed = _collapse_values(slot.value_versions)
        if len(collapsed) < 2:
            continue  # noise pass dissolved the variation (all one choice)
        values: list[ValueOutcome] = []
        for value, vids in collapsed.items():
            completed = sum(status_counts.get(v, (0, 0))[0] for v in vids)
            failed = sum(status_counts.get(v, (0, 0))[1] for v in vids)
            total = completed + failed
            values.append(
                ValueOutcome(
                    value=value,
                    versions=len(set(vids)),
                    generations=total,
                    completed=completed,
                    failed=failed,
                    completion_rate=(completed / total) if total else 0.0,
                    wilson_lower=wilson_lower_bound(completed, total),
                )
            )
        values.sort(key=lambda v: (v.wilson_lower, v.generations), reverse=True)
        qualifying = [v for v in values if v.generations >= min_value_gens]
        if len(qualifying) >= 2:
            best = max(q.completion_rate for q in qualifying)
            worst = min(q.completion_rate for q in qualifying)
        else:
            best = qualifying[0].completion_rate if qualifying else 0.0
            worst = best
        out.append(
            SlotOutcome(
                index=slot.index,
                prefix=slot.prefix,
                suffix=slot.suffix,
                values=tuple(values),
                qualifying=len(qualifying),
                best_rate=best,
                worst_rate=worst,
                delta=best - worst,
                kind=_classify_slot([v.value for v in qualifying] or [v.value for v in values]),
                interior=bool(slot.prefix.strip() and slot.suffix.strip()),
            )
        )
    return out


# ── service ──────────────────────────────────────────────────────────────────


class PromptVariantOutcomeService:
    """Computes per-slot, status-based success deltas for a set of versions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def status_counts(
        self, version_ids: Sequence[UUID]
    ) -> dict[UUID, tuple[int, int]]:
        """Map version id -> (completed, failed) terminal generation counts."""
        ids = list({v for v in version_ids})
        if not ids:
            return {}
        sql = text(
            """
            SELECT prompt_version_id AS pv, status, count(*) AS n
            FROM generations
            WHERE prompt_version_id IN :ids
              AND status IN ('completed', 'failed')
            GROUP BY prompt_version_id, status
            """
        ).bindparams(bindparam("ids", expanding=True))
        rows = (await self.db.execute(sql, {"ids": ids})).all()
        counts: dict[UUID, list[int]] = defaultdict(lambda: [0, 0])
        for r in rows:
            counts[r.pv][0 if r.status == "completed" else 1] = int(r.n)
        return {k: (v[0], v[1]) for k, v in counts.items()}

    async def _load_texts(self, version_ids: Sequence[UUID]) -> list[tuple[UUID, str]]:
        rows = (
            await self.db.execute(
                PromptVersion.__table__.select()
                .with_only_columns(PromptVersion.id, PromptVersion.prompt_text)
                .where(PromptVersion.id.in_(list(version_ids)))
                .order_by(PromptVersion.created_at, PromptVersion.id)
            )
        ).all()
        return [(r.id, r.prompt_text or "") for r in rows]

    async def slot_outcomes_for_items(
        self,
        items: Sequence[tuple[UUID, str]],
        status_counts: Mapping[UUID, tuple[int, int]],
        *,
        stable_ratio: float = DEFAULT_STABLE_RATIO,
        min_value_gens: int = DEFAULT_MIN_VALUE_GENS,
    ) -> list[SlotOutcome]:
        """Compute outcomes when texts + status are already in hand (scan path —
        avoids re-querying what the clustering step already loaded)."""
        slots = induce_slots_attributed(items, stable_ratio=stable_ratio)
        return build_slot_outcomes(slots, status_counts, min_value_gens=min_value_gens)

    async def slot_outcomes(
        self,
        version_ids: Sequence[UUID],
        *,
        stable_ratio: float = DEFAULT_STABLE_RATIO,
        min_value_gens: int = DEFAULT_MIN_VALUE_GENS,
    ) -> list[SlotOutcome]:
        """Compute slot outcomes for an explicit set of versions (family path)."""
        items = await self._load_texts(version_ids)
        if len(items) < 2:
            return []
        slots = induce_slots_attributed(items, stable_ratio=stable_ratio)
        all_ids = {vid for slot in slots for vids in slot.value_versions.values() for vid in vids}
        status = await self.status_counts(list(all_ids))
        return build_slot_outcomes(slots, status, min_value_gens=min_value_gens)
