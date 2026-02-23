#!/usr/bin/env python3
"""
CLI wrapper for content-pack loader.

Usage:
    python -m pixsim7.backend.main.scripts.load_content_pack <pack_name>
    python -m pixsim7.backend.main.scripts.load_content_pack dane
    python -m pixsim7.backend.main.scripts.load_content_pack dane --dry-run
    python -m pixsim7.backend.main.scripts.load_content_pack dane --force

Flags:
    --dry-run   Parse and validate only, don't write to DB
    --force     Overwrite existing blocks/templates (default: skip existing)
    --prune     Delete rows for this pack that are missing from YAML
"""
from __future__ import annotations

import asyncio
import sys

from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
    CONTENT_PACKS_DIR,
    discover_content_packs,
    load_pack,
    parse_blocks,
    parse_templates,
    parse_characters,
)


def _dry_run(pack_name: str) -> None:
    pack_dir = CONTENT_PACKS_DIR / pack_name
    blocks = parse_blocks(pack_dir)
    templates = parse_templates(pack_dir)
    characters = parse_characters(pack_dir)

    print(f"Content pack '{pack_name}': {len(blocks)} blocks, {len(templates)} templates, {len(characters)} characters")
    for b in blocks:
        print(f"  [block] {b['block_id']}  {b.get('role', '?')}/{b.get('category', '?')}  "
              f"intensity={b.get('tags', {}).get('intensity', '-')}")
    for t in templates:
        print(f"  [template] {t['slug']}  {len(t.get('slots', []))} slots")
    for c in characters:
        print(f"  [character] {c['character_id']}  {c.get('species', '?')}  {c.get('display_name', c.get('name', '?'))}")
    print("\n  Dry run — no DB writes.")


async def _load(pack_name: str, force: bool, prune: bool) -> None:
    from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        stats = await load_pack(db, pack_name, force=force, prune_missing=prune)

    print(f"\n  Done: "
          f"{stats['blocks_created']} created, {stats['blocks_updated']} updated, "
          f"{stats['blocks_skipped']} skipped, {stats.get('blocks_pruned', 0)} pruned blocks | "
          f"{stats['templates_created']} created, {stats['templates_updated']} updated, "
          f"{stats['templates_skipped']} skipped, {stats.get('templates_pruned', 0)} pruned templates | "
          f"{stats.get('characters_created', 0)} created, {stats.get('characters_updated', 0)} updated, "
          f"{stats.get('characters_skipped', 0)} skipped, {stats.get('characters_pruned', 0)} pruned characters")


def main() -> None:
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        packs = discover_content_packs()
        if packs:
            print(f"Available content packs: {', '.join(packs)}")
        sys.exit(0)

    pack_name = args[0]
    force = "--force" in args
    dry_run = "--dry-run" in args
    prune = "--prune" in args

    if dry_run:
        _dry_run(pack_name)
    else:
        asyncio.run(_load(pack_name, force=force, prune=prune))


if __name__ == "__main__":
    main()
