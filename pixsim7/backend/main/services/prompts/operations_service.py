"""
Prompt Operations Service

Advanced operations: batch, import/export, inference, similarity search, 
template validation, and provider validation.
"""
from __future__ import annotations

from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from pixsim7.backend.main.domain.prompt_versioning import (
    PromptFamily,
    PromptVersion,
)
from pixsim7.backend.main.domain.generation import Generation
from pixsim7.backend.main.domain.asset import Asset
from .similarity_utils import calculate_similarity
from .template_utils import PromptTemplate


class PromptOperationsService:
    """Service for advanced prompt operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ===== Batch Operations (Phase 3) =====

    async def batch_create_versions(
        self,
        family_id: UUID,
        versions: List[Dict[str, Any]],
        author: Optional[str] = None
    ) -> List[PromptVersion]:
        """Create multiple versions at once

        Args:
            family_id: Parent family
            versions: List of version dicts with prompt_text, commit_message, etc.
            author: Default author for all versions

        Returns:
            List of created PromptVersion objects
        """
        created_versions = []

        for version_data in versions:
            version = await self.create_version(
                family_id=family_id,
                prompt_text=version_data["prompt_text"],
                commit_message=version_data.get("commit_message"),
                author=version_data.get("author") or author,
                parent_version_id=version_data.get("parent_version_id"),
                variables=version_data.get("variables", {}),
                provider_hints=version_data.get("provider_hints", {}),
                tags=version_data.get("tags", [])
            )
            created_versions.append(version)

        return created_versions

    # ===== Import/Export (Phase 3) =====

    async def export_family(
        self,
        family_id: UUID,
        include_versions: bool = True,
        include_analytics: bool = False
    ) -> Dict[str, Any]:
        """Export a family and optionally its versions

        Args:
            family_id: Family to export
            include_versions: Include all versions
            include_analytics: Include analytics data

        Returns:
            Dict with family data in portable format
        """
        family = await self.get_family(family_id)
        if not family:
            raise ValueError(f"Family {family_id} not found")

        export_data = {
            "format_version": "1.0",
            "exported_at": datetime.utcnow().isoformat(),
            "family": {
                "slug": family.slug,
                "title": family.title,
                "description": family.description,
                "prompt_type": family.prompt_type,
                "category": family.category,
                "tags": family.tags,
                "family_metadata": family.family_metadata,
            }
        }

        if include_versions:
            versions = await self.list_versions(family_id, limit=1000)
            export_data["versions"] = [
                {
                    "version_number": v.version_number,
                    "prompt_text": v.prompt_text,
                    "commit_message": v.commit_message,
                    "author": v.author,
                    "variables": v.variables,
                    "provider_hints": v.provider_hints,
                    "tags": v.tags,
                    "semantic_version": v.semantic_version,
                    "branch_name": v.branch_name,
                    "created_at": v.created_at.isoformat(),
                }
                for v in reversed(versions)  # Export in chronological order
            ]

        if include_analytics:
            analytics = await self.get_family_analytics(family_id)
            export_data["analytics"] = analytics

        return export_data

    async def import_family(
        self,
        import_data: Dict[str, Any],
        author: Optional[str] = None,
        preserve_metadata: bool = True
    ) -> PromptFamily:
        """Import a family from exported data

        Args:
            import_data: Exported family data
            author: Override author for imported versions
            preserve_metadata: Keep original metadata (authors, dates in descriptions)

        Returns:
            Created PromptFamily

        Note:
            - Handles both internal exports and external prompts
            - External prompts without family structure are imported as single versions
            - Slug conflicts are auto-resolved
        """
        # Handle external prompt (just text, not structured export)
        if isinstance(import_data, str):
            # Simple text prompt - create minimal family
            import_data = {
                "family": {
                    "title": "Imported Prompt",
                    "slug": f"imported-{datetime.utcnow().timestamp()}",
                    "prompt_type": "visual",
                    "description": "Imported from external source"
                },
                "versions": [
                    {
                        "prompt_text": import_data,
                        "commit_message": "Initial import from external source"
                    }
                ]
            }

        family_data = import_data.get("family", {})

        # Auto-resolve slug conflicts
        base_slug = family_data.get("slug", "imported")
        slug = base_slug
        counter = 1
        while await self.get_family_by_slug(slug):
            slug = f"{base_slug}-{counter}"
            counter += 1

        # Create family
        family = await self.create_family(
            title=family_data.get("title", "Imported Family"),
            prompt_type=family_data.get("prompt_type", "visual"),
            slug=slug,
            description=family_data.get("description"),
            category=family_data.get("category"),
            tags=family_data.get("tags", []),
            created_by=author
        )

        # Import versions if present
        versions_data = import_data.get("versions", [])
        if versions_data:
            for v_data in versions_data:
                version_author = v_data.get("author") if preserve_metadata else author
                await self.create_version(
                    family_id=family.id,
                    prompt_text=v_data["prompt_text"],
                    commit_message=v_data.get("commit_message", "Imported version"),
                    author=version_author or author,
                    variables=v_data.get("variables", {}),
                    provider_hints=v_data.get("provider_hints", {}),
                    tags=v_data.get("tags", []),
                    semantic_version=v_data.get("semantic_version"),
                    branch_name=v_data.get("branch_name")
                )

        return family

    # ===== Historical Inference (Phase 3) =====

    async def infer_versions_from_assets(
        self,
        family_id: UUID,
        asset_ids: List[int],
        author: Optional[str] = None
    ) -> List[PromptVersion]:
        """Backfill prompt versions for existing assets

        Args:
            family_id: Target family for inferred versions
            asset_ids: Assets to infer prompts from
            author: Author for inferred versions

        Returns:
            List of created versions
        """
        from pixsim7.backend.main.domain.asset import Asset

        created_versions = []

        for asset_id in asset_ids:
            # Get asset and its job
            asset_result = await self.db.execute(
                select(Asset).where(Asset.id == asset_id)
            )
            asset = asset_result.scalar_one_or_none()
            if not asset or not asset.source_generation_id:
                continue

            # Get generation record
            artifact_result = await self.db.execute(
                select(Generation)
                .where(Generation.id == asset.source_generation_id)
            )
            generation = artifact_result.scalar_one_or_none()
            if not generation:
                continue

            # Skip if already linked to a version
            if artifact.prompt_version_id:
                continue

            # Extract prompt from artifact
            prompt_text = artifact.final_prompt or artifact.canonical_params.get("prompt", "")
            if not prompt_text:
                continue

            # Create version
            version = await self.create_version(
                family_id=family_id,
                prompt_text=prompt_text,
                commit_message=f"Inferred from asset {asset_id}",
                author=author or "system",
                tags=["inferred", f"asset:{asset_id}"]
            )

            # Link artifact to new version
            artifact.prompt_version_id = version.id
            await self.db.commit()

            created_versions.append(version)

        return created_versions

    # ===== Similarity Search (Phase 3) =====

    async def find_similar_prompts(
        self,
        prompt_text: str,
        limit: int = 10,
        threshold: float = 0.5,
        family_id: Optional[UUID] = None
    ) -> List[Dict[str, Any]]:
        """Find similar prompts using text similarity

        Args:
            prompt_text: Query prompt
            limit: Number of results
            threshold: Minimum similarity score (0-1)
            family_id: Optional family filter

        Returns:
            List of similar versions with similarity scores
        """
        from .similarity_utils import calculate_text_similarity

        query = select(PromptVersion)
        if family_id:
            query = query.where(PromptVersion.family_id == family_id)

        result = await self.db.execute(query)
        all_versions = list(result.scalars().all())

        # Calculate similarity scores
        similarities = []
        for version in all_versions:
            similarity = calculate_text_similarity(prompt_text, version.prompt_text)
            if similarity >= threshold:
                similarities.append({
                    "version_id": str(version.id),
                    "family_id": str(version.family_id),
                    "version_number": version.version_number,
                    "prompt_text": version.prompt_text,
                    "similarity_score": round(similarity, 4),
                    "commit_message": version.commit_message,
                })

        # Sort by similarity (descending)
        similarities.sort(key=lambda x: x["similarity_score"], reverse=True)

        return similarities[:limit]

    # ===== Template Validation (Phase 3) =====

    def validate_template_prompt(
        self,
        prompt_text: str,
        variable_defs: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Validate a prompt template

        Args:
            prompt_text: Prompt text (may contain {{variables}})
            variable_defs: Optional variable definitions

        Returns:
            Validation result with errors/warnings
        """
        from .template_utils import validate_prompt_text, parse_variable_definitions

        parsed_defs = None
        if variable_defs:
            parsed_defs = parse_variable_definitions(variable_defs)

        return validate_prompt_text(prompt_text, parsed_defs)

    def render_template_prompt(
        self,
        prompt_text: str,
        variables: Dict[str, Any],
        variable_defs: Optional[Dict[str, Any]] = None,
        strict: bool = True
    ) -> str:
        """Render a template prompt with variable substitution

        Args:
            prompt_text: Template text
            variables: Variable values
            variable_defs: Optional variable definitions
            strict: Raise error on validation failure

        Returns:
            Rendered prompt text
        """
        from .template_utils import substitute_variables, parse_variable_definitions

        parsed_defs = None
        if variable_defs:
            parsed_defs = parse_variable_definitions(variable_defs)

        return substitute_variables(prompt_text, variables, parsed_defs, strict)

    # ===== Provider Validation (Phase 4 - Modernization) =====

    async def validate_prompt_for_provider(
        self,
        prompt_text: str,
        provider_id: str,
        operation_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Validate prompt against provider capabilities

        BREAKING CHANGE: This will become mandatory for all prompt operations.

        Args:
            prompt_text: The prompt to validate
            provider_id: Target provider ID
            operation_type: Optional operation type for specific validation

        Returns:
            Validation result:
            {
                "valid": bool,
                "errors": List[str],
                "warnings": List[str],
                "provider_id": str,
                "char_count": int,
                "char_limit": int,
                "truncated": bool
            }
        """
        # Known provider limits (will be replaced with dynamic capability registry)
        PROVIDER_LIMITS = {
            "pixverse": {
                "prompt_limit": 800,
                "supported_operations": ["text_to_video", "image_to_video"]
            },
            "runway": {
                "prompt_limit": 2000,
                "supported_operations": ["text_to_video", "image_to_video", "video_extend"]
            },
            "pika": {
                "prompt_limit": 1000,
                "supported_operations": ["text_to_video", "image_to_video"]
            }
        }

        errors = []
        warnings = []
        char_count = len(prompt_text)

        # Get provider limits
        provider_limits = PROVIDER_LIMITS.get(provider_id)
        if not provider_limits:
            warnings.append(f"Unknown provider '{provider_id}', validation limited")
            provider_limits = {"prompt_limit": 800}  # Conservative default

        prompt_limit = provider_limits.get("prompt_limit", 800)

        # Check prompt length
        if char_count > prompt_limit:
            errors.append(
                f"Prompt exceeds {prompt_limit} character limit for {provider_id} "
                f"({char_count} chars)"
            )

        # Warn if close to limit (90%)
        elif char_count > prompt_limit * 0.9:
            warnings.append(
                f"Prompt is {char_count}/{prompt_limit} chars "
                f"({int(char_count/prompt_limit*100)}% of limit)"
            )

        # Check operation type support
        if operation_type and "supported_operations" in provider_limits:
            if operation_type not in provider_limits["supported_operations"]:
                errors.append(
                    f"Operation '{operation_type}' not supported by {provider_id}"
                )

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "provider_id": provider_id,
            "char_count": char_count,
            "char_limit": prompt_limit,
            "truncated": False
        }

    async def validate_version_for_provider(
        self,
        version_id: UUID,
        provider_id: str,
        variables: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Validate a prompt version against provider capabilities

        Args:
            version_id: Prompt version to validate
            provider_id: Target provider
            variables: Variable values to render prompt

        Returns:
            Validation result with rendered prompt included
        """
        version = await self.get_version(version_id)
        if not version:
            return {
                "valid": False,
                "errors": [f"Version {version_id} not found"],
                "warnings": [],
                "provider_id": provider_id
            }

        # Render prompt with variables
        try:
            rendered_prompt = self.render_prompt(
                version.prompt_text,
                variables or {},
                version.variables,
                strict=False
            )
        except Exception as e:
            return {
                "valid": False,
                "errors": [f"Failed to render prompt: {str(e)}"],
                "warnings": [],
                "provider_id": provider_id
            }

        # Validate rendered prompt
        result = await self.validate_prompt_for_provider(
            rendered_prompt,
            provider_id
        )

        # Add rendered prompt to result
        result["rendered_prompt"] = rendered_prompt
        result["version_id"] = str(version_id)

        return result

    async def update_provider_compatibility(
        self,
        version_id: UUID,
        provider_id: str,
        validation_result: Dict[str, Any]
    ) -> None:
        """
        Update provider_compatibility field on prompt version

        Stores validation results for caching and analytics.

        Args:
            version_id: Prompt version to update
            provider_id: Provider that was validated
            validation_result: Validation result to store
        """
        version = await self.get_version(version_id)
        if not version:
            return

        # Update provider_compatibility
        if not version.provider_compatibility:
            version.provider_compatibility = {}

        version.provider_compatibility[provider_id] = {
            "validated_at": datetime.utcnow().isoformat(),
            "valid": validation_result["valid"],
            "char_count": validation_result.get("char_count"),
            "char_limit": validation_result.get("char_limit"),
            "errors": validation_result.get("errors", []),
            "warnings": validation_result.get("warnings", [])
        }

        self.db.add(version)
        await self.db.commit()
