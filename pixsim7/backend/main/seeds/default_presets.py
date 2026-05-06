"""
Default automation presets for Pixverse Android app

These presets are automatically seeded into the database on first run.
"""
from typing import List, Dict, Any
from datetime import datetime, timezone

# Pixverse Android app details
PIXVERSE_PACKAGE = "com.pixverseai.pixverse"
PIXVERSE_ACTIVITY = "com.pixverseai.pixverse.MainActivity"


# Default presets list. Currently empty — admins can manage system
# presets directly via the UI (promote/demote, edit, delete). To seed
# additional defaults on first run, append dicts here following the same
# shape used for `AppActionPreset` constructor kwargs.
DEFAULT_PRESETS: List[Dict[str, Any]] = []


async def seed_default_presets(db):
    """
    Seed default presets into database if they don't exist

    Usage:
        from pixsim7.backend.main.seeds.default_presets import seed_default_presets
        await seed_default_presets(db)
    """
    from sqlalchemy import select
    from pixsim7.automation.domain.preset import AppActionPreset

    for preset_data in DEFAULT_PRESETS:
        # Check if preset already exists
        result = await db.execute(
            select(AppActionPreset).where(AppActionPreset.name == preset_data["name"])
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing system preset with latest actions
            if existing.is_system:
                print(f"Preset '{preset_data['name']}' already exists, updating actions")
                existing.actions = preset_data["actions"]
                existing.description = preset_data.get("description", "")
                existing.app_package = preset_data.get("app_package", PIXVERSE_PACKAGE)
                existing.requires_password = preset_data.get("requires_password", False)
                existing.updated_at = datetime.now(timezone.utc)
                print(f"[OK] Updated preset: {preset_data['name']}")
            else:
                print(f"Preset '{preset_data['name']}' already exists (not system), skipping")
            continue

        # Create preset
        preset = AppActionPreset(
            name=preset_data["name"],
            category=preset_data["category"],
            description=preset_data.get("description", ""),
            app_package=preset_data.get("app_package", PIXVERSE_PACKAGE),
            actions=preset_data["actions"],
            requires_password=preset_data.get("requires_password", False),
            is_system=True,
            is_shared=True,
            owner_id=None,  # System presets have no owner
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )

        db.add(preset)
        print(f"[OK] Created preset: {preset_data['name']}")

    await db.commit()
    print(f"[OK] Seeded {len(DEFAULT_PRESETS)} default presets")
