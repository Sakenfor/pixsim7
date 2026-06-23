#!/usr/bin/env python3
"""Read-only probe: induce a template (stable skeleton + variable slots) from a
set of related prompts — the "reverse" of similarity search.

PROTOTYPE / DRY-RUN ONLY — never writes. Given a cluster of near-duplicate
prompts, it finds the parts that change LEAST (the reusable skeleton) and the
spans that vary (the slots you actually tweak), plus a few sampled values per
slot. Goal: eyeball whether induced templates are sane on real data before any
UI / variable-extraction wiring (see the template-induction design discussion).

The prompts do NOT need to belong to a family. By default it pools from
ungrouped near-duplicates using the same clustering as the family-candidates
feature (PromptFamilyCandidateService.find_candidates). Pass --family-id to
induce from an existing family's versions instead.

Method (cheap, no multiple-sequence alignment):
  - representative = the longest member (most complete skeleton)
  - for each other member, difflib word-level opcodes vs the representative
  - per rep token: fraction of members that KEEP it (an 'equal' block) = stability
  - stable run (>= --stable-ratio) -> skeleton text; unstable run -> ⟨slot⟩,
    with member fragments aligned to that run sampled as the slot's values

Usage:
    python tools/probe_prompt_template_induction.py                 # top clusters (ungrouped)
    python tools/probe_prompt_template_induction.py --top 5 --seed-limit 1500
    python tools/probe_prompt_template_induction.py --family-id <uuid>
    python tools/probe_prompt_template_induction.py --stable-ratio 0.7 --max-template-tokens 160

Requires DATABASE_URL (or PIXSIM_DATABASE_URL) in env or .env file.
"""
from __future__ import annotations

import argparse
import asyncio
import difflib
import os
import sys
from uuid import UUID

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from pixsim7.backend.main.domain.prompt import PromptVersion
from pixsim7.backend.main.services.prompt.family_candidates import (
    PromptFamilyCandidateService,
)


def _get_database_url() -> str:
    from pixsim7.backend.main.shared.config import settings

    return settings.async_database_url


# ── template induction ───────────────────────────────────────────────────────


def _map_index(ops, i: int) -> int:
    """Map a representative word index to the left edge of the aligned member range."""
    for tag, i1, i2, j1, j2 in ops:
        if i < i1:
            return j1
        if i1 <= i < i2:
            return j1 + (i - i1) if tag == "equal" else j1
    return ops[-1][4] if ops else 0


def induce_template(texts: list[str], *, stable_ratio: float) -> dict | None:
    """Return {rep, template_tokens, slots, stable_pct} or None if too few members."""
    members = [t for t in texts if t and t.strip()]
    if len(members) < 2:
        return None
    rep = max(members, key=len)
    rep_words = rep.split()
    others = [t for t in members if t is not rep]
    n = len(rep_words)
    if n == 0:
        return None

    keep = [0] * n
    member_ops = []
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

    template_tokens: list[str] = []
    slots: list[list[str]] = []
    i = 0
    while i < n:
        if stable[i]:
            template_tokens.append(rep_words[i])
            i += 1
            continue
        s = i
        while i < n and not stable[i]:
            i += 1
        e = i
        template_tokens.append(f"⟨{len(slots) + 1}⟩")
        variants: list[str] = []
        seen: set[str] = set()

        def _add(v: str) -> None:
            v = v.strip()
            if v and v not in seen:
                seen.add(v)
                variants.append(v)

        _add(" ".join(rep_words[s:e]))  # the representative's own value
        for ow, ops in member_ops:
            frag = " ".join(ow[_map_index(ops, s):_map_index(ops, e)])
            _add(frag)
        slots.append(variants)

    stable_pct = round(100 * sum(stable) / n)
    return {"rep": rep, "template_tokens": template_tokens, "slots": slots, "stable_pct": stable_pct}


# ── rendering ────────────────────────────────────────────────────────────────


def _print_induction(label: str, texts: list[str], args: argparse.Namespace) -> None:
    result = induce_template(texts, stable_ratio=args.stable_ratio)
    if not result:
        print(f"\n{label}: too few members to induce a template.")
        return
    toks = result["template_tokens"]
    slots = result["slots"]
    shown = toks[: args.max_template_tokens]
    ellipsis = " …" if len(toks) > args.max_template_tokens else ""
    print(
        f"\n{'='*92}\n{label}\n"
        f"  members={len(texts)}  stable={result['stable_pct']}%  slots={len(slots)}\n{'-'*92}"
    )
    print("  TEMPLATE:")
    print("   ", " ".join(shown) + ellipsis)
    print("  SLOTS (sampled values):")
    for idx, variants in enumerate(slots[: args.max_slots], 1):
        sample = variants[: args.max_variants]
        rendered = "  |  ".join(v[:60] for v in sample)
        more = f"  (+{len(variants) - len(sample)} more)" if len(variants) > len(sample) else ""
        print(f"    ⟨{idx}⟩ {rendered}{more}")
    if len(slots) > args.max_slots:
        print(f"    … and {len(slots) - args.max_slots} more slots")


async def run(args: argparse.Namespace) -> None:
    engine = create_async_engine(_get_database_url(), echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        if args.family_id:
            rows = (
                await db.execute(
                    select(PromptVersion.prompt_text)
                    .where(PromptVersion.family_id == UUID(args.family_id))
                    .order_by(PromptVersion.created_at)
                )
            ).scalars().all()
            texts = [t for t in rows if t]
            print(f"Family {args.family_id}: {len(texts)} versions")
            _print_induction(f"Family {args.family_id}", texts, args)
        else:
            svc = PromptFamilyCandidateService(db)
            seed = args.seed_limit if args.seed_limit > 0 else None
            print(f"Clustering ungrouped near-duplicates (seed_limit={seed or 'all'})…")
            cands = await svc.find_candidates(seed_limit=seed, max_clusters=args.top)
            print(f"{len(cands)} candidate clusters; inducing templates for top {args.top}.")
            for i, c in enumerate(cands[: args.top], 1):
                texts = [m.prompt_text for m in c.members]
                label = (
                    f"Cluster #{i}  [{c.label}]  success={c.total_successful_assets}  "
                    f"title≈{c.suggested_title!r}"
                )
                _print_induction(label, texts, args)

    await engine.dispose()
    print(f"\n{'='*92}\nDry run only — nothing written.\n")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--family-id", type=str, default=None, help="Induce from an existing family instead of clusters")
    p.add_argument("--seed-limit", type=int, default=1500, help="Cluster seed cap (0 = all); ignored with --family-id")
    p.add_argument("--top", type=int, default=6, help="How many clusters to induce")
    p.add_argument("--stable-ratio", type=float, default=0.6, help="Min keep-fraction for a token to count as skeleton")
    p.add_argument("--max-template-tokens", type=int, default=140)
    p.add_argument("--max-slots", type=int, default=12)
    p.add_argument("--max-variants", type=int, default=5)
    args = p.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
