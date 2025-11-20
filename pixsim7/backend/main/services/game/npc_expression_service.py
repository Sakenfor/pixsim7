from __future__ import annotations

from typing import List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from pixsim7.backend.main.domain.game.models import NpcExpression


class NpcExpressionService:
    """
    Service for managing NPC expression mappings.

    This ties NPCs and conversational states to specific assets (images or clips)
    and optional crop metadata used by the UI.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_expressions(self, npc_id: int) -> List[NpcExpression]:
        result = await self.db.execute(
            select(NpcExpression).where(NpcExpression.npc_id == npc_id).order_by(NpcExpression.state, NpcExpression.id)
        )
        return result.scalars().all()

    async def replace_expressions(self, npc_id: int, rows: List[dict]) -> List[NpcExpression]:
        """
        Replace all expressions for an NPC.

        Each row dict should contain:
          - state: str
          - asset_id: int
          - crop: Optional[dict]
          - meta: Optional[dict]
        """
        await self.db.execute(
            delete(NpcExpression).where(NpcExpression.npc_id == npc_id)
        )

        created: List[NpcExpression] = []
        for r in rows:
            expr = NpcExpression(
                npc_id=npc_id,
                state=r["state"],
                asset_id=r["asset_id"],
                crop=r.get("crop"),
                meta=r.get("meta"),
            )
            self.db.add(expr)
            created.append(expr)

        await self.db.commit()
        for expr in created:
            await self.db.refresh(expr)
        return created

