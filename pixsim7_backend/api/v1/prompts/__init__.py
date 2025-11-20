"""
Prompt Versioning API

Modular prompt versioning API split for better AI agent navigation.

Modules:
- schemas: Request/Response models
- families: Family and Version CRUD
- variants: Variant feedback and ratings
- analytics: Performance analytics and comparisons
- operations: Batch ops, import/export, search, templates, validation
"""
from fastapi import APIRouter

from . import families, variants, analytics, operations

# Create main router
router = APIRouter(prefix="/prompts", tags=["prompts"])

# Include all sub-routers
router.include_router(families.router)
router.include_router(variants.router)
router.include_router(analytics.router)
router.include_router(operations.router)

__all__ = ["router"]
