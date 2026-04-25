#!/usr/bin/env python3
"""One-shot backfill: collapse duplicate PromptVersion rows created by the
pre-unique-constraint concurrent-insert race.

Prior to the UNIQUE (prompt_hash, family_id) NULLS NOT DISTINCT constraint,
concurrent analyze_and_attach_version calls for identical prompt text could
each race past the SELECT-by-hash check and insert their own row. This left
duplicate PromptVersion rows per (prompt_hash, family_id) pair, undermining
prompt_version_id as a "same prompt" signal.

This script picks one canonical row per group (prefer rows with
prompt_analysis set, then oldest created_at, tie-break on id), rewrites every
referencing column to point at the winner, then deletes the losers.

Referencing columns rewritten (all with prompt_version_id = loser_id
remapped to winner_id):
    - generations.prompt_version_id
    - assets.prompt_version_id
    - generation_batch_item_manifests.prompt_version_id
    - prompt_version_tag_assertion.prompt_version_id
    - prompt_variant_feedback.prompt_version_id
    - character_usage.prompt_version_id
    - prompt_versions.parent_version_id (self-ref)

Usage:
    python tools/backfill_dedup_prompt_versions.py           # dry-run (default)
    python tools/backfill_dedup_prompt_versions.py --apply   # commit

Run BEFORE the alembic migration that adds the UNIQUE constraint, or the
migration will fail on the existing duplicate rows.

Requires DATABASE_URL (or PIXSIM_DATABASE_URL) in env or .env file.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker


def _get_database_url() -> str:
    """Resolve the DB URL using the same path as the backend Settings loader.

    Order of precedence: env var (DATABASE_URL / PIXSIM_DATABASE_URL), .env
    in CWD, then the hardcoded backend default. Keeps this tool aligned with
    whatever the running app sees, with no extra configuration surface.
    """
    from pixsim7.backend.main.shared.config import settings

    url = os.environ.get("PIXSIM_DATABASE_URL") or settings.database_url
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


# (table, column) pairs holding loser ids to rewrite → winner_id.
# parent_version_id is last so it can't be overwritten mid-pass by a child→parent rewrite.
_REWRITE_TARGETS = [
    ("generations", "prompt_version_id"),
    ("assets", "prompt_version_id"),
    ("generation_batch_item_manifests", "prompt_version_id"),
    ("prompt_version_tag_assertion", "prompt_version_id"),
    ("prompt_variant_feedback", "prompt_version_id"),
    ("character_usage", "prompt_version_id"),
    ("prompt_versions", "parent_version_id"),
]

# Tables where a composite PRIMARY KEY / UNIQUE constraint includes
# prompt_version_id. A naive UPDATE that rewrites loser→winner fails when the
# winner already has a row with the same value in the *other* key columns.
# For each such table, pre-delete loser rows that would collide.
#   { table_name: (fk_column, [other_key_columns]) }
_COMPOSITE_KEY_CONFLICT = {
    "prompt_version_tag_assertion": ("prompt_version_id", ["tag_id"]),
}


async def verify(engine) -> int:
    """Read-only sanity check. Returns count of issues found (0 = clean)."""
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        # 1. Any remaining dup groups?
        dup_groups = (await session.execute(text("""
            SELECT COUNT(*) FROM (
                SELECT 1 FROM prompt_versions
                GROUP BY prompt_hash, family_id
                HAVING COUNT(*) > 1
            ) d
        """))).scalar_one()

        # 2. Any FK column pointing at a prompt_version id that no longer exists?
        orphans = {}
        for table, col in _REWRITE_TARGETS:
            orphan_count = (await session.execute(text(f"""
                SELECT COUNT(*) FROM {table} t
                WHERE t.{col} IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM prompt_versions pv WHERE pv.id = t.{col}
                  )
            """))).scalar_one()
            if orphan_count:
                orphans[f"{table}.{col}"] = orphan_count

        # 3. Self-loop parent_version_id
        self_loops = (await session.execute(text("""
            SELECT COUNT(*) FROM prompt_versions WHERE parent_version_id = id
        """))).scalar_one()

    print("Verify:")
    print(f"  Remaining duplicate (prompt_hash, family_id) groups: {dup_groups}")
    print(f"  Self-loop parent_version_id: {self_loops}")
    if orphans:
        for key, cnt in orphans.items():
            print(f"  ORPHAN FK {key}: {cnt}")
    else:
        print("  Orphan FK references: 0")

    return dup_groups + self_loops + sum(orphans.values())


async def dedup(apply: bool) -> None:
    url = _get_database_url()
    engine = create_async_engine(url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        async with session.begin():
            # Build winner-per-group mapping into a temp table. family_id uses
            # IS NOT DISTINCT FROM so NULL family_ids group together (matches
            # the NULLS NOT DISTINCT semantics of the upcoming constraint).
            await session.execute(text("""
                CREATE TEMP TABLE pv_dedup_map ON COMMIT DROP AS
                WITH ranked AS (
                    SELECT
                        id,
                        prompt_hash,
                        family_id,
                        ROW_NUMBER() OVER (
                            PARTITION BY prompt_hash, family_id
                            ORDER BY
                                (prompt_analysis IS NOT NULL) DESC,
                                created_at ASC,
                                id ASC
                        ) AS rn
                    FROM prompt_versions
                )
                SELECT
                    loser.id  AS loser_id,
                    winner.id AS winner_id
                FROM ranked loser
                JOIN ranked winner
                    ON winner.prompt_hash = loser.prompt_hash
                   AND winner.family_id IS NOT DISTINCT FROM loser.family_id
                   AND winner.rn = 1
                WHERE loser.rn > 1;
            """))
            await session.execute(text(
                "CREATE INDEX ON pv_dedup_map (loser_id);"
            ))

            stats = {}
            count_map = (await session.execute(
                text("SELECT COUNT(*) FROM pv_dedup_map;")
            )).scalar_one()
            stats["losers_identified"] = count_map

            for table, col in _REWRITE_TARGETS:
                # Count rows that will be touched
                cnt = (await session.execute(text(f"""
                    SELECT COUNT(*)
                    FROM {table} t
                    JOIN pv_dedup_map m ON t.{col} = m.loser_id
                """))).scalar_one()
                stats[f"{table}.{col}"] = cnt

                if cnt and apply:
                    # If this table has a composite PK/UNIQUE including col,
                    # delete loser rows that would collide with existing
                    # winner rows on the same (winner, other_key_cols) tuple,
                    # otherwise the UPDATE trips the constraint.
                    if table in _COMPOSITE_KEY_CONFLICT:
                        fk_col, other_cols = _COMPOSITE_KEY_CONFLICT[table]
                        assert fk_col == col, (
                            f"composite conflict config for {table} assumes "
                            f"column {fk_col}, but rewrite target is {col}"
                        )
                        match = " AND ".join(
                            f"w.{oc} = t.{oc}" for oc in other_cols
                        )
                        conflict_deleted = (await session.execute(text(f"""
                            DELETE FROM {table} t
                            USING pv_dedup_map m
                            WHERE t.{col} = m.loser_id
                              AND EXISTS (
                                SELECT 1 FROM {table} w
                                WHERE w.{col} = m.winner_id
                                  AND {match}
                              )
                        """))).rowcount
                        stats[f"{table}.{col}_conflict_deletes"] = conflict_deleted

                    await session.execute(text(f"""
                        UPDATE {table}
                        SET {col} = m.winner_id
                        FROM pv_dedup_map m
                        WHERE {table}.{col} = m.loser_id
                    """))

            # Post-rewrite: null out any self-referential parent_version_id
            # (would only happen if a loser was the original parent of its own
            # winner, which the ORDER BY prevents, but we defend anyway).
            if apply:
                await session.execute(text("""
                    UPDATE prompt_versions
                    SET parent_version_id = NULL
                    WHERE parent_version_id = id
                """))

            # Delete losers
            if apply:
                deleted = (await session.execute(text("""
                    DELETE FROM prompt_versions
                    WHERE id IN (SELECT loser_id FROM pv_dedup_map)
                """))).rowcount
                stats["deleted"] = deleted

            if not apply:
                # Roll the transaction back so the temp table + any other state
                # (there shouldn't be any) disappears cleanly.
                await session.rollback()

        # Report
        print(f"Mode: {'APPLY' if apply else 'DRY RUN'}")
        print(f"  Duplicate losers identified: {stats['losers_identified']}")
        for table, col in _REWRITE_TARGETS:
            print(f"  {table}.{col}: {stats[f'{table}.{col}']} rows rewritten")
            conflict_key = f"{table}.{col}_conflict_deletes"
            if conflict_key in stats:
                print(
                    f"    (of which {stats[conflict_key]} loser rows were "
                    f"pre-deleted to avoid composite-key collision with winner)"
                )
        if apply:
            print(f"  prompt_versions rows deleted: {stats.get('deleted', 0)}")
        else:
            print("  Dry run — pass --apply to commit.")

    if apply:
        # Post-apply self-check in a fresh session. If the state isn't clean
        # after --apply, something went wrong and we want it to fail loudly.
        print()
        issues = await verify(engine)
        if issues:
            raise RuntimeError(
                f"Post-apply verify failed: {issues} issues remaining "
                f"(see output above)."
            )

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true",
                        help="Commit the dedup (default is dry-run)")
    parser.add_argument("--verify", action="store_true",
                        help="Read-only sanity check; exits non-zero if issues remain. "
                             "Does not plan or apply any dedup work.")
    args = parser.parse_args()

    if args.verify and args.apply:
        parser.error("--verify and --apply are mutually exclusive")

    if args.verify:
        async def _run_verify() -> int:
            engine = create_async_engine(_get_database_url(), echo=False)
            try:
                return await verify(engine)
            finally:
                await engine.dispose()

        issues = asyncio.run(_run_verify())
        sys.exit(0 if issues == 0 else 1)

    asyncio.run(dedup(apply=args.apply))


if __name__ == "__main__":
    main()
