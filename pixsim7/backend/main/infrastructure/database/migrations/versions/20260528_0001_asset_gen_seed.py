"""add assets.gen_seed (+idx); drop manifest roll_seed index

The "same seed" media-card badge originally counted via
``GenerationBatchItemManifest.roll_seed`` (template-roll seed), but that column
is effectively always NULL — the meaningful "same seed" grouping is the provider
generation seed, which lives in ``Generation.canonical_params.seed``.

This denormalizes that provider seed onto ``Asset.gen_seed`` (mirroring how
``input_assets_key`` / ``prompt_family_id`` already back the other two sibling
badges), so the count/filter become a pure user-scoped ``Asset`` GROUP BY with no
join. ``idx_asset_user_gen_seed`` serves it; the previous, now-useless index on
``generation_batch_item_manifests.roll_seed`` (revision 20260527_0001) is dropped.

A one-shot ``tools/backfill_asset_gen_seed.py --apply`` populates existing rows
from ``canonical_params.seed``.

Revision ID: 20260528_0001
Revises: 20260527_0001
Create Date: 2026-05-28
"""
import sqlalchemy as sa
from alembic import op


revision = "20260528_0001"
down_revision = "20260527_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_generation_batch_item_manifests_roll_seed")

    op.add_column("assets", sa.Column("gen_seed", sa.BigInteger(), nullable=True))
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_asset_user_gen_seed
        ON assets (user_id, gen_seed)
        WHERE gen_seed IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_asset_user_gen_seed")
    op.drop_column("assets", "gen_seed")

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_generation_batch_item_manifests_roll_seed
        ON generation_batch_item_manifests (roll_seed)
        """
    )
