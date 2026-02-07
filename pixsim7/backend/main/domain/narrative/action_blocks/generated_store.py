"""
Persistence helpers for generated action blocks cached in the database.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON, String, DateTime, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.shared.datetime_utils import utcnow


class GeneratedActionBlockRecord(SQLModel, table=True):
    """
    Database record storing a serialized action block plus provenance info.
    """

    __tablename__ = "generated_action_blocks"

    id: Optional[int] = Field(default=None, primary_key=True)
    block_id: str = Field(sa_column=Column(String(128), unique=True, index=True))
    kind: str = Field(sa_column=Column(String(32), default="single_state"))
    block_json: Dict[str, Any] = Field(sa_column=Column(JSON, nullable=False))
    source: Optional[str] = Field(default=None, sa_column=Column(String(64), nullable=True))
    previous_block_id: Optional[str] = Field(
        default=None, sa_column=Column(String(128), nullable=True, index=True)
    )
    reference_asset_id: Optional[int] = Field(default=None, index=True)
    meta: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), index=True),
    )


class GeneratedBlockStore:
    """
    Thin repository for loading/saving generated action blocks.
    """

    async def load_blocks(self, session: AsyncSession) -> List[Dict[str, Any]]:
        """Return all stored blocks as raw dicts."""
        result = await session.execute(select(GeneratedActionBlockRecord))
        return [record.block_json for record in result.scalars().all()]

    async def upsert_block(
        self,
        session: AsyncSession,
        block_data: Dict[str, Any],
        *,
        source: Optional[str] = None,
        previous_block_id: Optional[str] = None,
        reference_asset_id: Optional[int] = None,
        meta: Optional[Dict[str, Any]] = None,
    ) -> GeneratedActionBlockRecord:
        """
        Persist the action block, replacing any existing row with the same id.
        """
        block_id = block_data.get("id")
        if not block_id:
            raise ValueError("Generated blocks must include an 'id' field")

        result = await session.execute(
            select(GeneratedActionBlockRecord).where(GeneratedActionBlockRecord.block_id == block_id)
        )
        record = result.scalar_one_or_none()

        payload = {
            "block_json": block_data,
            "kind": block_data.get("kind", "single_state"),
            "source": source,
            "previous_block_id": previous_block_id,
            "reference_asset_id": reference_asset_id,
            "meta": meta,
        }

        if record:
            for key, value in payload.items():
                setattr(record, key, value)
        else:
            record = GeneratedActionBlockRecord(block_id=block_id, **payload)
            session.add(record)

        await session.commit()
        await session.refresh(record)
        return record
