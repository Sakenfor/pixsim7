#!/usr/bin/env python3
"""Lint content-pack YAML files for flagged words and structural issues.

Scans block text for words that are known to trigger provider content filters.
Maintains a wordlist that can be extended over time.

Usage:
    python pixsim7/backend/main/scripts/lint_content_packs.py
    python pixsim7/backend/main/scripts/lint_content_packs.py --pack dane
    python pixsim7/backend/main/scripts/lint_content_packs.py --fix-suggestions
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

import yaml

BACKEND_ROOT = Path(__file__).resolve().parent.parent
CONTENT_PACKS_DIR = BACKEND_ROOT / "content_packs" / "prompt"

# ── Flagged words ────────────────────────────────────────────────────────────
# Each entry: (pattern, suggestion). Pattern is a regex; word-boundary aware.
# "suggestion" is shown in output to guide the fix (empty = just flag it).
FLAGGED_WORDS: list[tuple[str, str]] = [
    (r"\bfrozen\b", "use 'rigid', 'locked', 'still'"),
    (r"\bfreeze[sd]?\b", "use 'stops', 'halts', 'locks'"),
    (r"\bfreezing\b", "use 'locking up', 'going rigid'"),
    (r"\bswallow(?:s|ed|ing)?\b", "use 'stifles', 'inhales sharply', 'presses lips'"),
    (r"\bhips\b", "use 'hi_p-s' (bypass spelling)"),
    (r"\bknuckles?\b", "literal interpretation risk — use 'grip tightening', 'fingers digging in'"),
    (r"\bfurniture\b", "causes motion artifacts — remove or rephrase"),
    # Add new flagged words here as they're discovered:
    # (r"\bexample\b", "replacement suggestion"),
]

# Compile patterns once
_COMPILED_FLAGS = [(re.compile(pat, re.IGNORECASE), pat, suggestion) for pat, suggestion in FLAGGED_WORDS]


@dataclass
class Violation:
    file: str
    block_id: str
    field: str
    line_fragment: str
    pattern: str
    suggestion: str


@dataclass
class LintResult:
    violations: list[Violation] = field(default_factory=list)
    files_scanned: int = 0
    blocks_scanned: int = 0


def lint_block(block: dict, filepath: str) -> list[Violation]:
    """Check a single block's text fields for flagged words."""
    violations = []
    block_id = block.get("block_id", "<unknown>")

    # Fields to scan — only fields whose text reaches the provider.
    # "description" is internal metadata and excluded.
    text_fields = ["text", "reinforcement_text"]

    for field_name in text_fields:
        value = block.get(field_name)
        if not isinstance(value, str):
            continue
        for compiled, pattern, suggestion in _COMPILED_FLAGS:
            match = compiled.search(value)
            if match:
                # Extract surrounding context
                start = max(0, match.start() - 20)
                end = min(len(value), match.end() + 20)
                fragment = value[start:end].replace("\n", " ").strip()
                violations.append(Violation(
                    file=filepath,
                    block_id=block_id,
                    field=field_name,
                    line_fragment=f"...{fragment}...",
                    pattern=pattern,
                    suggestion=suggestion,
                ))
    return violations


def lint_template_slots(template: dict, filepath: str) -> list[Violation]:
    """Check template reinforcement/audio_cue slot text for flagged words."""
    violations = []
    slug = template.get("slug", "<unknown>")
    for slot in template.get("slots", []):
        label = slot.get("label", "")
        for field_name in ["reinforcement_text", "fallback_text"]:
            value = slot.get(field_name)
            if not isinstance(value, str) or not value:
                continue
            for compiled, pattern, suggestion in _COMPILED_FLAGS:
                match = compiled.search(value)
                if match:
                    start = max(0, match.start() - 20)
                    end = min(len(value), match.end() + 20)
                    fragment = value[start:end].replace("\n", " ").strip()
                    violations.append(Violation(
                        file=filepath,
                        block_id=f"{slug}::{label}",
                        field=field_name,
                        line_fragment=f"...{fragment}...",
                        pattern=pattern,
                        suggestion=suggestion,
                    ))
    return violations


def lint_file(filepath: Path) -> LintResult:
    """Lint a single YAML content pack file."""
    result = LintResult(files_scanned=1)

    try:
        data = yaml.safe_load(filepath.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"  ERROR: failed to parse {filepath}: {exc}", file=sys.stderr)
        return result

    if not isinstance(data, dict):
        return result

    # Lint blocks
    for block in data.get("blocks", []):
        result.blocks_scanned += 1
        result.violations.extend(lint_block(block, str(filepath)))

    # Lint template slots (reinforcement text in templates.yaml)
    for template in data.get("templates", []):
        result.violations.extend(lint_template_slots(template, str(filepath)))

    return result


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Lint content-pack YAML files")
    parser.add_argument("--pack", help="Lint only this package directory (e.g. 'dane', 'shared')")
    parser.add_argument("--fix-suggestions", action="store_true", help="Show fix suggestions inline")
    args = parser.parse_args(argv)

    if not CONTENT_PACKS_DIR.is_dir():
        print(f"ERROR: content packs directory not found: {CONTENT_PACKS_DIR}", file=sys.stderr)
        return 1

    # Collect YAML files
    if args.pack:
        pack_dir = CONTENT_PACKS_DIR / args.pack
        if not pack_dir.is_dir():
            print(f"ERROR: pack directory not found: {pack_dir}", file=sys.stderr)
            return 1
        yaml_files = sorted(pack_dir.glob("*.yaml"))
    else:
        yaml_files = sorted(CONTENT_PACKS_DIR.rglob("*.yaml"))

    total = LintResult()
    for filepath in yaml_files:
        result = lint_file(filepath)
        total.files_scanned += result.files_scanned
        total.blocks_scanned += result.blocks_scanned
        total.violations.extend(result.violations)

    # Report
    if total.violations:
        print(f"\n{'='*70}")
        print(f"  FLAGGED WORDS: {len(total.violations)} violation(s)")
        print(f"  Scanned {total.files_scanned} file(s), {total.blocks_scanned} block(s)")
        print(f"{'='*70}\n")

        for v in total.violations:
            rel = Path(v.file).relative_to(BACKEND_ROOT) if BACKEND_ROOT in Path(v.file).parents else v.file
            print(f"  {rel}")
            print(f"    block: {v.block_id}")
            print(f"    field: {v.field}")
            print(f"    match: {v.line_fragment}")
            if args.fix_suggestions and v.suggestion:
                print(f"    fix:   {v.suggestion}")
            print()

        return 1
    else:
        print(f"OK — {total.files_scanned} file(s), {total.blocks_scanned} block(s), no flagged words.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
