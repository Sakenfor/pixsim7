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

from . import families, variants, analytics, operations, meta, audit

# Create main router
router = APIRouter(prefix="/prompts", tags=["prompts"])

# Include all sub-routers
router.include_router(families.router)
router.include_router(variants.router)
router.include_router(analytics.router)
router.include_router(operations.router)
router.include_router(meta.router)
router.include_router(audit.router)

# Backward-compatible exports for callers that import individual prompt routers.
families_router = families.router
variants_router = variants.router
analytics_router = analytics.router
operations_router = operations.router
meta_router = meta.router
audit_router = audit.router

__all__ = [
    "router",
    "families_router",
    "variants_router",
    "analytics_router",
    "operations_router",
    "meta_router",
    "audit_router",
]
