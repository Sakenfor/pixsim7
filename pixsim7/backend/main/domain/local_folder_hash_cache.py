"""
Local Folder Hash Cache — persists client-side SHA-256 hashes so they
survive browser data clears (IndexedDB wipe).

One row per (user, folder).  The ``manifest`` column holds the full
hash manifest as a JSON array.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import Column, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from pixsim7.backend.main.shared.datetime_utils import utcnow


class LocalFolderHashCache(SQLModel, table=True):
    __tablename__ = "local_folder_hash_cache"
    __table_args__ = (
        Index("ix_lfhc_user_folder", "user_id", "folder_id", unique=True),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    folder_id: str = Field(max_length=255)
    manifest: list = Field(default_factory=list, sa_column=Column(JSONB, nullable=False, server_default=sa.text("'[]'")))
    updated_at: datetime = Field(default_factory=utcnow)
