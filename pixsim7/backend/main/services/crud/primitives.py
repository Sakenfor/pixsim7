"""
Shared CRUD response primitives.

Used by both services/crud/registry (lightweight) and services/entity_crud (heavy).
Keeps API response shapes consistent across CRUD systems so meta contracts
can describe both uniformly.
"""

from typing import Any, List

from pydantic import BaseModel


# Re-export the canonical ErrorResponse from shared schemas
from pixsim7.backend.main.shared.schemas.error_response import ErrorResponse


class PaginatedResponse(BaseModel):
    """Generic paginated list response."""
    items: List[Any]
    total: int
    limit: int
    offset: int
    has_more: bool


class DeleteResponse(BaseModel):
    """Response for delete operations."""
    success: bool
    message: str


__all__ = [
    "ErrorResponse",
    "PaginatedResponse",
    "DeleteResponse",
]
