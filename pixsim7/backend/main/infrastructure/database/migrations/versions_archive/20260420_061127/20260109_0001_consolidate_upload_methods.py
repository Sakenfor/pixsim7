"""Consolidate upload_method values to simplified categories.

Old values -> New values:
- extension_pixverse -> pixverse_sync
- extension_web -> web
- extension -> web
- local_folders -> local
- api -> web
- mobile -> web

Revision ID: 20260109_0001
Revises: 20260107_0001
Create Date: 2026-01-09
"""
from alembic import op


revision = "20260109_0001"
down_revision = "20260107_0001"
branch_labels = None
depends_on = None


# Mapping of old values to new consolidated values
LEGACY_TO_NEW = {
    "extension_pixverse": "pixverse_sync",
    "extension_badge": "pixverse_sync",
    "extension_web": "web",
    "extension": "web",
    "local_folders": "local",
    "api": "web",
    "mobile": "web",
}


def upgrade() -> None:
    for old_value, new_value in LEGACY_TO_NEW.items():
        op.execute(f"""
            UPDATE assets
            SET upload_method = '{new_value}'
            WHERE upload_method = '{old_value}'
        """)


def downgrade() -> None:
    # Reverse mapping (note: some info is lost since multiple old values map to 'web')
    # We can only reliably reverse pixverse_sync -> extension_pixverse and local -> local_folders
    op.execute("""
        UPDATE assets
        SET upload_method = 'extension_pixverse'
        WHERE upload_method = 'pixverse_sync'
    """)
    op.execute("""
        UPDATE assets
        SET upload_method = 'local_folders'
        WHERE upload_method = 'local'
    """)
    # 'web' cannot be reliably downgraded since it merged multiple sources
