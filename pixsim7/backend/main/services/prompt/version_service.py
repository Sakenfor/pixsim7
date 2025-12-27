"""
Prompt Version Service - Compatibility Layer

This class composes the split services for backward compatibility.
New code should use the specific services directly:
- PromptFamilyService: Family and version CRUD
- PromptVariantService: Variant feedback and metrics
- PromptAnalyticsService: Diff, compare, analytics
- PromptOperationsService: Batch, import/export, inference, search, templates, validation
"""
from __future__ import annotations

from typing import List, Optional, Dict, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from .family_service import PromptFamilyService
from .variant_service import PromptVariantService
from .analytics_service import PromptAnalyticsService
from .operations_service import PromptOperationsService


class PromptVersionService:
    """
    Compatibility layer that composes all prompt services.
    
    Delegates to specialized services for better organization.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self._family = PromptFamilyService(db)
        self._variant = PromptVariantService(db)
        self._analytics = PromptAnalyticsService(db)
        self._operations = PromptOperationsService(db)

    # ===== Family Management (delegate to PromptFamilyService) =====

    async def create_family(self, *args, **kwargs):
        return await self._family.create_family(*args, **kwargs)

    async def get_family(self, *args, **kwargs):
        return await self._family.get_family(*args, **kwargs)

    async def get_family_by_slug(self, *args, **kwargs):
        return await self._family.get_family_by_slug(*args, **kwargs)

    async def list_families(self, *args, **kwargs):
        return await self._family.list_families(*args, **kwargs)

    # ===== Version Management (delegate to PromptFamilyService) =====

    async def create_version(self, *args, **kwargs):
        return await self._family.create_version(*args, **kwargs)

    async def get_version(self, *args, **kwargs):
        return await self._family.get_version(*args, **kwargs)

    async def get_latest_version(self, *args, **kwargs):
        return await self._family.get_latest_version(*args, **kwargs)

    async def list_versions(self, *args, **kwargs):
        return await self._family.list_versions(*args, **kwargs)

    # ===== Variant Management (delegate to PromptVariantService) =====

    async def fork_from_artifact(self, *args, **kwargs):
        return await self._variant.fork_from_artifact(*args, **kwargs)

    async def increment_generation_count(self, *args, **kwargs):
        return await self._variant.increment_generation_count(*args, **kwargs)

    async def increment_success_count(self, *args, **kwargs):
        return await self._variant.increment_success_count(*args, **kwargs)

    async def record_variant_feedback(self, *args, **kwargs):
        return await self._variant.record_variant_feedback(*args, **kwargs)

    async def rate_variant(self, *args, **kwargs):
        return await self._variant.rate_variant(*args, **kwargs)

    async def list_variants_for_version(self, *args, **kwargs):
        return await self._variant.list_variants_for_version(*args, **kwargs)

    async def get_assets_for_version(self, *args, **kwargs):
        return await self._variant.get_assets_for_version(*args, **kwargs)

    async def get_version_for_asset(self, *args, **kwargs):
        return await self._variant.get_version_for_asset(*args, **kwargs)

    # ===== Analytics (delegate to PromptAnalyticsService) =====

    async def get_version_diff(self, *args, **kwargs):
        return await self._analytics.get_version_diff(*args, **kwargs)

    async def compare_versions(self, *args, **kwargs):
        return await self._analytics.compare_versions(*args, **kwargs)

    async def get_version_analytics(self, *args, **kwargs):
        return await self._analytics.get_version_analytics(*args, **kwargs)

    async def get_family_analytics(self, *args, **kwargs):
        return await self._analytics.get_family_analytics(*args, **kwargs)

    async def get_top_performing_versions(self, *args, **kwargs):
        return await self._analytics.get_top_performing_versions(*args, **kwargs)

    # ===== Operations (delegate to PromptOperationsService) =====

    async def batch_create_versions(self, *args, **kwargs):
        return await self._operations.batch_create_versions(*args, **kwargs)

    async def export_family(self, *args, **kwargs):
        return await self._operations.export_family(*args, **kwargs)

    async def import_family(self, *args, **kwargs):
        return await self._operations.import_family(*args, **kwargs)

    async def infer_versions_from_assets(self, *args, **kwargs):
        return await self._operations.infer_versions_from_assets(*args, **kwargs)

    async def find_similar_prompts(self, *args, **kwargs):
        return await self._operations.find_similar_prompts(*args, **kwargs)

    def validate_template_prompt(self, *args, **kwargs):
        return self._operations.validate_template_prompt(*args, **kwargs)

    def render_template_prompt(self, *args, **kwargs):
        return self._operations.render_template_prompt(*args, **kwargs)

    async def validate_prompt_for_provider(self, *args, **kwargs):
        return await self._operations.validate_prompt_for_provider(*args, **kwargs)

    async def validate_version_for_provider(self, *args, **kwargs):
        return await self._operations.validate_version_for_provider(*args, **kwargs)

    async def update_provider_compatibility(self, *args, **kwargs):
        return await self._operations.update_provider_compatibility(*args, **kwargs)
