#!/usr/bin/env python3
"""One-shot backfill: resolve URL-only source images to local assets by sha256.

Some synced assets (typically i2i generated directly on the provider's site)
carry generation ``inputs`` that reference a source image only by a provider-side
URL — no ``asset:<id>`` ref — so they never got lineage edges or an
``input_assets_key``. If we already hold the *same bytes* under a different
provider id, we can recover the link by content hash.

Unlike re-enrichment (which re-derives sources from ``media_metadata`` via the
provider extractor — and finds nothing for these rows), this works straight off
the existing ``Generation.inputs`` URLs:

  for each input with a ``url`` but no ``asset`` ref:
    download → sha256 → match a local Asset (dedup.resolve_existing_asset_by_url_hash)
    on hit: write an AssetLineage edge + patch the input to ``asset:<id>``
  then recompute ``input_assets_key`` from the (now-resolved) inputs.

Cost: one byte download per unresolved source — only under ``--apply``. The dry
run only counts candidates.

Usage:
    python tools/backfill_source_hash_match.py                 # dry-run (count)
    python tools/backfill_source_hash_match.py --apply          # resolve + write
    python tools/backfill_source_hash_match.py --apply --limit 50

Requires DATABASE_URL (or PIXSIM_DATABASE_URL) in env or .env file.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
from pixsim7.backend.main.domain import Asset, Generation, OperationType
from pixsim7.backend.main.services.asset.dedup import resolve_existing_asset_by_url_hash
from pixsim7.backend.main.services.asset.asset_factory import create_lineage_links_with_metadata
from pixsim7.backend.main.services.generation.context import (
    compute_input_assets_key,
    extract_source_asset_ids,
)


# Candidates: no input_assets_key yet, but the linked generation has a
# non-empty inputs array (the source(s) exist, just unresolved to local assets).
_CANDIDATE_SQL = text(
    """
    SELECT a.id
    FROM assets a
    JOIN generations g ON g.id = a.source_generation_id
    WHERE a.input_assets_key IS NULL
      AND jsonb_array_length(g.inputs::jsonb) > 0
    ORDER BY a.id
    """
)


async def _process_one(session: AsyncSession, asset_id: int) -> str:
    """Resolve one asset's URL-only inputs. Returns an outcome label."""
    asset = await session.get(Asset, asset_id)
    if asset is None or asset.source_generation_id is None:
        return "skipped"
    generation = await session.get(Generation, asset.source_generation_id)
    if generation is None or not isinstance(generation.inputs, list):
        return "skipped"

    inputs = [dict(e) for e in generation.inputs if isinstance(e, dict)]
    parent_inputs: list[dict] = []
    changed = False

    for idx, entry in enumerate(inputs):
        if entry.get("asset"):
            continue  # already resolved
        url = entry.get("url")
        if not url:
            continue
        match, _sha = await resolve_existing_asset_by_url_hash(
            session,
            user_id=asset.user_id,
            provider_id=asset.provider_id,
            remote_url=url,
        )
        if not match:
            continue
        entry["asset"] = f"asset:{match.id}"
        changed = True
        parent_inputs.append(
            {
                "asset": f"asset:{match.id}",
                "role": entry.get("role", "source_image"),
                "sequence_order": entry.get("sequence_order", idx),
            }
        )

    if not changed:
        return "unresolved"

    op = generation.operation_type
    if not isinstance(op, OperationType):
        op = OperationType.IMAGE_TO_IMAGE
    await create_lineage_links_with_metadata(
        session,
        child_asset_id=asset.id,
        parent_inputs=parent_inputs,
        operation_type=op,
    )

    generation.inputs = inputs  # reassign so SQLAlchemy flushes the JSON change
    asset.input_assets_key = compute_input_assets_key(extract_source_asset_ids(inputs))
    await session.commit()
    return "resolved"


async def backfill(apply: bool, limit: int | None) -> None:
    async with AsyncSessionLocal() as session:
        asset_ids = [row[0] for row in (await session.execute(_CANDIDATE_SQL)).all()]

    if limit is not None:
        asset_ids = asset_ids[:limit]

    print(f"Candidate assets (null key, generation has inputs): {len(asset_ids)}")
    if not apply:
        print("Dry run — pass --apply to download, hash-match, and write.")
        return

    counts = {"resolved": 0, "unresolved": 0, "skipped": 0, "failed": 0}
    for asset_id in asset_ids:
        async with AsyncSessionLocal() as session:
            try:
                outcome = await _process_one(session, asset_id)
            except Exception as e:  # noqa: BLE001 - one bad row shouldn't stop the run
                await session.rollback()
                outcome = "failed"
                print(f"  asset {asset_id}: FAILED ({e.__class__.__name__}: {e})")
            counts[outcome] += 1
            if outcome == "resolved":
                print(f"  asset {asset_id}: resolved")

    print(
        f"\nDone of {len(asset_ids)} candidates: "
        + " ".join(f"{k}={v}" for k, v in counts.items())
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="Perform downloads + writes (default is dry-run count)")
    parser.add_argument("--limit", type=int, default=None, help="Process at most N assets")
    args = parser.parse_args()
    print(f"{'APPLYING' if args.apply else 'DRY RUN'}: backfill source hash-match\n")
    asyncio.run(backfill(apply=args.apply, limit=args.limit))


if __name__ == "__main__":
    main()
