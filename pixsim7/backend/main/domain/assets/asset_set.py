"""Asset set domain models — backend-native named collections of assets.

Replaces the former localStorage-only ``useAssetSetStore`` so sets can drive
server-side queries (relocation include/exclude, gallery filter-by-set,
smart-set resolution). Two kinds:

* ``manual`` — explicit membership rows in ``asset_set_member`` (position-ordered)
* ``smart``  — a saved ``AssetFilters`` criteria blob (``filters``) resolved
  dynamically at query time; carries no membership rows.

Owned per-user (``ASSET_SET_POLICY``: USER scope + ``SHARED_FLAG`` so an owner
may optionally publish a set to everyone). Mirrors the ``Tag`` / ``AssetTag``
shape. See plan ``asset-sets-backend`` (checkpoint s1).
"""
from typing import Optional, Dict, Any
from datetime import datetime

from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON, ForeignKey, Integer

from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim7.common.ownership import OwnershipPolicy, OwnershipScope, SHARED_FLAG


# Set kinds. ``manual`` holds explicit asset ids; ``smart`` holds filter criteria.
ASSET_SET_KINDS = ("manual", "smart")


class AssetSet(SQLModel, table=True):
    """A named, per-user collection of assets (manual membership or smart filter)."""

    __tablename__ = "asset_set"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # ===== OWNERSHIP =====
    # sa_column (not foreign_key=) so the ON DELETE CASCADE matches the
    # migration — create_all-based tests would otherwise build a cascade-less FK.
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("users.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        description="Owner (ASSET_SET_POLICY, USER scope)",
    )

    # ===== IDENTITY / DISPLAY =====
    name: str = Field(max_length=200, description="Display name")
    kind: str = Field(
        default="manual",
        max_length=16,
        index=True,
        description="manual (explicit members) | smart (saved filter criteria)",
    )
    description: Optional[str] = Field(default=None, max_length=1000)
    color: Optional[str] = Field(default=None, max_length=32)
    icon: Optional[str] = Field(
        default=None,
        max_length=200,
        description="Optional @lib/icons name shown on set badges/hover toggles",
    )

    # ===== SMART-SET CRITERIA (null for manual sets) =====
    filters: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Saved AssetFilters blob for smart sets; resolved at query time",
    )
    max_results: Optional[int] = Field(
        default=None,
        description="Optional cap on smart-set resolution size",
    )

    # ===== ACCESS FLAG =====
    is_shared: bool = Field(
        default=False,
        index=True,
        description="SHARED_FLAG — owner may publish the set to all principals",
    )

    # ===== TIMESTAMPS =====
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow)

    def __repr__(self) -> str:
        return f"<AssetSet(id={self.id}, name={self.name!r}, kind={self.kind!r})>"


class AssetSetMember(SQLModel, table=True):
    """Join row linking a manual ``AssetSet`` to an asset, position-ordered.

    Smart sets carry no member rows — their contents are derived from
    ``AssetSet.filters`` at query time.
    """

    __tablename__ = "asset_set_member"

    # Composite primary key. sa_column carries ON DELETE CASCADE so deleting a
    # set (or its assets) drops membership — matching the migration.
    set_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("asset_set.id", ondelete="CASCADE"),
            primary_key=True,
            index=True,
        ),
    )
    asset_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("assets.id", ondelete="CASCADE"),
            primary_key=True,
            index=True,
        ),
    )

    # Ordering within the set (lower = earlier).
    position: int = Field(default=0, index=True)

    created_at: datetime = Field(default_factory=utcnow)

    def __repr__(self) -> str:
        return f"<AssetSetMember(set_id={self.set_id}, asset_id={self.asset_id}, pos={self.position})>"


# Per-model ownership policy (composable-access-policy canon). USER-scoped with
# the shared read-widening flag so an owner can publish a set without losing
# edit rights. Declared next to the model so consumers import one symbol.
ASSET_SET_POLICY = OwnershipPolicy(
    scope=OwnershipScope.USER,
    owner_field="user_id",
    access_flags=(SHARED_FLAG,),
)
