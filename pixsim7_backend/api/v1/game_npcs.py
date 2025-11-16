from __future__ import annotations

from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from pixsim7_backend.api.dependencies import CurrentUser, DatabaseSession, NpcExpressionSvc
from pixsim7_backend.domain.game.models import GameNPC


router = APIRouter()


class NpcSummary(BaseModel):
    id: int
    name: str


class NpcExpressionDTO(BaseModel):
    id: Optional[int] = None
    state: str
    asset_id: int
    crop: Optional[Dict[str, Any]] = None
    meta: Optional[Dict[str, Any]] = None


@router.get("/", response_model=List[NpcSummary])
async def list_npcs(
    db: DatabaseSession,
    user: CurrentUser,
) -> List[NpcSummary]:
    """
    List game NPCs.

    Currently returns all NPCs; future versions may filter by workspace/user.
    """
    result = await db.execute(select(GameNPC).order_by(GameNPC.id))
    npcs = result.scalars().all()
    return [NpcSummary(id=n.id, name=n.name) for n in npcs]


@router.get("/{npc_id}/expressions", response_model=List[NpcExpressionDTO])
async def get_npc_expressions(
    npc_id: int,
    npc_expression_service: NpcExpressionSvc,
    user: CurrentUser,
) -> List[NpcExpressionDTO]:
    """
    Get all expression mappings for an NPC.
    """
    expressions = await npc_expression_service.list_expressions(npc_id)
    return [
        NpcExpressionDTO(
            id=e.id,
            state=e.state,
            asset_id=e.asset_id,
            crop=e.crop,
            meta=e.meta,
        )
        for e in expressions
    ]


@router.put("/{npc_id}/expressions", response_model=List[NpcExpressionDTO])
async def replace_npc_expressions(
    npc_id: int,
    payload: Dict[str, Any],
    npc_expression_service: NpcExpressionSvc,
    user: CurrentUser,
) -> List[NpcExpressionDTO]:
    """
    Replace all expressions for an NPC.

    Body shape:
      {
        "expressions": [
          { "state": "idle", "asset_id": 123, "crop": {...}, "meta": {...} },
          ...
        ]
      }
    """
    rows = payload.get("expressions") or []
    if not isinstance(rows, list):
        raise HTTPException(status_code=400, detail="expressions must be a list")

    created = await npc_expression_service.replace_expressions(npc_id, rows)
    return [
        NpcExpressionDTO(
            id=e.id,
            state=e.state,
            asset_id=e.asset_id,
            crop=e.crop,
            meta=e.meta,
        )
        for e in created
    ]

