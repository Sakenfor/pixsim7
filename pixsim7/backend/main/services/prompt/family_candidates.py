"""Prompt family candidates — cluster near-duplicate / minor-tweak prompt
versions into candidate families for human review.

Productionizes the read-only probe (`tools/probe_prompt_family_clusters.py`)
into a service the candidate-families endpoint/view can call. Plan:
`prompt-family-candidates`, checkpoint `clustering-service`.

Two-signal clustering:
  1. Candidate retrieval — for each ungrouped (or all) version, top-k nearest
     neighbors by `PromptVersion.embedding` cosine via the HNSW index
     (correlated LATERAL; no O(n^2) pairwise). `_knn_edges`.
  2. Tweak confirmation — keep an edge only if the pair also clears a LEXICAL
     bar (token-set Jaccard by default). This separates "same prompt, tweaked"
     from "merely a semantic neighbor". `_passes_lexical`.
  3. Cluster + shape — union-find over surviving edges → connected components,
     ranked by groupable success. Pure, DB-free: `cluster_candidates`.

"Minor tweak" is a lexical notion, not a semantic one — embedding cosine finds
*related* prompts but over-groups distinct scenes, so the lexical confirm is
load-bearing. See the plan's probe findings (heavily-templated DSL prompts form
large clusters even at high lexical floors; those are labeled `template_cluster`
rather than `tweak_family`).

Single-embedder assumption: neighbors are not filtered by `embedding_model`, so
all prompt embeddings are assumed to share one vector space (true today). A
second text embedder would require a model-match guard in `_knn_edges`.
"""
from __future__ import annotations

import difflib
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Iterable, Mapping, Sequence
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.prompt import PromptVersion
from pixsim7.backend.main.services.prompt.utils.similarity import (
    calculate_text_similarity,
    extract_keywords,
)

# Probe-tuned defaults (see plan prompt-family-candidates).
DEFAULT_COSINE_FLOOR = 0.80
DEFAULT_LEXICAL_FLOOR = 0.85
DEFAULT_K = 8
DEFAULT_MIN_SIZE = 2
DEFAULT_MAX_CLUSTERS = 50
# Clusters at/above this size are labeled template/category rather than a
# minor-tweak family (the templated-DSL over-merge finding from the probe).
DEFAULT_LARGE_CLUSTER_SIZE = 30
# Cost guard for the non-jaccard lexical methods (SequenceMatcher is O(n^2)).
_LEXICAL_MAXCHARS = 2000

LABEL_TWEAK_FAMILY = "tweak_family"
LABEL_TEMPLATE_CLUSTER = "template_cluster"

_LEXICAL_METHODS = ("jaccard", "combined", "sequence", "ngram")
_PUNCT_RE = re.compile(r"[^\w\s]")


# ── data shapes ──────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class CandidateMember:
    version_id: UUID
    prompt_text: str
    successful_assets: int
    generation_count: int
    family_id: UUID | None


@dataclass(frozen=True)
class FamilyCandidate:
    """One candidate family — a cluster of near-duplicate versions."""

    representative: CandidateMember
    members: tuple[CandidateMember, ...]  # representative first, then by success desc
    total_successful_assets: int
    total_generation_count: int
    # (family_id, member_count) for families already present among members,
    # most common first — surfaces "these N orphans look like family X".
    existing_families: tuple[tuple[UUID, int], ...]
    suggested_title: str
    label: str  # LABEL_TWEAK_FAMILY | LABEL_TEMPLATE_CLUSTER

    @property
    def size(self) -> int:
        return len(self.members)


@dataclass(frozen=True)
class TemplateSlot:
    index: int
    values: tuple[str, ...]  # sampled distinct values (capped)
    total: int  # distinct values seen across members (>= len(values))


@dataclass(frozen=True)
class TemplateSegment:
    kind: str  # "text" (stable skeleton run) | "slot" (variable span)
    text: str | None = None
    slot: TemplateSlot | None = None


@dataclass(frozen=True)
class InducedTemplate:
    """A skeleton + variable slots induced from a set of related prompts (the
    "reverse" of similarity: what changes least vs the spans that vary)."""

    member_count: int
    stable_pct: int
    slot_count: int
    segments: tuple[TemplateSegment, ...]


# ── template induction (pure, DB-free, unit-testable) ───────────────────────


def _align_left(ops, i: int) -> int:
    """Map a representative word index to the left edge of the aligned member range."""
    for tag, i1, i2, j1, j2 in ops:
        if i < i1:
            return j1
        if i1 <= i < i2:
            return j1 + (i - i1) if tag == "equal" else j1
    return ops[-1][4] if ops else 0


def induce_template_from_texts(
    texts: Sequence[str],
    *,
    stable_ratio: float = 0.6,
    max_variants: int = 8,
) -> InducedTemplate | None:
    """Induce a template from a set of related prompts.

    representative = longest member (most complete skeleton); for each other
    member, difflib word-level opcodes vs the representative; a rep token is
    "stable" when kept (in an 'equal' block) by >= stable_ratio of members.
    Stable runs become text segments; unstable runs become slots, with member
    fragments aligned to the run sampled as the slot's values.
    """
    members = [t for t in texts if t and t.strip()]
    if len(members) < 2:
        return None
    # Pick the representative by index (not identity): identical prompts may be
    # interned to the same object, which would wrongly drop duplicate members.
    rep_idx = max(range(len(members)), key=lambda i: len(members[i]))
    rep = members[rep_idx]
    rep_words = rep.split()
    n = len(rep_words)
    if n == 0:
        return None

    others = [members[i] for i in range(len(members)) if i != rep_idx]
    keep = [0] * n
    member_ops: list[tuple[list[str], list]] = []
    for t in others:
        ow = t.split()
        ops = difflib.SequenceMatcher(None, rep_words, ow, autojunk=False).get_opcodes()
        member_ops.append((ow, ops))
        for tag, i1, i2, _j1, _j2 in ops:
            if tag == "equal":
                for i in range(i1, i2):
                    keep[i] += 1

    m = len(others)
    stable = [(keep[i] / m) >= stable_ratio for i in range(n)]

    segments: list[TemplateSegment] = []
    text_buf: list[str] = []
    slot_count = 0
    i = 0
    while i < n:
        if stable[i]:
            text_buf.append(rep_words[i])
            i += 1
            continue
        if text_buf:
            segments.append(TemplateSegment(kind="text", text=" ".join(text_buf)))
            text_buf = []
        s = i
        while i < n and not stable[i]:
            i += 1
        e = i
        slot_count += 1
        seen: list[str] = []
        seen_set: set[str] = set()

        def _add(words: list[str]) -> None:
            v = " ".join(words).strip()
            if v and v not in seen_set:
                seen_set.add(v)
                seen.append(v)

        _add(rep_words[s:e])  # the representative's own value
        for ow, ops in member_ops:
            _add(ow[_align_left(ops, s):_align_left(ops, e)])
        segments.append(
            TemplateSegment(
                kind="slot",
                slot=TemplateSlot(index=slot_count, values=tuple(seen[:max_variants]), total=len(seen)),
            )
        )
    if text_buf:
        segments.append(TemplateSegment(kind="text", text=" ".join(text_buf)))

    return InducedTemplate(
        member_count=len(members),
        stable_pct=round(100 * sum(stable) / n),
        slot_count=slot_count,
        segments=tuple(segments),
    )


# ── lexical helpers ──────────────────────────────────────────────────────────


def _token_set(text_value: str) -> frozenset[str]:
    return frozenset(t for t in _PUNCT_RE.sub(" ", text_value.lower()).split() if t)


def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    inter = len(a & b)
    return inter / (len(a) + len(b) - inter)


# ── pure clustering core (DB-free, unit-testable) ───────────────────────────


class _UnionFind:
    def __init__(self) -> None:
        self._parent: dict[UUID, UUID] = {}

    def find(self, x: UUID) -> UUID:
        self._parent.setdefault(x, x)
        root = x
        while self._parent[root] != root:
            root = self._parent[root]
        while self._parent[x] != root:  # path compression
            self._parent[x], x = root, self._parent[x]
        return root

    def union(self, a: UUID, b: UUID) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self._parent[rb] = ra

    @property
    def nodes(self) -> Iterable[UUID]:
        return self._parent.keys()


def _suggested_title(rep: CandidateMember) -> str:
    keywords = extract_keywords(rep.prompt_text, top_n=5)
    if keywords:
        return " ".join(keywords).title()
    snippet = " ".join(rep.prompt_text.split())
    return snippet[:60] if snippet else "Untitled family"


def cluster_candidates(
    versions: Mapping[UUID, CandidateMember],
    edges: Iterable[tuple[UUID, UUID]],
    *,
    min_size: int = DEFAULT_MIN_SIZE,
    max_clusters: int = DEFAULT_MAX_CLUSTERS,
    large_cluster_size: int = DEFAULT_LARGE_CLUSTER_SIZE,
) -> list[FamilyCandidate]:
    """Union-find over confirmed `edges` → ranked candidate families.

    Pure: `edges` are pairs that already passed the cosine + lexical filters,
    and `versions` maps every referenced id to its metadata. No DB access — the
    SQL/lexical stages live in `PromptFamilyCandidateService`.
    """
    uf = _UnionFind()
    for a, b in edges:
        if a in versions and b in versions:
            uf.union(a, b)

    components: dict[UUID, list[UUID]] = defaultdict(list)
    for node in uf.nodes:
        components[uf.find(node)].append(node)

    candidates: list[FamilyCandidate] = []
    for member_ids in components.values():
        if len(member_ids) < min_size:
            continue
        members = [versions[i] for i in member_ids]
        # Canonical/representative: most successful, then most generations, then
        # longest text (matches the dedup tool's "prefer the richest" instinct).
        members.sort(
            key=lambda m: (m.successful_assets, m.generation_count, len(m.prompt_text)),
            reverse=True,
        )
        rep = members[0]
        fam_counts = Counter(m.family_id for m in members if m.family_id is not None)
        candidates.append(
            FamilyCandidate(
                representative=rep,
                members=tuple(members),
                total_successful_assets=sum(m.successful_assets for m in members),
                total_generation_count=sum(m.generation_count for m in members),
                existing_families=tuple(fam_counts.most_common()),
                suggested_title=_suggested_title(rep),
                label=(
                    LABEL_TEMPLATE_CLUSTER
                    if len(members) >= large_cluster_size
                    else LABEL_TWEAK_FAMILY
                ),
            )
        )

    # Rank by groupable success, then size, then total generations.
    candidates.sort(
        key=lambda c: (c.total_successful_assets, c.size, c.total_generation_count),
        reverse=True,
    )
    return candidates[:max_clusters]


# ── service ──────────────────────────────────────────────────────────────────


@dataclass
class _Edge:
    src: UUID
    nbr: UUID
    cosine: float


class PromptFamilyCandidateService:
    """Computes candidate prompt families from the embedding + lexical signals."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_candidates(
        self,
        *,
        cosine_floor: float = DEFAULT_COSINE_FLOOR,
        lexical_floor: float = DEFAULT_LEXICAL_FLOOR,
        lexical_method: str = "jaccard",
        k: int = DEFAULT_K,
        seed_limit: int | None = None,
        include_grouped: bool = False,
        min_size: int = DEFAULT_MIN_SIZE,
        max_clusters: int = DEFAULT_MAX_CLUSTERS,
        large_cluster_size: int = DEFAULT_LARGE_CLUSTER_SIZE,
    ) -> list[FamilyCandidate]:
        """Find candidate families.

        seed_limit: seed only from the N newest candidate versions (None = all).
        include_grouped: also seed from versions that already have a family.
        """
        if lexical_method not in _LEXICAL_METHODS:
            raise ValueError(f"lexical_method must be one of {_LEXICAL_METHODS}")

        raw = await self._knn_edges(k=k, seed_limit=seed_limit, include_grouped=include_grouped)

        # Cosine floor (cosine similarity = 1 - distance), dedup undirected pairs.
        seen: set[tuple[UUID, UUID]] = set()
        cosine_edges: list[tuple[UUID, UUID]] = []
        node_ids: set[UUID] = set()
        for e in raw:
            if e.cosine < cosine_floor:
                continue
            key = (e.src, e.nbr) if str(e.src) < str(e.nbr) else (e.nbr, e.src)
            if key in seen:
                continue
            seen.add(key)
            cosine_edges.append(key)
            node_ids.add(e.src)
            node_ids.add(e.nbr)

        if not node_ids:
            return []

        versions = await self._load_members(node_ids)

        # Lexical confirmation (the "minor tweak" gate).
        token_cache: dict[UUID, frozenset[str]] = {}
        kept: list[tuple[UUID, UUID]] = []
        for a, b in cosine_edges:
            if a not in versions or b not in versions:
                continue
            if self._passes_lexical(a, b, versions, lexical_method, lexical_floor, token_cache):
                kept.append((a, b))

        return cluster_candidates(
            versions,
            kept,
            min_size=min_size,
            max_clusters=max_clusters,
            large_cluster_size=large_cluster_size,
        )

    # ----- internals -----

    @staticmethod
    def _passes_lexical(
        a: UUID,
        b: UUID,
        versions: Mapping[UUID, CandidateMember],
        method: str,
        floor: float,
        token_cache: dict[UUID, frozenset[str]],
    ) -> bool:
        if method == "jaccard":
            for node in (a, b):
                if node not in token_cache:
                    token_cache[node] = _token_set(versions[node].prompt_text)
            return _jaccard(token_cache[a], token_cache[b]) >= floor
        sim = calculate_text_similarity(
            versions[a].prompt_text[:_LEXICAL_MAXCHARS],
            versions[b].prompt_text[:_LEXICAL_MAXCHARS],
            method=method,
        )
        return sim >= floor

    async def _knn_edges(
        self, *, k: int, seed_limit: int | None, include_grouped: bool
    ) -> list[_Edge]:
        """Top-k embedding neighbors per seed via the HNSW index (LATERAL).

        `seed_family_filter` / `limit_clause` are built from validated ints/bools,
        not user text — safe to interpolate.
        """
        seed_family_filter = "" if include_grouped else "AND family_id IS NULL"
        limit_clause = f"LIMIT {int(seed_limit)}" if seed_limit and seed_limit > 0 else ""
        sql = text(
            f"""
            SELECT v.id AS src, n.id AS nbr, (n.embedding <=> v.embedding) AS dist
            FROM (
                SELECT id, embedding
                FROM prompt_versions
                WHERE embedding IS NOT NULL
                  {seed_family_filter}
                ORDER BY created_at DESC
                {limit_clause}
            ) v
            CROSS JOIN LATERAL (
                SELECT p.id, p.embedding
                FROM prompt_versions p
                WHERE p.id <> v.id AND p.embedding IS NOT NULL
                ORDER BY p.embedding <=> v.embedding
                LIMIT :k
            ) n
            """
        )
        rows = (await self.db.execute(sql, {"k": int(k)})).all()
        return [_Edge(src=r.src, nbr=r.nbr, cosine=1.0 - float(r.dist)) for r in rows]

    async def promote_to_family(
        self,
        *,
        version_ids: list[UUID],
        family_id: UUID | None = None,
        title: str | None = None,
        prompt_type: str = "visual",
        category: str | None = None,
    ) -> dict:
        """Group a candidate cluster into a family (the confirm-write action).

        family_id None  -> create a new family (title required) and assign.
        family_id given -> merge the cluster into that existing family.

        Only currently-ungrouped versions are moved (already-grouped members are
        left where they are and reported as skipped). Versions are ordered by
        created_at and given sequential version_numbers from the family's next
        number; any whose prompt_hash already exists in the target family (or
        repeats within the batch) is skipped to respect the (prompt_hash,
        family_id) uniqueness constraint.
        """
        if not version_ids:
            raise ValueError("version_ids is required")

        # Lazy imports avoid a service import cycle.
        from pixsim7.backend.main.services.prompt.family import PromptFamilyService
        from pixsim7.backend.main.services.prompt.git.versioning_adapter import (
            PromptVersioningService,
        )

        rows = (
            await self.db.execute(
                select(PromptVersion)
                .where(PromptVersion.id.in_(version_ids))
                .order_by(PromptVersion.created_at, PromptVersion.id)
            )
        ).scalars().all()

        created = False
        if family_id is None:
            if not title or not title.strip():
                raise ValueError("title is required when creating a new family")
            family = await PromptFamilyService(self.db).create_family(
                title=title.strip(), prompt_type=prompt_type, category=category
            )
            family_id = family.id
            created = True
            existing_hashes: set[str] = set()
        else:
            family = await PromptFamilyService(self.db).get_family(family_id)
            if family is None:
                raise LookupError(f"Prompt family {family_id} not found")
            existing_hashes = set(
                (
                    await self.db.execute(
                        select(PromptVersion.prompt_hash).where(
                            PromptVersion.family_id == family_id
                        )
                    )
                ).scalars().all()
            )

        next_number = await PromptVersioningService(self.db).get_next_version_number(
            family_id, lock=True
        )

        skipped_grouped = 0
        skipped_duplicate = 0
        assigned = 0
        seen = set(existing_hashes)
        for v in rows:
            if v.family_id is not None:
                skipped_grouped += 1
                continue
            if v.prompt_hash in seen:
                skipped_duplicate += 1
                continue
            seen.add(v.prompt_hash)
            v.family_id = family_id
            v.version_number = next_number
            v.parent_version_id = None
            next_number += 1
            assigned += 1

        await self.db.commit()
        return {
            "family_id": str(family_id),
            "title": family.title,
            "created": created,
            "assigned": assigned,
            "skipped_grouped": skipped_grouped,
            "skipped_duplicate": skipped_duplicate,
        }

    async def induce_template(
        self,
        version_ids: list[UUID],
        *,
        stable_ratio: float = 0.6,
        max_variants: int = 8,
    ) -> InducedTemplate | None:
        """Induce a skeleton+slots template from the given versions' prompt text.

        Works on any set of versions (ungrouped cluster or an existing family) —
        no family membership required. See induce_template_from_texts.
        """
        if not version_ids:
            return None
        rows = (
            await self.db.execute(
                select(PromptVersion.prompt_text)
                .where(PromptVersion.id.in_(version_ids))
                .order_by(PromptVersion.created_at, PromptVersion.id)
            )
        ).scalars().all()
        return induce_template_from_texts(
            [t for t in rows if t],
            stable_ratio=stable_ratio,
            max_variants=max_variants,
        )

    async def _load_members(self, ids: set[UUID]) -> dict[UUID, CandidateMember]:
        result = await self.db.execute(
            select(
                PromptVersion.id,
                PromptVersion.prompt_text,
                PromptVersion.successful_assets,
                PromptVersion.generation_count,
                PromptVersion.family_id,
            ).where(PromptVersion.id.in_(ids))
        )
        return {
            row.id: CandidateMember(
                version_id=row.id,
                prompt_text=row.prompt_text or "",
                successful_assets=int(row.successful_assets or 0),
                generation_count=int(row.generation_count or 0),
                family_id=row.family_id,
            )
            for row in result.all()
        }
