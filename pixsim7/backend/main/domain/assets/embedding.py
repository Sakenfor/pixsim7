"""
AssetEmbedding model — multi-vector store for asset similarity search.

Each row pairs an asset with a named embedder (e.g., 'siglip2-large',
'fashion-clip', 'pose-embed'). Multiple embedders can coexist per asset.
Search code joins against embedder_id to query the right vector space.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pgvector.sqlalchemy import Vector
from pydantic import ConfigDict
from sqlalchemy import Column
from sqlmodel import Field, SQLModel

from pixsim7.backend.main.shared.datetime_utils import utcnow


class AssetEmbedding(SQLModel, table=True):
    """Vector embedding for an asset, keyed by embedder."""

    __tablename__ = "asset_embedding"
    model_config = ConfigDict(protected_namespaces=())

    asset_id: int = Field(
        foreign_key="assets.id",
        primary_key=True,
    )
    embedder_id: str = Field(
        max_length=100,
        primary_key=True,
    )

    vector: List[float] = Field(
        sa_column=Column(Vector(1024), nullable=False),
    )
    model_id: Optional[str] = Field(
        default=None,
        max_length=100,
    )
    generated_at: datetime = Field(default_factory=utcnow)
