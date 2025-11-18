from __future__ import annotations

from typing import Optional, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7_backend.domain.game.models import (
    GameSession,
    GameScene,
    GameSceneEdge,
    GameSessionEvent,
    GameWorld,
)
from pixsim7_backend.domain.narrative.relationships import (
    extract_relationship_values,
    compute_relationship_tier,
    compute_intimacy_level,
)


class GameSessionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _normalize_session_relationships(self, session: GameSession) -> None:
        """
        Compute and store tierId and intimacyLevelId for all NPC relationships.

        This makes the backend the authoritative source for relationship tiers/intimacy,
        with frontends consuming these pre-computed values.
        """
        if not session.relationships:
            return

        # TODO: Fetch world metadata for relationship schemas
        # For now, use default schemas (will fall back to hardcoded defaults)
        relationship_schemas: Dict[str, Any] = {}
        intimacy_schema: Optional[Dict[str, Any]] = None

        # Normalize each NPC relationship
        for npc_key in list(session.relationships.keys()):
            if not npc_key.startswith("npc:"):
                continue

            try:
                npc_id = int(npc_key.split(":", 1)[1])
            except (ValueError, IndexError):
                continue

            # Extract values
            affinity, trust, chemistry, tension, flags = extract_relationship_values(
                session.relationships, npc_id
            )

            # Compute tier and intimacy
            tier_id = compute_relationship_tier(affinity, relationship_schemas)
            intimacy_id = compute_intimacy_level(
                {"affinity": affinity, "trust": trust, "chemistry": chemistry, "tension": tension},
                intimacy_schema
            )

            # Store computed values back into the relationship JSON
            if npc_key in session.relationships:
                session.relationships[npc_key]["tierId"] = tier_id
                session.relationships[npc_key]["intimacyLevelId"] = intimacy_id

    async def _get_scene(self, scene_id: int) -> GameScene:
        result = await self.db.execute(
            select(GameScene).where(GameScene.id == scene_id)
        )
        scene = result.scalar_one_or_none()
        if not scene:
            raise ValueError("scene_not_found")
        if not scene.entry_node_id:
            raise ValueError("scene_missing_entry_node")
        return scene

    async def create_session(self, *, user_id: int, scene_id: int) -> GameSession:
        scene = await self._get_scene(scene_id)
        session = GameSession(
            user_id=user_id,
            scene_id=scene.id,
            current_node_id=scene.entry_node_id,
        )
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)

        event = GameSessionEvent(
            session_id=session.id,
            node_id=scene.entry_node_id,
            action="session_created",
            diff={"scene_id": scene.id},
        )
        self.db.add(event)
        await self.db.commit()

        # Normalize relationships before returning
        await self._normalize_session_relationships(session)

        return session

    async def get_session(self, session_id: int) -> Optional[GameSession]:
        session = await self.db.get(GameSession, session_id)
        if session:
            await self._normalize_session_relationships(session)
        return session

    async def advance_session(self, *, session_id: int, edge_id: int) -> GameSession:
        session = await self.db.get(GameSession, session_id)
        if not session:
            raise ValueError("session_not_found")

        result = await self.db.execute(
            select(GameSceneEdge).where(GameSceneEdge.id == edge_id)
        )
        edge = result.scalar_one_or_none()
        if not edge or edge.from_node_id != session.current_node_id:
            raise ValueError("invalid_edge_for_current_node")

        session.current_node_id = edge.to_node_id
        self.db.add(session)

        event = GameSessionEvent(
            session_id=session.id,
            node_id=edge.to_node_id,
            edge_id=edge.id,
            action="advance",
            diff={"from_node_id": edge.from_node_id, "to_node_id": edge.to_node_id},
        )
        self.db.add(event)

        await self.db.commit()
        await self.db.refresh(session)

        # Normalize relationships before returning
        await self._normalize_session_relationships(session)

        return session

    async def update_session(
        self,
        *,
        session_id: int,
        world_time: Optional[float] = None,
        flags: Optional[Dict[str, Any]] = None,
        relationships: Optional[Dict[str, Any]] = None,
    ) -> GameSession:
        session = await self.db.get(GameSession, session_id)
        if not session:
            raise ValueError("session_not_found")

        if world_time is not None:
            session.world_time = float(world_time)
        if flags is not None:
            session.flags = flags
        if relationships is not None:
            session.relationships = relationships

        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)

        # Normalize relationships before returning (especially important after relationship updates)
        await self._normalize_session_relationships(session)

        return session
