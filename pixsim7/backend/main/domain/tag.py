"""
Tag domain models - structured hierarchical tags

Design principles:
- Namespaced tags (e.g., character:alice, location:tokyo)
- Hierarchy support via parent_tag_id
- Aliasing support via canonical_tag_id
- Extensibility via meta jsonb field
"""
from typing import Optional, Dict, Any
from datetime import datetime
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON
import re


class Tag(SQLModel, table=True):
    """
    Structured tag model with namespace and hierarchy support.

    Examples:
    - character:alice (namespace=character, name=alice)
    - location:tokyo (namespace=location, name=tokyo)
    - style:anime (namespace=style, name=anime)

    Hierarchy:
    - character:alice can have parent character:* or entity:character

    Aliasing:
    - char:alice → canonical character:alice (canonical_tag_id points to canonical)
    """
    __tablename__ = "tag"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # ===== IDENTITY =====
    namespace: str = Field(
        max_length=64,
        index=True,
        description="Tag namespace (normalized lowercase): character, location, style"
    )
    name: str = Field(
        max_length=128,
        description="Tag name (normalized lowercase): alice, tokyo, anime"
    )
    slug: str = Field(
        max_length=196,
        unique=True,
        index=True,
        description="Unique slug: namespace:name"
    )

    # ===== DISPLAY =====
    display_name: Optional[str] = Field(
        default=None,
        max_length=256,
        description="Display name preserving original casing (e.g., 'Character: Alice')"
    )

    # ===== HIERARCHY =====
    parent_tag_id: Optional[int] = Field(
        default=None,
        foreign_key="tag.id",
        index=True,
        description="Parent tag ID for hierarchy (e.g., character:alice → entity:character)"
    )

    # ===== ALIASING =====
    canonical_tag_id: Optional[int] = Field(
        default=None,
        foreign_key="tag.id",
        index=True,
        description="Canonical tag ID if this is an alias (e.g., char:alice → character:alice)"
    )

    # ===== EXTENSIBILITY =====
    meta: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Plugin/provider metadata for extensibility"
    )

    # ===== TIMESTAMPS =====
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        index=True
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow
    )

    def __repr__(self):
        return f"<Tag(id={self.id}, slug={self.slug}, canonical_id={self.canonical_tag_id})>"


class AssetTag(SQLModel, table=True):
    """
    Join table linking assets to tags.

    Design:
    - Store only canonical tag IDs (resolve aliases before inserting)
    - Composite primary key (asset_id, tag_id)
    """
    __tablename__ = "asset_tag"

    # Composite primary key
    asset_id: int = Field(
        foreign_key="assets.id",
        primary_key=True,
        index=True
    )
    tag_id: int = Field(
        foreign_key="tag.id",
        primary_key=True,
        index=True
    )

    # Timestamp
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        index=True
    )

    def __repr__(self):
        return f"<AssetTag(asset_id={self.asset_id}, tag_id={self.tag_id})>"


# ===== NORMALIZATION HELPERS =====

def normalize_namespace(namespace: str) -> str:
    """
    Normalize namespace to lowercase, trim whitespace, collapse multiple spaces.

    Examples:
    - "  Character  " → "character"
    - "LOCATION" → "location"
    - "Style   Category" → "style category" (but validate_slug would reject this)
    """
    return re.sub(r'\s+', ' ', namespace.strip().lower())


def normalize_name(name: str) -> str:
    """
    Normalize name to lowercase, trim whitespace, collapse multiple spaces.

    Examples:
    - "  Alice  " → "alice"
    - "TOKYO" → "tokyo"
    - "Neon  Cyberpunk" → "neon cyberpunk" (but validate_slug would reject this)
    """
    return re.sub(r'\s+', ' ', name.strip().lower())


def make_slug(namespace: str, name: str) -> str:
    """
    Create slug from namespace and name (both should be pre-normalized).

    Examples:
    - ("character", "alice") → "character:alice"
    - ("location", "tokyo") → "location:tokyo"
    """
    return f"{namespace}:{name}"


def parse_slug(slug: str) -> tuple[str, str]:
    """
    Parse slug into (namespace, name).

    Raises ValueError if slug format is invalid.

    Examples:
    - "character:alice" → ("character", "alice")
    - "location:tokyo" → ("location", "tokyo")
    - "invalid" → ValueError
    - "too:many:parts" → ValueError
    """
    parts = slug.split(':')
    if len(parts) != 2:
        raise ValueError(f"Invalid slug format: {slug}. Expected 'namespace:name'")

    namespace, name = parts
    if not namespace or not name:
        raise ValueError(f"Invalid slug format: {slug}. Namespace and name cannot be empty")

    return namespace, name


def validate_slug(slug: str) -> bool:
    """
    Validate slug format: namespace:name with no spaces, no empty parts.

    Returns True if valid, False otherwise.

    Examples:
    - "character:alice" → True
    - "location:tokyo" → True
    - "invalid" → False
    - "has space:name" → False
    - ":empty" → False
    """
    try:
        namespace, name = parse_slug(slug)

        # Check for spaces
        if ' ' in namespace or ' ' in name:
            return False

        # Check for empty parts (already checked in parse_slug, but explicit)
        if not namespace or not name:
            return False

        return True
    except ValueError:
        return False


def normalize_slug(slug: str) -> str:
    """
    Normalize a slug by parsing, normalizing parts, and rebuilding.

    Raises ValueError if slug format is invalid.

    Examples:
    - "Character:Alice" → "character:alice"
    - "  LOCATION : Tokyo  " → "location:tokyo"
    """
    namespace, name = parse_slug(slug)
    namespace = normalize_namespace(namespace)
    name = normalize_name(name)

    if not validate_slug(f"{namespace}:{name}"):
        raise ValueError(f"Invalid slug after normalization: {namespace}:{name}")

    return make_slug(namespace, name)
