"""Action Block Migration Service - JSON ↔ Database conversion

Migrates existing JSON action block libraries to PostgreSQL while maintaining
backward compatibility. Supports bidirectional conversion.
"""
import json
import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from uuid import uuid4, UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlmodel import SQLModel

from pixsim7.backend.main.domain.action_block import ActionBlockDB


class ActionBlockMigrationService:
    """Service for migrating action blocks between JSON and database"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.base_library_path = Path("pixsim7/backend/main/domain/narrative/action_blocks/library")

    async def migrate_json_to_database(
        self,
        json_file_path: Optional[str] = None,
        package_name: Optional[str] = None,
        clear_existing: bool = False
    ) -> Dict[str, Any]:
        """Migrate JSON action blocks to database

        Args:
            json_file_path: Specific JSON file to migrate (or None for all)
            package_name: Package name for these blocks
            clear_existing: If True, clear existing blocks for this package first

        Returns:
            Migration statistics
        """
        stats = {
            "total_files": 0,
            "total_blocks": 0,
            "migrated": 0,
            "skipped": 0,
            "errors": []
        }

        # Determine which files to migrate
        if json_file_path:
            files_to_migrate = [Path(json_file_path)]
        else:
            # Migrate all JSON files in library directory
            files_to_migrate = list(self.base_library_path.glob("*_actions.json"))

        stats["total_files"] = len(files_to_migrate)

        for json_file in files_to_migrate:
            try:
                # Determine package name from filename if not provided
                if not package_name:
                    pkg_name = json_file.stem.replace('_actions', '')
                else:
                    pkg_name = package_name

                # Clear existing blocks for this package if requested
                if clear_existing:
                    await self._clear_package_blocks(pkg_name)

                # Load JSON file
                with open(json_file, 'r', encoding='utf-8') as f:
                    blocks_data = json.load(f)

                stats["total_blocks"] += len(blocks_data)

                # Migrate each block
                for block_data in blocks_data:
                    try:
                        success = await self._migrate_single_block(
                            block_data,
                            pkg_name
                        )
                        if success:
                            stats["migrated"] += 1
                        else:
                            stats["skipped"] += 1
                    except Exception as e:
                        stats["errors"].append({
                            "block_id": block_data.get('id', 'unknown'),
                            "error": str(e)
                        })

            except Exception as e:
                stats["errors"].append({
                    "file": str(json_file),
                    "error": str(e)
                })

        await self.db.commit()
        return stats

    async def _migrate_single_block(
        self,
        block_data: Dict[str, Any],
        package_name: str
    ) -> bool:
        """Migrate a single block from JSON to database

        Returns:
            True if migrated, False if skipped (already exists)
        """
        block_id = block_data.get('id')
        if not block_id:
            raise ValueError("Block missing 'id' field")

        # Check if block already exists
        existing = await self.db.execute(
            select(ActionBlockDB).where(ActionBlockDB.block_id == block_id)
        )
        if existing.scalar_one_or_none():
            return False  # Skip, already exists

        # Extract kind
        kind = block_data.get('kind')
        if not kind or kind not in ['single_state', 'transition']:
            raise ValueError(f"Invalid or missing 'kind': {kind}")

        # Extract core fields
        prompt = block_data.get('prompt')
        if not prompt:
            raise ValueError("Block missing 'prompt' field")

        # Count chars and words
        char_count = len(prompt)
        word_count = len(prompt.split())

        # Determine complexity
        if char_count < 300:
            complexity = "simple"
        elif char_count < 600:
            complexity = "moderate"
        elif char_count < 1000:
            complexity = "complex"
        else:
            complexity = "very_complex"

        # Extract tags
        tags = block_data.get('tags', {})
        if isinstance(tags, dict):
            # Already in correct format
            pass
        elif isinstance(tags, list):
            # Convert list to dict with 'custom' key
            tags = {"custom": tags}

        # Create database model
        db_block = ActionBlockDB(
            id=uuid4(),
            block_id=block_id,
            kind=kind,
            prompt=prompt,
            negative_prompt=block_data.get('negativePrompt'),
            style=block_data.get('style', 'soft_cinema'),
            duration_sec=block_data.get('durationSec', 6.0),
            tags=tags,
            compatible_next=block_data.get('compatibleNext', []),
            compatible_prev=block_data.get('compatiblePrev', []),
            complexity_level=complexity,
            char_count=char_count,
            word_count=word_count,
            source_type="library",
            package_name=package_name,
            is_public=True,
            description=block_data.get('description'),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        # Add type-specific fields
        if kind == "single_state":
            db_block.reference_image = block_data.get('referenceImage')
            db_block.start_pose = block_data.get('startPose')
            db_block.end_pose = block_data.get('endPose')

        elif kind == "transition":
            db_block.transition_from = block_data.get('from')
            db_block.transition_to = block_data.get('to')
            db_block.transition_via = block_data.get('via', [])

        # Add enhanced features if present (v2 blocks)
        if 'cameraMovement' in block_data:
            db_block.camera_movement = block_data['cameraMovement']

        if 'consistency' in block_data:
            db_block.consistency = block_data['consistency']

        if 'intensityProgression' in block_data:
            db_block.intensity_progression = block_data['intensityProgression']

        # Save to database
        self.db.add(db_block)
        return True

    async def _clear_package_blocks(self, package_name: str):
        """Clear all blocks for a package"""
        await self.db.execute(
            delete(ActionBlockDB).where(ActionBlockDB.package_name == package_name)
        )
        await self.db.commit()

    async def export_database_to_json(
        self,
        package_name: Optional[str] = None,
        output_dir: Optional[str] = None,
        filter_criteria: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Export database action blocks to JSON files

        Args:
            package_name: Export specific package (or None for all)
            output_dir: Output directory (defaults to library path)
            filter_criteria: Additional filters (complexity, source_type, etc)

        Returns:
            Export statistics
        """
        stats = {
            "total_blocks": 0,
            "files_created": 0,
            "packages": []
        }

        output_path = Path(output_dir) if output_dir else self.base_library_path
        output_path.mkdir(parents=True, exist_ok=True)

        # Build query
        query = select(ActionBlockDB)

        if package_name:
            query = query.where(ActionBlockDB.package_name == package_name)

        if filter_criteria:
            if 'complexity_level' in filter_criteria:
                query = query.where(ActionBlockDB.complexity_level == filter_criteria['complexity_level'])
            if 'source_type' in filter_criteria:
                query = query.where(ActionBlockDB.source_type == filter_criteria['source_type'])
            if 'is_public' in filter_criteria:
                query = query.where(ActionBlockDB.is_public == filter_criteria['is_public'])

        # Fetch blocks
        result = await self.db.execute(query)
        blocks = result.scalars().all()

        # Group by package
        blocks_by_package = {}
        for block in blocks:
            pkg = block.package_name or "custom"
            if pkg not in blocks_by_package:
                blocks_by_package[pkg] = []
            blocks_by_package[pkg].append(block)

        # Export each package to separate JSON file
        for pkg, pkg_blocks in blocks_by_package.items():
            json_data = []
            for block in pkg_blocks:
                json_data.append(block.to_json_dict())

            output_file = output_path / f"{pkg}_actions.json"
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, indent=2, ensure_ascii=False)

            stats["files_created"] += 1
            stats["packages"].append({
                "package": pkg,
                "blocks": len(pkg_blocks),
                "file": str(output_file)
            })
            stats["total_blocks"] += len(pkg_blocks)

        return stats

    async def export_single_package(
        self,
        package_name: str,
        output_file: str
    ) -> int:
        """Export a single package to specific JSON file

        Returns:
            Number of blocks exported
        """
        query = select(ActionBlockDB).where(
            ActionBlockDB.package_name == package_name
        )
        result = await self.db.execute(query)
        blocks = result.scalars().all()

        json_data = [block.to_json_dict() for block in blocks]

        output_path = Path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, indent=2, ensure_ascii=False)

        return len(json_data)

    async def get_migration_status(self) -> Dict[str, Any]:
        """Get status of JSON vs Database blocks

        Returns:
            Comparison statistics
        """
        # Count database blocks
        db_result = await self.db.execute(select(ActionBlockDB))
        db_blocks = db_result.scalars().all()

        # Count blocks by package in database
        db_by_package = {}
        for block in db_blocks:
            pkg = block.package_name or "custom"
            db_by_package[pkg] = db_by_package.get(pkg, 0) + 1

        # Count JSON blocks
        json_by_package = {}
        if self.base_library_path.exists():
            for json_file in self.base_library_path.glob("*_actions.json"):
                pkg_name = json_file.stem.replace('_actions', '')
                with open(json_file, 'r') as f:
                    blocks = json.load(f)
                    json_by_package[pkg_name] = len(blocks)

        # Compare
        status = {
            "database": {
                "total_blocks": len(db_blocks),
                "by_package": db_by_package
            },
            "json_files": {
                "total_blocks": sum(json_by_package.values()),
                "by_package": json_by_package
            },
            "sync_status": {}
        }

        # Check sync status for each package
        all_packages = set(list(db_by_package.keys()) + list(json_by_package.keys()))
        for pkg in all_packages:
            db_count = db_by_package.get(pkg, 0)
            json_count = json_by_package.get(pkg, 0)

            if db_count == json_count and db_count > 0:
                sync_status = "synced"
            elif db_count > json_count:
                sync_status = "database_ahead"
            elif json_count > db_count:
                sync_status = "json_ahead"
            else:
                sync_status = "empty"

            status["sync_status"][pkg] = {
                "status": sync_status,
                "database_count": db_count,
                "json_count": json_count,
                "difference": db_count - json_count
            }

        return status
