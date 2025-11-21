#!/usr/bin/env python
"""
Convert inline prompts to prompt versions

BREAKING CHANGE MIGRATION SCRIPT

This script converts all existing inline prompts in generations to proper
versioned prompts in the prompt versioning system.

Usage:
    # Dry run (see what would change)
    python scripts/migrations/convert_inline_prompts_to_versions.py --dry-run

    # Actually perform conversion
    python scripts/migrations/convert_inline_prompts_to_versions.py

    # Convert and backup to JSON
    python scripts/migrations/convert_inline_prompts_to_versions.py --backup prompts_backup.json

Safety:
    - ALWAYS backup database before running
    - Run with --dry-run first
    - Review generated prompt families before committing
"""
import asyncio
import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime
from uuid import UUID

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.infrastructure.database.session import get_async_session
from pixsim7.backend.main.domain.generation import Generation
from pixsim7.backend.main.domain.prompt_versioning import PromptFamily, PromptVersion
from pixsim7.backend.main.services.prompts import PromptVersionService


class InlinePromptConverter:
    """Converts inline prompts to versioned prompts"""

    def __init__(self, db: AsyncSession, dry_run: bool = False):
        self.db = db
        self.dry_run = dry_run
        self.prompt_service = PromptVersionService(db)
        self.stats = {
            "total_generations": 0,
            "already_versioned": 0,
            "inline_prompts_found": 0,
            "families_created": 0,
            "versions_created": 0,
            "generations_updated": 0,
            "errors": 0
        }
        self.conversion_log: List[Dict[str, Any]] = []

    async def find_inline_prompt_generations(self) -> List[Generation]:
        """Find all generations with inline prompts (no prompt_version_id)"""
        stmt = select(Generation).where(
            and_(
                Generation.prompt_version_id.is_(None),
                Generation.final_prompt.isnot(None)
            )
        ).order_by(Generation.created_at)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    def extract_prompt(self, generation: Generation) -> Optional[str]:
        """Extract prompt from generation params or final_prompt"""
        # Priority 1: final_prompt
        if generation.final_prompt:
            return generation.final_prompt

        # Priority 2: canonical_params.prompt
        if generation.canonical_params and "prompt" in generation.canonical_params:
            return generation.canonical_params["prompt"]

        # Priority 3: raw_params.prompt
        if generation.raw_params and "prompt" in generation.raw_params:
            return generation.raw_params["prompt"]

        return None

    def create_family_slug(self, prompt: str, provider_id: str) -> str:
        """Create a unique slug for the prompt family"""
        # Use first 50 chars of prompt + provider
        prompt_preview = prompt[:50].lower()
        # Remove special chars
        import re
        slug = re.sub(r'[^\w\s-]', '', prompt_preview)
        slug = re.sub(r'[-\s]+', '-', slug)
        slug = slug.strip('-')

        # Add provider suffix
        return f"{slug}-{provider_id}"

    async def create_or_get_family(
        self,
        prompt: str,
        provider_id: str,
        operation_type: str
    ) -> PromptFamily:
        """Create or get existing prompt family for this prompt"""
        slug = self.create_family_slug(prompt, provider_id)

        # Check if family already exists
        existing = await self.prompt_service.get_family_by_slug(slug)
        if existing:
            return existing

        # Create new family
        if self.dry_run:
            print(f"  [DRY RUN] Would create family: {slug}")
            # Return a mock family with ID for dry run
            from uuid import uuid4
            family = PromptFamily(
                id=uuid4(),
                slug=slug,
                title=f"Migrated: {prompt[:100]}",
                description=f"Auto-migrated inline prompt from {provider_id}",
                prompt_type="visual" if operation_type in ["text_to_video", "image_to_video"] else "narrative",
                category="migrated",
                tags=["auto-migrated", f"provider:{provider_id}"]
            )
            return family

        family = await self.prompt_service.create_family(
            title=f"Migrated: {prompt[:100]}",
            slug=slug,
            description=f"Auto-migrated inline prompt from {provider_id}",
            prompt_type="visual" if operation_type in ["text_to_video", "image_to_video"] else "narrative",
            category="migrated",
            tags=["auto-migrated", f"provider:{provider_id}"],
            created_by="migration_script"
        )

        self.stats["families_created"] += 1
        return family

    async def create_version(
        self,
        family: PromptFamily,
        prompt: str,
        provider_id: str
    ) -> PromptVersion:
        """Create a new version in the family"""
        if self.dry_run:
            print(f"    [DRY RUN] Would create version for family {family.slug}")
            from uuid import uuid4
            version = PromptVersion(
                id=uuid4(),
                family_id=family.id,
                version_number=1,
                prompt_text=prompt,
                commit_message="Migrated from inline prompt"
            )
            return version

        version = await self.prompt_service.create_version(
            family_id=family.id,
            prompt_text=prompt,
            commit_message="Migrated from inline prompt",
            author="migration_script",
            tags=["migrated"],
            provider_hints={"provider_id": provider_id}
        )

        self.stats["versions_created"] += 1
        return version

    async def update_generation(
        self,
        generation: Generation,
        version: PromptVersion,
        prompt: str
    ) -> None:
        """Update generation with prompt_config and prompt_version_id"""
        if self.dry_run:
            print(f"    [DRY RUN] Would update generation {generation.id}")
            return

        # Update generation
        generation.prompt_version_id = version.id
        generation.prompt_config = {
            "versionId": str(version.id),
            "familyId": str(version.family_id),
            "variables": {},
            "migratedFrom": "inline"
        }
        generation.prompt_source_type = "versioned"

        # Commit to database
        self.db.add(generation)
        await self.db.commit()

        self.stats["generations_updated"] += 1

    async def convert_generation(self, generation: Generation) -> bool:
        """Convert a single generation's inline prompt to versioned prompt"""
        try:
            prompt = self.extract_prompt(generation)
            if not prompt:
                print(f"  WARNING: Generation {generation.id} has no extractable prompt")
                return False

            print(f"Converting generation {generation.id}")
            print(f"  Prompt: {prompt[:100]}...")
            print(f"  Provider: {generation.provider_id}")

            # Create or get family
            family = await self.create_or_get_family(
                prompt=prompt,
                provider_id=generation.provider_id,
                operation_type=generation.operation_type.value
            )

            # Create version
            version = await self.create_version(
                family=family,
                prompt=prompt,
                provider_id=generation.provider_id
            )

            # Update generation
            await self.update_generation(generation, version, prompt)

            # Log conversion
            self.conversion_log.append({
                "generation_id": generation.id,
                "family_id": str(family.id),
                "version_id": str(version.id),
                "prompt_preview": prompt[:200],
                "provider_id": generation.provider_id,
                "converted_at": datetime.utcnow().isoformat()
            })

            return True

        except Exception as e:
            print(f"  ERROR: Failed to convert generation {generation.id}: {e}")
            self.stats["errors"] += 1
            return False

    async def run(self) -> Dict[str, Any]:
        """Run the conversion process"""
        print("=" * 80)
        print("INLINE PROMPT TO VERSION CONVERSION")
        print("=" * 80)

        if self.dry_run:
            print("\n🔍 DRY RUN MODE - No changes will be made\n")
        else:
            print("\n⚠️  LIVE MODE - Database will be modified\n")

        # Find generations with inline prompts
        print("Finding generations with inline prompts...")
        generations = await self.find_inline_prompt_generations()
        self.stats["total_generations"] = len(generations)
        self.stats["inline_prompts_found"] = len(generations)

        print(f"Found {len(generations)} generations with inline prompts\n")

        if len(generations) == 0:
            print("✅ No inline prompts to convert!")
            return self.stats

        # Convert each generation
        for i, generation in enumerate(generations, 1):
            print(f"\n[{i}/{len(generations)}] ", end="")
            await self.convert_generation(generation)

        # Print summary
        print("\n" + "=" * 80)
        print("CONVERSION SUMMARY")
        print("=" * 80)
        print(f"Total generations:      {self.stats['total_generations']}")
        print(f"Inline prompts found:   {self.stats['inline_prompts_found']}")
        print(f"Families created:       {self.stats['families_created']}")
        print(f"Versions created:       {self.stats['versions_created']}")
        print(f"Generations updated:    {self.stats['generations_updated']}")
        print(f"Errors:                 {self.stats['errors']}")
        print("=" * 80)

        if self.dry_run:
            print("\n✅ DRY RUN COMPLETE - No changes were made")
        else:
            print("\n✅ CONVERSION COMPLETE")

        return self.stats

    def save_backup(self, filepath: str) -> None:
        """Save conversion log to JSON file"""
        backup_data = {
            "converted_at": datetime.utcnow().isoformat(),
            "stats": self.stats,
            "conversions": self.conversion_log
        }

        with open(filepath, 'w') as f:
            json.dump(backup_data, f, indent=2)

        print(f"\n💾 Backup saved to: {filepath}")


async def main():
    parser = argparse.ArgumentParser(description="Convert inline prompts to prompt versions")
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help="Run without making changes (preview mode)"
    )
    parser.add_argument(
        '--backup',
        type=str,
        help="Save conversion log to JSON file"
    )

    args = parser.parse_args()

    # Get database session
    async for db in get_async_session():
        try:
            converter = InlinePromptConverter(db, dry_run=args.dry_run)
            stats = await converter.run()

            # Save backup if requested
            if args.backup:
                converter.save_backup(args.backup)

            # Exit with error code if there were errors
            sys.exit(1 if stats["errors"] > 0 else 0)

        finally:
            await db.close()


if __name__ == "__main__":
    asyncio.run(main())
