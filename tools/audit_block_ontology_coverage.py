#!/usr/bin/env python3
"""Audit block primitive <-> vocabulary coverage.

Walks every content pack under content_packs/primitives/, parses each pack
through the loader (which now auto-derives ontology_ids from block.text via
vocabularies.match_keywords), and reports:

  - per-category match rates
  - top ontology IDs hit
  - zero-match primitives (so we know which need authoring help or vocab gaps)

Read-only. No DB writes. Run:

    python tools/audit_block_ontology_coverage.py
    python tools/audit_block_ontology_coverage.py --json out.json
    python tools/audit_block_ontology_coverage.py --zero-only
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Tuple

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pixsim7.backend.main.services.prompt.block import primitive_loader

PRIMITIVES_ROOT = (
    Path(__file__).resolve().parents[1]
    / "pixsim7"
    / "backend"
    / "main"
    / "content_packs"
    / "primitives"
)


def _resolve_category(block: Dict[str, Any]) -> str:
    cat = block.get("category")
    if isinstance(cat, str) and cat.strip():
        return cat.strip()
    tags = block.get("tags") or {}
    if isinstance(tags, dict):
        legacy = tags.get("legacy_category")
        if isinstance(legacy, str) and legacy.strip():
            return legacy.strip()
    return "<no_category>"


def _ontology_ids(block: Dict[str, Any]) -> List[str]:
    tags = block.get("tags") or {}
    if not isinstance(tags, dict):
        return []
    ids = tags.get("ontology_ids")
    return [oid for oid in ids if isinstance(oid, str)] if isinstance(ids, list) else []


def audit() -> Dict[str, Any]:
    if not PRIMITIVES_ROOT.exists():
        raise SystemExit(f"primitives root not found: {PRIMITIVES_ROOT}")

    total = 0
    matched = 0
    zero_match: List[Dict[str, str]] = []
    by_category: Dict[str, Dict[str, int]] = defaultdict(
        lambda: {"total": 0, "matched": 0}
    )
    by_pack: Dict[str, Dict[str, int]] = defaultdict(
        lambda: {"total": 0, "matched": 0}
    )
    id_counter: Counter = Counter()
    skipped: List[Tuple[str, str]] = []

    for pack_dir in sorted(p for p in PRIMITIVES_ROOT.iterdir() if p.is_dir()):
        try:
            blocks = primitive_loader._collect_pack_primitives(pack_dir)
        except Exception as exc:  # noqa: BLE001 — audit is best-effort
            skipped.append((pack_dir.name, str(exc)))
            continue

        for block in blocks:
            total += 1
            block_id = str(block.get("block_id", "<unknown>"))
            category = _resolve_category(block)
            text = str(block.get("text") or "")
            ids = _ontology_ids(block)

            by_category[category]["total"] += 1
            by_pack[pack_dir.name]["total"] += 1
            if ids:
                matched += 1
                by_category[category]["matched"] += 1
                by_pack[pack_dir.name]["matched"] += 1
                id_counter.update(ids)
            else:
                zero_match.append(
                    {
                        "pack": pack_dir.name,
                        "category": category,
                        "block_id": block_id,
                        "text": text,
                    }
                )

    return {
        "total": total,
        "matched": matched,
        "zero_match": zero_match,
        "by_category": dict(by_category),
        "by_pack": dict(by_pack),
        "top_ids": id_counter.most_common(30),
        "skipped_packs": skipped,
    }


def _print_report(report: Dict[str, Any], zero_only: bool = False) -> None:
    total = report["total"]
    matched = report["matched"]
    pct = (matched / total * 100) if total else 0.0

    if not zero_only:
        print("\n=== Block primitive ontology coverage ===\n")
        print(f"Total primitives:  {total}")
        print(f"With ontology_ids: {matched} ({pct:.1f}%)")
        print(f"Zero matches:      {total - matched}")

        if report["skipped_packs"]:
            print(f"\nSkipped packs ({len(report['skipped_packs'])}):")
            for pack, err in report["skipped_packs"]:
                print(f"  {pack}: {err}")

        print("\n=== By pack ===")
        for pack, stats in sorted(
            report["by_pack"].items(),
            key=lambda kv: kv[1]["total"],
            reverse=True,
        ):
            ppct = (stats["matched"] / stats["total"] * 100) if stats["total"] else 0.0
            print(f"  {pack:<28} {stats['matched']:>4}/{stats['total']:<4} ({ppct:5.1f}%)")

        print("\n=== By category ===")
        for cat, stats in sorted(
            report["by_category"].items(),
            key=lambda kv: kv[1]["total"],
            reverse=True,
        ):
            cpct = (stats["matched"] / stats["total"] * 100) if stats["total"] else 0.0
            print(f"  {cat:<28} {stats['matched']:>4}/{stats['total']:<4} ({cpct:5.1f}%)")

        print("\n=== Top 30 ontology IDs hit ===")
        for oid, n in report["top_ids"]:
            print(f"  {n:>5}  {oid}")

    zero_match = report["zero_match"]
    if zero_match:
        print(f"\n=== Zero-match primitives ({len(zero_match)}) ===")
        # Group by category for easier scanning
        grouped: Dict[str, List[Dict[str, str]]] = defaultdict(list)
        for entry in zero_match:
            grouped[f"{entry['pack']}/{entry['category']}"].append(entry)
        for group, items in sorted(grouped.items()):
            print(f"\n  [{group}] ({len(items)})")
            for entry in items:
                text_preview = (entry["text"][:90] + "...") if len(entry["text"]) > 90 else entry["text"]
                print(f"    {entry['block_id']}")
                print(f"        {text_preview}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, help="Write full report to this JSON file")
    parser.add_argument(
        "--zero-only",
        action="store_true",
        help="Print only the zero-match list (omit summaries)",
    )
    args = parser.parse_args()

    report = audit()

    if args.json:
        args.json.write_text(json.dumps(report, indent=2, default=list), encoding="utf-8")
        print(f"wrote {args.json}")

    _print_report(report, zero_only=args.zero_only)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
