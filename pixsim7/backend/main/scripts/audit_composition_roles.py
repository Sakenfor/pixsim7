"""Audit composition-role inference across all content packs.

Runs ``infer_composition_role()`` on every slot in every template and reports
coverage gaps (unknown / ambiguous results) so we can expand the mapping table.

Usage:
    python -m pixsim7.backend.main.scripts.audit_composition_roles
    python -m pixsim7.backend.main.scripts.audit_composition_roles --pack dane
    python -m pixsim7.backend.main.scripts.audit_composition_roles --only-gaps
"""

from __future__ import annotations

import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from pixsim7.backend.main.services.prompt.block.composition_role_inference import (
    CompositionRoleInference,
    InferenceConfidence,
    infer_composition_role,
)
from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
    CONTENT_PACKS_DIR,
    discover_content_packs,
    parse_templates,
)


# ── Data structures ──────────────────────────────────────────────────────────


@dataclass
class SlotResult:
    pack: str
    template_slug: str
    slot_index: int
    role: str | None
    category: str | None
    tag_keys: list[str]
    inference: CompositionRoleInference


@dataclass
class PackStats:
    total: int = 0
    by_confidence: dict[InferenceConfidence, int] = field(
        default_factory=lambda: defaultdict(int),
    )
    gaps: list[SlotResult] = field(default_factory=list)


# ── Core logic ───────────────────────────────────────────────────────────────


def audit_pack(pack_name: str) -> PackStats:
    content_dir = CONTENT_PACKS_DIR / pack_name
    templates = parse_templates(content_dir)
    stats = PackStats()

    for tpl in templates:
        slug = tpl.get("slug", "???")
        slots = tpl.get("slots") or []
        for slot in slots:
            role = slot.get("role")
            category = slot.get("category")
            tags = slot.get("tags") or {}
            # Flatten tag_constraints structure → plain key set for inference
            # tag_constraints are normalized to {"all": {…}, "any": {…}, "not": {…}}
            flat_tags: dict = {}
            if isinstance(tags, dict):
                for section in ("all", "any"):
                    inner = tags.get(section)
                    if isinstance(inner, dict):
                        flat_tags.update(inner)
                # If tags aren't in normalized form, use as-is
                if not flat_tags and tags:
                    flat_tags = {
                        k: v
                        for k, v in tags.items()
                        if k not in ("all", "any", "not")
                    }

            result = infer_composition_role(
                role=role, category=category, tags=flat_tags or None,
            )

            slot_index = slot.get("slot_index", "?")
            tag_keys = sorted(flat_tags.keys()) if flat_tags else []
            sr = SlotResult(
                pack=pack_name,
                template_slug=slug,
                slot_index=slot_index,
                role=role,
                category=category,
                tag_keys=tag_keys,
                inference=result,
            )

            stats.total += 1
            stats.by_confidence[result.confidence] += 1
            if result.confidence in ("unknown", "ambiguous"):
                stats.gaps.append(sr)

    return stats


# ── Reporting ────────────────────────────────────────────────────────────────

_CONFIDENCE_ORDER: list[InferenceConfidence] = [
    "exact", "heuristic", "ambiguous", "unknown",
]


def print_report(
    all_stats: dict[str, PackStats], *, only_gaps: bool = False,
) -> None:
    # Aggregate
    total = sum(s.total for s in all_stats.values())
    agg: dict[InferenceConfidence, int] = defaultdict(int)
    all_gaps: list[SlotResult] = []
    for s in all_stats.values():
        for conf, count in s.by_confidence.items():
            agg[conf] += count
        all_gaps.extend(s.gaps)

    if not only_gaps:
        print("=" * 70)
        print("  Composition Role Inference Audit")
        print("=" * 70)
        print(f"\n  Total slots scanned: {total}")
        print("  Breakdown by confidence:")
        for conf in _CONFIDENCE_ORDER:
            count = agg.get(conf, 0)
            pct = f"{count / total * 100:.1f}%" if total else "–"
            print(f"    {conf:12s}  {count:4d}  ({pct})")

        print(f"\n{'-' * 70}")
        print("  Per-pack stats:")
        print(f"{'-' * 70}")
        for pack_name in sorted(all_stats):
            ps = all_stats[pack_name]
            parts = []
            for conf in _CONFIDENCE_ORDER:
                c = ps.by_confidence.get(conf, 0)
                if c:
                    parts.append(f"{conf}={c}")
            breakdown = ", ".join(parts) if parts else "no slots"
            gap_count = len(ps.gaps)
            flag = f"  ** {gap_count} gap(s)" if gap_count else ""
            print(f"  {pack_name:20s}  slots={ps.total:3d}  {breakdown}{flag}")

    # Gaps detail
    if all_gaps:
        print(f"\n{'=' * 70}")
        print(f"  GAPS  ({len(all_gaps)} slots)")
        print(f"{'=' * 70}")
        for g in all_gaps:
            tags_str = ", ".join(g.tag_keys) if g.tag_keys else "-"
            print(
                f"  [{g.inference.confidence:9s}]  "
                f"{g.pack}/{g.template_slug}  slot#{g.slot_index}  "
                f"role={g.role or '-'}  cat={g.category or '-'}  "
                f"tags=[{tags_str}]",
            )
            print(f"               reason: {g.inference.reason}")
            if g.inference.candidates:
                print(
                    f"               candidates: "
                    f"{', '.join(g.inference.candidates)}",
                )

        # Unique unknown (role, category) pairs
        unknown_pairs: set[tuple[str | None, str | None]] = set()
        for g in all_gaps:
            if g.inference.confidence == "unknown":
                unknown_pairs.add((g.role, g.category))

        if unknown_pairs:
            print(f"\n{'-' * 70}")
            print("  Unique (role, category) pairs that mapped to 'unknown':")
            print("  (candidates to add to _ROLE_CATEGORY_TABLE)")
            print(f"{'-' * 70}")
            for role, cat in sorted(
                unknown_pairs, key=lambda p: (p[0] or "", p[1] or ""),
            ):
                print(f"    ({role or 'None'!r}, {cat or 'None'!r})")
    elif not only_gaps:
        print("\n  No gaps found — all slots resolved.")

    if only_gaps and not all_gaps:
        print("No gaps found — all slots resolved.")


# ── CLI ──────────────────────────────────────────────────────────────────────


def main() -> None:
    args = sys.argv[1:]
    pack_filter: str | None = None
    only_gaps = False

    i = 0
    while i < len(args):
        if args[i] == "--pack" and i + 1 < len(args):
            pack_filter = args[i + 1]
            i += 2
        elif args[i] == "--only-gaps":
            only_gaps = True
            i += 1
        elif args[i] in ("-h", "--help"):
            print(__doc__)
            packs = discover_content_packs()
            if packs:
                print(f"\nAvailable packs: {', '.join(packs)}")
            sys.exit(0)
        else:
            print(f"Unknown argument: {args[i]}", file=sys.stderr)
            print("Usage: python -m pixsim7.backend.main.scripts."
                  "audit_composition_roles [--pack NAME] [--only-gaps]",
                  file=sys.stderr)
            sys.exit(1)

    packs = discover_content_packs()
    if not packs:
        print(f"No content packs found in {CONTENT_PACKS_DIR}", file=sys.stderr)
        sys.exit(1)

    if pack_filter:
        if pack_filter not in packs:
            print(
                f"Pack '{pack_filter}' not found. "
                f"Available: {', '.join(packs)}",
                file=sys.stderr,
            )
            sys.exit(1)
        packs = [pack_filter]

    all_stats: dict[str, PackStats] = {}
    for pack_name in packs:
        all_stats[pack_name] = audit_pack(pack_name)

    print_report(all_stats, only_gaps=only_gaps)


if __name__ == "__main__":
    main()
