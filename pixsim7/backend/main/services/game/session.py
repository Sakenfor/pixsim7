from __future__ import annotations

from typing import Optional, Dict, Any
import json
import logging
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

logger = logging.getLogger(__name__)

try:
    from redis.asyncio import Redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    Redis = None  # type: ignore

from pixsim7.backend.main.domain.game import (
    GameSession,
    GameScene,
    GameSceneEdge,
    GameSessionEvent,
    GameWorld,
)
from pixsim7.backend.main.services.game.stat import StatService


# Type for action names - kept short for storage efficiency
ActionType = str  # e.g., "session_created", "advance", "inventory_add", "quest_add"


class GameSessionService:
    def __init__(self, db: AsyncSession, redis: Optional[Redis] = None):
        self.db = db
        self.redis = redis if REDIS_AVAILABLE else None
        # Use StatService for generic stat normalization
        self.stat_service = StatService(db, redis)

    async def _invalidate_cached_relationships(self, session_id: int):
        """Invalidate cached stat data for a session."""
        await self.stat_service.invalidate_all_session_stats(session_id)

    async def _cleanup_old_events(self, session_id: int, keep_last_n: int = 1000) -> None:
        """
        Keep only the last N events for a session to prevent unbounded growth.

        This is called after creating new events to maintain a rolling window
        of events while preventing database bloat.

        Args:
            session_id: The session to clean up events for
            keep_last_n: Number of most recent events to keep (default: 1000)
        """
        try:
            # Get the threshold timestamp (timestamp of the Nth most recent event)
            result = await self.db.execute(
                select(GameSessionEvent.ts)
                .where(GameSessionEvent.session_id == session_id)
                .order_by(GameSessionEvent.ts.desc())
                .offset(keep_last_n)
                .limit(1)
            )
            threshold_ts = result.scalar_one_or_none()

            # Delete events older than the threshold
            if threshold_ts:
                delete_result = await self.db.execute(
                    delete(GameSessionEvent)
                    .where(
                        GameSessionEvent.session_id == session_id,
                        GameSessionEvent.ts < threshold_ts
                    )
                )
                deleted_count = delete_result.rowcount
                if deleted_count > 0:
                    logger.info(
                        f"Cleaned up {deleted_count} old events for session {session_id}",
                        extra={"session_id": session_id, "deleted_count": deleted_count}
                    )
        except Exception as e:
            # Log warning but don't fail the operation
            logger.warning(
                f"Event cleanup failed for session {session_id}: {e}",
                extra={"session_id": session_id, "operation": "event_cleanup"}
            )
            pass

    async def _normalize_session_relationships(self, session: GameSession) -> None:
        """Normalize relationship stats for a session using the generic stat service."""
        await self.stat_service.normalize_session_stats(session, "relationships")

    async def create_event(
        self,
        session_id: int,
        action: ActionType,
        diff: Optional[Dict[str, Any]] = None,
        node_id: Optional[int] = None,
        edge_id: Optional[int] = None,
        cleanup: bool = True,
    ) -> GameSessionEvent:
        """
        Create a session event for tracking state mutations.

        Args:
            session_id: The session this event belongs to
            action: Short action name (max 64 chars), e.g., "inventory_add", "quest_complete"
            diff: Optional dict describing the change (kept small for efficiency)
            node_id: Optional scene node reference
            edge_id: Optional scene edge reference
            cleanup: Whether to run cleanup after creating event (default True)

        Returns:
            The created GameSessionEvent

        Example:
            await service.create_event(
                session_id=123,
                action="inventory_add",
                diff={"item_id": "sword", "quantity": 1}
            )
        """
        event = GameSessionEvent(
            session_id=session_id,
            action=action[:64],  # Enforce max length
            diff=diff,
            node_id=node_id,
            edge_id=edge_id,
        )
        self.db.add(event)
        await self.db.commit()

        if cleanup:
            await self._cleanup_old_events(session_id)

        return event

    async def get_events(
        self,
        session_id: int,
        limit: int = 200,
        before_ts: Optional[str] = None,
        after_ts: Optional[str] = None,
    ) -> list[GameSessionEvent]:
        """
        Get events for a session with optional time filtering.

        Args:
            session_id: The session to get events for
            limit: Maximum number of events to return (default 200, max 1000)
            before_ts: ISO timestamp - only return events before this time
            after_ts: ISO timestamp - only return events after this time

        Returns:
            List of GameSessionEvent ordered by timestamp descending (most recent first)
        """
        from datetime import datetime

        limit = min(limit, 1000)  # Cap at 1000

        query = (
            select(GameSessionEvent)
            .where(GameSessionEvent.session_id == session_id)
        )

        if before_ts:
            try:
                before_dt = datetime.fromisoformat(before_ts.replace("Z", "+00:00"))
                query = query.where(GameSessionEvent.ts < before_dt)
            except ValueError:
                pass  # Ignore invalid timestamps

        if after_ts:
            try:
                after_dt = datetime.fromisoformat(after_ts.replace("Z", "+00:00"))
                query = query.where(GameSessionEvent.ts > after_dt)
            except ValueError:
                pass  # Ignore invalid timestamps

        query = query.order_by(GameSessionEvent.ts.desc()).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def normalize_session_stats(
        self,
        session: GameSession,
        stat_definition_id: str
    ) -> None:
        """
        Normalize any stat type for a session using the generic stat service.

        Args:
            session: The game session
            stat_definition_id: Which stat type to normalize (e.g., "relationships", "skills")

        Example:
            await self.normalize_session_stats(session, "relationships")
            await self.normalize_session_stats(session, "skills")
        """
        await self.stat_service.normalize_session_stats(session, stat_definition_id)

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

    async def create_session(
        self, *, user_id: int, scene_id: int, world_id: Optional[int] = None, flags: Optional[Dict[str, Any]] = None
    ) -> GameSession:
        """
        Create a new game session for a user.

        Validates world ownership if world_id is provided to ensure users
        can only create sessions for worlds they own.
        """
        scene = await self._get_scene(scene_id)

        # Validate world ownership if world_id provided
        if world_id is not None:
            result = await self.db.execute(
                select(GameWorld).where(GameWorld.id == world_id)
            )
            world = result.scalar_one_or_none()
            if not world:
                raise ValueError("world_not_found")
            if world.owner_user_id != user_id:
                raise ValueError("world_access_denied")

        session = GameSession(
            user_id=user_id,
            scene_id=scene.id,
            current_node_id=scene.entry_node_id,
            world_id=world_id,
            flags=flags or {},
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

        # Clean up old events to prevent unbounded growth
        await self._cleanup_old_events(session.id)

        # Only normalize if relationships exist (optimization)
        if session.stats.get("relationships"):
            await self._normalize_session_relationships(session)

        return session

    async def get_session(self, session_id: int) -> Optional[GameSession]:
        """
        Get session without normalization.

        IMPORTANT: This returns raw relationship data without computed
        tierId/intimacyLevelId fields. This optimization avoids redundant
        database queries when the client doesn't need fresh computed values.

        Normalization only happens on write operations (create_session,
        advance_session, update_session) to ensure consistency when
        relationships are modified.

        Clients consuming this data should either:
        1. Use cached values from previous POST/PATCH responses (recommended)
        2. Compute tiers/intimacy locally using world schemas
        3. Call update_session with an empty relationships patch to trigger
           server-side normalization and caching

        This design reduces database load for read-heavy workloads while
        maintaining correctness for write operations.
        """
        session = await self.db.get(GameSession, session_id)
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

        # Clean up old events to prevent unbounded growth
        await self._cleanup_old_events(session.id)

        # Only normalize if relationships exist (optimization)
        if session.stats.get("relationships"):
            await self._invalidate_cached_relationships(session.id)
            await self._normalize_session_relationships(session)

        return session

    async def update_session(
        self,
        *,
        session_id: int,
        world_time: Optional[float] = None,
        flags: Optional[Dict[str, Any]] = None,
        stats: Optional[Dict[str, Any]] = None,
        expected_version: Optional[int] = None,
    ) -> GameSession:
        session = await self.db.get(GameSession, session_id)
        if not session:
            raise ValueError("session_not_found")

        # Check version for optimistic locking
        if expected_version is not None and session.version != expected_version:
            raise ValueError("version_conflict")

        # Validate turn-based mode constraints
        if world_time is not None:
            effective_flags = flags if flags is not None else session.flags
            if effective_flags and effective_flags.get('sessionKind') == 'world':
                world_config = effective_flags.get('world', {})
                if world_config.get('mode') == 'turn_based':
                    turn_delta = world_config.get('turnDeltaSeconds', 3600)

                    # Use Decimal for precise floating-point comparison
                    actual_delta = Decimal(str(world_time)) - Decimal(str(session.world_time))
                    expected_delta = Decimal(str(turn_delta))
                    tolerance = Decimal("0.001")  # 1ms tolerance for floating point

                    # Allow turn delta advancement or no change (e.g., updating other fields)
                    if abs(actual_delta) > tolerance and abs(actual_delta - expected_delta) > tolerance:
                        raise ValueError(
                            f"turn_based_validation_failed: expected delta of {turn_delta}s, got {float(actual_delta)}s"
                        )

        # Track if any changes were made and what changed (for events)
        changed = False
        relationship_updated = False
        diff: Dict[str, Any] = {}

        if world_time is not None and world_time != session.world_time:
            diff["world_time"] = {"old": session.world_time, "new": world_time}
            session.world_time = float(world_time)
            changed = True
        if flags is not None and flags != session.flags:
            diff["flags_updated"] = True  # Don't include full flags in diff (too large)
            session.flags = flags
            changed = True

        # Handle stats parameter
        if stats is not None and stats != session.stats:
            diff["stats_updated"] = True  # Don't include full stats in diff (too large)
            session.stats = stats
            changed = True
            # Check if relationships were updated
            if "relationships" in stats:
                relationship_updated = True

        # Only increment version if changes were made
        if changed:
            session.version += 1

        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)

        # Create event for the update if changes occurred
        if changed:
            await self.create_event(
                session_id=session.id,
                action="session_update",
                diff=diff if diff else None,
                cleanup=True,
            )

        # Only normalize if relationships were updated (optimization)
        if relationship_updated:
            await self._invalidate_cached_relationships(session.id)
            await self._normalize_session_relationships(session)

        return session
