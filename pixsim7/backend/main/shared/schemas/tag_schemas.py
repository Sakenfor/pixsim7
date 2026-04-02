"""
Tag management request/response schemas
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, model_validator


# ===== RESPONSE SCHEMAS =====

class TagSummary(BaseModel):
    """
    Minimal tag information for asset responses and tag lists.
    """
    id: int
    slug: str
    namespace: str
    name: str
    display_name: Optional[str] = None

    class Config:
        from_attributes = True


class TagDetail(BaseModel):
    """
    Complete tag information including hierarchy and metadata.
    """
    id: int
    slug: str
    namespace: str
    name: str
    display_name: Optional[str] = None

    # Hierarchy
    parent_tag_id: Optional[int] = None
    parent_tag: Optional[TagSummary] = None

    # Aliasing
    canonical_tag_id: Optional[int] = None
    canonical_tag: Optional[TagSummary] = None

    # Extensibility
    meta: Optional[Dict[str, Any]] = None

    # Timestamps
    created_at: datetime
    updated_at: datetime

    # Usage stats (computed)
    usage_count: Optional[int] = Field(default=None, description="Number of assets with this tag")

    class Config:
        from_attributes = True


class TagListResponse(BaseModel):
    """Tag list response with pagination"""
    tags: List[TagSummary]
    total: int
    limit: int
    offset: int


class TagTreeNode(BaseModel):
    """
    Hierarchical tag tree node (for GET /tags/tree).
    """
    id: int
    slug: str
    namespace: str
    name: str
    display_name: Optional[str] = None
    children: List['TagTreeNode'] = Field(default_factory=list)

    class Config:
        from_attributes = True


# ===== REQUEST SCHEMAS =====

class CreateTagRequest(BaseModel):
    """Create a new tag"""
    namespace: str = Field(description="Tag namespace (e.g., character, location, style)")
    name: str = Field(description="Tag name (e.g., alice, tokyo, anime)")
    display_name: Optional[str] = Field(default=None, description="Display name preserving casing")
    parent_tag_id: Optional[int] = Field(default=None, description="Parent tag ID for hierarchy")
    meta: Optional[Dict[str, Any]] = Field(default=None, description="Plugin/provider metadata")


class UpdateTagRequest(BaseModel):
    """Update tag fields"""
    display_name: Optional[str] = Field(default=None, description="Update display name")
    parent_tag_id: Optional[int] = Field(default=None, description="Update parent tag")
    meta: Optional[Dict[str, Any]] = Field(default=None, description="Update metadata")


class CreateAliasRequest(BaseModel):
    """Create an alias tag pointing to a canonical tag"""
    alias_slug: str = Field(description="New alias slug (e.g., 'char:alice')")
    display_name: Optional[str] = Field(default=None, description="Display name for alias")


class AssignTagsRequest(BaseModel):
    """
    Assign/remove tags from an asset.

    Slugs are automatically normalized and resolved to canonical tags.
    """
    add: List[str] = Field(default_factory=list, description="Tag slugs to add")
    remove: List[str] = Field(default_factory=list, description="Tag slugs to remove")


class TagFilterRequest(BaseModel):
    """Filter tags request"""
    namespace: Optional[str] = Field(default=None, description="Filter by namespace")
    q: Optional[str] = Field(default=None, description="Search query (name or slug)")
    limit: int = Field(default=50, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
