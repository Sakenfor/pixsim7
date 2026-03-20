"""
One-time migration of file-based settings to system_config DB table.

Reads provider_settings.json and media_settings.json if they exist,
seeds the corresponding DB rows if no row exists yet, then renames the
old files so they are not re-read on subsequent startups.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def migrate_file_settings_to_db(db: AsyncSession) -> list[str]:
    """Migrate provider_settings.json and media_settings.json to system_config.

    Only runs if the DB namespace row does not exist yet AND the JSON file
    is present on disk. Returns list of namespaces that were migrated.
    """
    from pixsim7.backend.main.shared.path_registry import get_path_registry
    from .service import get_config, set_config, apply_namespace

    registry = get_path_registry()
    migrated: list[str] = []

    migrations = [
        ("provider_settings", registry.provider_settings_file),
        ("media_settings", registry.media_settings_file),
    ]

    for namespace, file_path in migrations:
        try:
            existing = await get_config(db, namespace)
            if existing is not None:
                continue  # Already in DB

            if not file_path.exists():
                continue  # No file to migrate

            with open(file_path) as f:
                data = json.load(f)

            if not data:
                continue

            await set_config(db, namespace, data)
            apply_namespace(namespace, data)

            # Rename old file so it's not re-read
            backup = file_path.with_suffix(".json.migrated")
            file_path.rename(backup)

            migrated.append(namespace)
            logger.info(
                "system_config_migrated_from_file",
                namespace=namespace,
                source=str(file_path),
            )
        except Exception as exc:
            logger.warning(
                "system_config_migration_failed",
                namespace=namespace,
                error=str(exc),
            )

    return migrated
