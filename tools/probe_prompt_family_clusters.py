#!/usr/bin/env python3
"""Read-only probe: find candidate prompt "families" among ungrouped versions.

PROTOTYPE / DRY-RUN ONLY — never writes. The goal is to eyeball whether the
embedding + lexical thresholds carve the prompt library into sane "minor-tweak"
clusters before we build any clustering job or UI (see the prompt-family
auto-grouping design discussion).

Approach (the recommended two-signal method):
  1. Candidate retrieval — for each ungrouped version (family_id IS NULL) pull
     its top-k nearest neighbors by prompt-embedding cosine distance, using the
     HNSW index via a correlated LATERAL join (cheap; no O(n^2) pairwise).
  2. Tweak confirmation — keep an edge only if the two prompts also clear a
     LEXICAL bar (token-set Jaccard by default — minor tweaks share almost all
     words). This is what separates "same prompt, tweaked" from "merely a
     semantic neighbor".
  3. Cluster — union-find over the surviving edges → connected components.
     Neighbors that already belong to a family are included, so a cluster can
     reveal "these N orphans look like family X".
  4. Rank — by groupable success (sum of successful_assets across the cluster)
     then size, so the clusters worth grouping float to the top.

Usage:
    python tools/probe_prompt_family_clusters.py                       # all ungrouped, defaults
    python tools/probe_prompt_family_clusters.py --limit 2000          # sample 2000 newest (fast first look)
    python tools/probe_prompt_family_clusters.py --cosine-floor 0.82 --lexical-floor 0.85
    python tools/probe_prompt_family_clusters.py --lexical-method combined --top 40
    python tools/probe_prompt_family_clusters.py --include-grouped      # also seed from already-grouped versions

Tuning knobs:
    --cosine-floor   min embedding cosine similarity for a candidate edge (default 0.80)
    --lexical-floor  min lexical similarity to confirm a "tweak" edge       (default 0.85)
    --lexical-method jaccard (fast, cached) | combined | sequence | ngram   (default jaccard)
    --k              neighbors fetched per seed from the index              (default 8)
    --limit          only seed from N newest ungrouped versions, 0 = all    (default 0)
    --min-size       only report clusters with >= this many members         (default 2)
    --top            how many top clusters to print in detail               (default 25)

Requires DATABASE_URL (or PIXSIM_DATABASE_URL) in env or .env file.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from pixsim7.backend.main.services.prompt.utils.similarity import calculate_text_similarity


# ── lexical helpers (token sets cached per version) ──────────────────────────

_PUNCT_RE = re.compile(r"[^\w\s]")


def _tokens(text: str) -> frozenset:
    return frozenset(t for t in _PUNCT_RE.sub(" ", text.lower()).split() if t)


def _jaccard(a: frozenset, b: frozenset) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    inter = len(a & b)
    return inter / (len(a) + len(b) - inter)


# ── union-find ───────────────────────────────────────────────────────────────


class _UnionFind:
    def __init__(self) -> None:
        self.parent: dict = {}

    def find(self, x):
        self.parent.setdefault(x, x)
        root = x
        while self.parent[root] != root:
            root = self.parent[root]
        while self.parent[x] != root:  # path compression
            self.parent[x], x = root, self.parent[x]
        return root

    def union(self, a, b) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[rb] = ra


def _get_database_url() -> str:
    from pixsim7.backend.main.shared.config import settings

    return settings.async_database_url


def _snippet(text: str, n: int = 150) -> str:
    s = " ".join(text.split())
    return s if len(s) <= n else s[: n - 1] + "…"


async def probe(args: argparse.Namespace) -> None:
    engine = create_async_engine(_get_database_url(), echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    include_grouped = args.include_grouped
    limit_clause = f"LIMIT {int(args.limit)}" if args.limit and args.limit > 0 else ""
    seed_family_filter = "" if include_grouped else "AND family_id IS NULL"

    edge_sql = text(
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

    async with async_session() as session:
        # Load every embedded version's metadata (neighbors may be grouped).
        rows = (
            await session.execute(
                text(
                    """
                    SELECT id, prompt_text, COALESCE(successful_assets, 0) AS succ,
                           COALESCE(generation_count, 0) AS gens, family_id
                    FROM prompt_versions
                    WHERE embedding IS NOT NULL
                    """
                )
            )
        ).all()
        info: dict = {}
        toks: dict = {}
        for r in rows:
            info[r.id] = {"text": r.prompt_text or "", "succ": int(r.succ),
                          "gens": int(r.gens), "family_id": r.family_id}
            toks[r.id] = _tokens(r.prompt_text or "")
        print(f"Embedded prompt versions loaded: {len(info)}")

        fam_titles = {
            row.id: row.title
            for row in (
                await session.execute(text("SELECT id, title FROM prompt_families"))
            ).all()
        }

        seeds = "all embedded" if include_grouped else "ungrouped (family_id IS NULL)"
        print(
            f"Seeding from: {seeds}"
            + (f", newest {args.limit}" if limit_clause else "")
            + f" | k={args.k} cosine≥{args.cosine_floor} "
            f"lexical≥{args.lexical_floor} ({args.lexical_method})\n"
        )
        print("Running k-NN over the HNSW index… (this can take a bit on a full run)")
        edge_rows = (await session.execute(edge_sql, {"k": args.k})).all()

    await engine.dispose()

    # ── filter edges: cosine floor, then lexical "tweak" confirmation ──
    raw = 0
    cosine_ok = 0
    uf = _UnionFind()
    kept_pairs = 0
    seen_pair: set = set()
    for r in edge_rows:
        raw += 1
        src, nbr = r.src, r.nbr
        if src not in info or nbr not in info:
            continue
        cos = 1.0 - float(r.dist)
        if cos < args.cosine_floor:
            continue
        cosine_ok += 1
        key = (src, nbr) if str(src) < str(nbr) else (nbr, src)
        if key in seen_pair:
            continue
        seen_pair.add(key)
        if args.lexical_method == "jaccard":
            lex = _jaccard(toks[src], toks[nbr])
        else:
            lex = calculate_text_similarity(
                info[src]["text"][: args.lexical_maxchars],
                info[nbr]["text"][: args.lexical_maxchars],
                method=args.lexical_method,
            )
        if lex < args.lexical_floor:
            continue
        kept_pairs += 1
        uf.union(src, nbr)

    print(
        f"\nEdges: {raw} raw k-NN → {cosine_ok} pass cosine → "
        f"{kept_pairs} pass lexical (unique pairs)\n"
    )

    # ── assemble clusters ──
    clusters: dict = defaultdict(list)
    for node in uf.parent:
        clusters[uf.find(node)].append(node)

    sized = [members for members in clusters.values() if len(members) >= args.min_size]
    if not sized:
        print("No clusters at these thresholds. Try lowering --lexical-floor or --cosine-floor.")
        return

    nodes_clustered = sum(len(m) for m in sized)
    size_hist = Counter(len(m) for m in sized)
    print(f"Clusters (size ≥ {args.min_size}): {len(sized)} "
          f"covering {nodes_clustered} versions")
    print("Size distribution: "
          + ", ".join(f"{sz}×{cnt}" for sz, cnt in sorted(size_hist.items())) + "\n")

    def cluster_stats(members: list) -> dict:
        succ = sum(info[m]["succ"] for m in members)
        gens = sum(info[m]["gens"] for m in members)
        fams = Counter(
            info[m]["family_id"] for m in members if info[m]["family_id"] is not None
        )
        # Canonical/representative: most successful, then most generations, then longest.
        rep = max(members, key=lambda m: (info[m]["succ"], info[m]["gens"], len(info[m]["text"])))
        return {"succ": succ, "gens": gens, "fams": fams, "rep": rep}

    ranked = sorted(
        sized,
        key=lambda m: (cluster_stats(m)["succ"], len(m), cluster_stats(m)["gens"]),
        reverse=True,
    )

    print(f"{'='*88}\nTOP {min(args.top, len(ranked))} CANDIDATE FAMILIES "
          f"(ranked by groupable success, then size)\n{'='*88}")
    for i, members in enumerate(ranked[: args.top], 1):
        st = cluster_stats(members)
        fam_note = ""
        if st["fams"]:
            parts = []
            for fid, c in st["fams"].most_common(2):
                parts.append(f"{fam_titles.get(fid, str(fid)[:8])}×{c}")
            ungrouped = sum(1 for m in members if info[m]["family_id"] is None)
            fam_note = f"  existing-families: {', '.join(parts)} (+{ungrouped} ungrouped)"
        print(
            f"\n#{i}  size={len(members)}  success={st['succ']}  gens={st['gens']}{fam_note}"
        )
        rep = st["rep"]
        print(f"   rep [{info[rep]['succ']}✓]: {_snippet(info[rep]['text'])}")
        others = [m for m in members if m != rep]
        others.sort(key=lambda m: (info[m]["succ"], info[m]["gens"]), reverse=True)
        for m in others[:4]:
            print(f"        [{info[m]['succ']}✓]: {_snippet(info[m]['text'], 110)}")
        if len(others) > 4:
            print(f"        … and {len(others) - 4} more")

    print(
        f"\n{'='*88}\nDry run only — nothing written. "
        f"Adjust --cosine-floor / --lexical-floor / --lexical-method and re-run "
        f"to tune cluster tightness.\n"
    )


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--cosine-floor", type=float, default=0.80)
    p.add_argument("--lexical-floor", type=float, default=0.85)
    p.add_argument(
        "--lexical-method",
        choices=["jaccard", "combined", "sequence", "ngram"],
        default="jaccard",
    )
    p.add_argument("--lexical-maxchars", type=int, default=2000,
                   help="Cap text length for non-jaccard lexical methods (cost guard)")
    p.add_argument("--k", type=int, default=8)
    p.add_argument("--limit", type=int, default=0, help="Seed from N newest ungrouped versions (0 = all)")
    p.add_argument("--min-size", type=int, default=2, dest="min_size")
    p.add_argument("--top", type=int, default=25)
    p.add_argument("--include-grouped", action="store_true",
                   help="Also seed from versions that already have a family")
    args = p.parse_args()
    asyncio.run(probe(args))


if __name__ == "__main__":
    main()
