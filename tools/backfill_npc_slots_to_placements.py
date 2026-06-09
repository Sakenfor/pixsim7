#!/usr/bin/env python3
"""Backfill: migrate location.meta["npcSlots2d"] -> unified placements.

Part of the `unified-spatial-placement` plan (migrate-npc checkpoint). Converts
each legacy 2D NPC slot into an `entity_type:"npc"` placement under
`location.meta["placements"]`, tagged `source:"import"`.

The migration is purely ADDITIVE and idempotent:
  - existing placements are preserved
  - a slot already migrated (npc placement with the same id) is skipped
  - an id that collides with a NON-npc placement is skipped + reported
  - the legacy `npcSlots2d` key is left intact (removal belongs to the
    later `deprecate` checkpoint, not this backfill)

Usage:
    python tools/backfill_npc_slots_to_placements.py            # dry-run (default)
    python tools/backfill_npc_slots_to_placements.py --apply    # write changes
    python tools/backfill_npc_slots_to_placements.py --world-id 3 --apply

Requires DATABASE_URL (or PIXSIM_DATABASE_URL) in env or .env file.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# Ensure project root is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

NPC_SLOTS_2D_META_KEY = "npcSlots2d"
PLACEMENTS_META_KEY = "placements"

# Slot fields mapped onto first-class placement fields; everything else is
# carried into placement.meta so nothing is lost.
_SLOT_RESERVED_KEYS = {"id", "x", "y", "depth", "anchor", "roles"}


@dataclass
class MigrationStats:
    locations_scanned: int = 0
    locations_changed: int = 0
    slots_migrated: int = 0
    slots_skipped_existing: int = 0
    slots_skipped_collision: int = 0
    slots_invalid: int = 0
    collisions: List[str] = field(default_factory=list)
    invalid: List[str] = field(default_factory=list)


def slot_to_placement(slot: Any) -> Optional[Dict[str, Any]]:
    """Convert one legacy npc slot dict into a normalized npc placement dict.

    Returns None if the slot is malformed (missing id or non-numeric x/y).
    """
    if not isinstance(slot, dict):
        return None

    slot_id = str(slot.get("id") or "").strip()
    if not slot_id:
        return None

    x = slot.get("x")
    y = slot.get("y")
    if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
        return None
    if not 0.0 <= float(x) <= 1.0 or not 0.0 <= float(y) <= 1.0:
        return None

    position: Dict[str, Any] = {"x": float(x), "y": float(y)}
    depth = slot.get("depth")
    if isinstance(depth, (int, float)) and 0.0 <= float(depth) <= 1.0:
        position["depth"] = float(depth)
    anchor = slot.get("anchor")
    if isinstance(anchor, str) and anchor:
        position["anchor"] = anchor

    placement: Dict[str, Any] = {
        "id": slot_id,
        "entity_type": "npc",
        "position": position,
        "source": "import",
    }

    roles = slot.get("roles")
    if isinstance(roles, list) and all(isinstance(r, str) for r in roles) and roles:
        placement["roles"] = list(roles)

    extras = {k: v for k, v in slot.items() if k not in _SLOT_RESERVED_KEYS}
    if extras:
        placement["meta"] = extras

    return placement


def migrate_location_meta(
    meta: Any,
    stats: MigrationStats,
    *,
    location_label: str = "",
) -> Optional[Dict[str, Any]]:
    """Return a new meta dict with npc slots merged into placements.

    Returns None when nothing changed (no slots, or all already migrated).
    Mutates `stats` in place.
    """
    if not isinstance(meta, dict):
        return None

    slots = meta.get(NPC_SLOTS_2D_META_KEY)
    if not isinstance(slots, list) or not slots:
        return None

    existing = meta.get(PLACEMENTS_META_KEY)
    placements: List[Dict[str, Any]] = (
        [dict(p) for p in existing if isinstance(p, dict)]
        if isinstance(existing, list)
        else []
    )
    by_id = {str(p.get("id")): p for p in placements if p.get("id") is not None}

    added = 0
    for index, slot in enumerate(slots):
        placement = slot_to_placement(slot)
        if placement is None:
            stats.slots_invalid += 1
            stats.invalid.append(f"{location_label}[{index}]")
            continue

        pid = placement["id"]
        prior = by_id.get(pid)
        if prior is not None:
            if prior.get("entity_type") == "npc":
                stats.slots_skipped_existing += 1
            else:
                stats.slots_skipped_collision += 1
                stats.collisions.append(
                    f"{location_label}: id '{pid}' already used by "
                    f"entity_type '{prior.get('entity_type')}'"
                )
            continue

        placements.append(placement)
        by_id[pid] = placement
        added += 1

    if added == 0:
        return None

    stats.slots_migrated += added
    new_meta = dict(meta)
    new_meta[PLACEMENTS_META_KEY] = placements
    return new_meta


async def backfill(apply: bool, world_id: Optional[int]) -> MigrationStats:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.orm.attributes import flag_modified

    from pixsim7.backend.main.domain.game import GameLocation
    from pixsim7.backend.main.services.diagnostics.applied_ledger import (
        record_backfill_applied,
    )

    url = _get_database_url()
    engine = create_async_engine(url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    stats = MigrationStats()

    async with async_session() as session:
        stmt = select(GameLocation)
        if world_id is not None:
            stmt = stmt.where(GameLocation.world_id == world_id)
        result = await session.execute(stmt.order_by(GameLocation.id))
        locations = result.scalars().all()

        for loc in locations:
            stats.locations_scanned += 1
            label = f"location {loc.id} ({loc.name!r})"
            new_meta = migrate_location_meta(loc.meta, stats, location_label=label)
            if new_meta is None:
                continue

            stats.locations_changed += 1
            print(
                f"  {label}: +{len(new_meta[PLACEMENTS_META_KEY])} placements "
                f"(from {len(loc.meta.get(NPC_SLOTS_2D_META_KEY, []))} slots)"
            )
            if apply:
                loc.meta = new_meta
                flag_modified(loc, "meta")

        if apply:
            await session.commit()
            await record_backfill_applied(
                __file__, rows_affected=stats.locations_changed
            )

    await engine.dispose()
    return stats


def _get_database_url() -> str:
    url = os.environ.get("PIXSIM_DATABASE_URL") or os.environ.get("DATABASE_URL", "")
    if not url:
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        if os.path.exists(env_path):
            for line in open(env_path):
                line = line.strip()
                if line.startswith("DATABASE_URL=") or line.startswith(
                    "PIXSIM_DATABASE_URL="
                ):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not url:
        raise RuntimeError("No DATABASE_URL found in env or .env")
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


def _print_report(stats: MigrationStats, apply: bool) -> None:
    print("\nSummary:")
    print(f"  locations scanned : {stats.locations_scanned}")
    print(f"  locations changed : {stats.locations_changed}")
    print(f"  slots migrated    : {stats.slots_migrated}")
    print(f"  skipped (existing): {stats.slots_skipped_existing}")
    print(f"  skipped (collision): {stats.slots_skipped_collision}")
    print(f"  invalid slots     : {stats.slots_invalid}")
    for c in stats.collisions:
        print(f"    ! {c}")
    for i in stats.invalid:
        print(f"    ? invalid slot at {i}")
    if not apply:
        print("\nDry run complete. Use --apply to write changes.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Migrate location npcSlots2d into unified placements"
    )
    parser.add_argument(
        "--apply", action="store_true", help="Write changes (default is dry-run)"
    )
    parser.add_argument(
        "--world-id", type=int, default=None, help="Limit to a single world"
    )
    args = parser.parse_args()

    print(f"{'APPLYING' if args.apply else 'DRY RUN'}: npcSlots2d -> placements\n")
    stats = asyncio.run(backfill(apply=args.apply, world_id=args.world_id))
    _print_report(stats, args.apply)


if __name__ == "__main__":
    main()
