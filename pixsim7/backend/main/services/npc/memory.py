"""
NPC Memory Service

Manages conversation memories, emotional states, and topic tracking for NPCs.
Provides methods to:
- Store new memories
- Recall relevant memories
- Manage memory decay
- Track conversation topics
"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, desc, func

from pixsim7.backend.main.domain.game.entities.npc_memory import (
    ConversationMemory,
    NPCEmotionalState,
    ConversationTopic,
    MemoryType,
    MemoryImportance,
    EmotionType
)
from pixsim7.backend.main.domain.game.entities.memory_policy import (
    get_policy,
    build_decay_rate_case,
    MEMORY_CONSTANTS,
)
from pixsim7.backend.main.services.npc.base import TemporalNPCService


class MemoryService(TemporalNPCService):
    """Service for managing NPC conversation memories"""

    async def create_memory(
        self,
        npc_id: int,
        user_id: int,
        topic: str,
        summary: str,
        player_said: Optional[str] = None,
        npc_said: Optional[str] = None,
        session_id: Optional[int] = None,
        importance: MemoryImportance = MemoryImportance.NORMAL,
        memory_type: MemoryType = MemoryType.SHORT_TERM,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        location_id: Optional[int] = None,
        world_time: Optional[float] = None,
        npc_emotion: Optional[EmotionType] = None,
        relationship_tier: Optional[str] = None
    ) -> ConversationMemory:
        """
        Create a new conversation memory

        Args:
            npc_id: NPC who has this memory
            user_id: Player this memory is about
            topic: Main topic (e.g., 'asked_about_family', 'complimented_appearance')
            summary: Brief summary of what happened
            player_said: What the player said (optional)
            npc_said: How the NPC responded (optional)
            session_id: Session this occurred in
            importance: How important this memory is
            memory_type: Short-term, long-term, or working memory
            tags: Tags for easy retrieval
            metadata: Additional context
            location_id: Where this happened
            world_time: Game time when this happened
            npc_emotion: NPC's emotion at the time
            relationship_tier: Relationship tier at the time

        Returns:
            Created memory
        """
        # Calculate expiration based on type and importance
        expires_at = self._calculate_expiration(memory_type, importance)

        memory = ConversationMemory(
            npc_id=npc_id,
            user_id=user_id,
            session_id=session_id,
            topic=topic,
            summary=summary,
            player_said=player_said,
            npc_said=npc_said,
            importance=importance,
            memory_type=memory_type,
            tags=tags or [],
            meta=metadata or {},
            location_id=location_id,
            world_time=world_time,
            npc_emotion_at_time=npc_emotion,
            relationship_tier_at_time=relationship_tier,
            expires_at=expires_at
        )

        return await self._persist(memory)

    def _calculate_expiration(
        self,
        memory_type: MemoryType,
        importance: MemoryImportance
    ) -> Optional[datetime]:
        """
        Calculate when a memory should expire

        Args:
            memory_type: Type of memory
            importance: Importance level

        Returns:
            Expiration datetime or None for permanent
        """
        ttl = get_policy(memory_type, importance).ttl
        if ttl is None:
            return None
        return datetime.now(timezone.utc) + ttl

    async def recall_memories(
        self,
        npc_id: int,
        user_id: int,
        topic: Optional[str] = None,
        tags: Optional[List[str]] = None,
        session_id: Optional[int] = None,
        limit: int = 10,
        min_importance: Optional[MemoryImportance] = None,
        include_expired: bool = False
    ) -> List[ConversationMemory]:
        """
        Recall relevant memories

        Args:
            npc_id: NPC whose memories to recall
            user_id: Player these memories are about
            topic: Filter by specific topic
            tags: Filter by tags (returns memories with ANY of these tags)
            session_id: Filter by session
            limit: Maximum number of memories to return
            min_importance: Minimum importance level
            include_expired: Whether to include expired memories

        Returns:
            List of relevant memories, ordered by recency and importance
        """
        query = select(ConversationMemory).where(
            and_(
                ConversationMemory.npc_id == npc_id,
                ConversationMemory.user_id == user_id
            )
        )

        # Filter by topic
        if topic:
            query = query.where(ConversationMemory.topic == topic)

        # Filter by tags — match memories containing ANY of the given tags
        if tags:
            from sqlalchemy import cast, literal
            from sqlalchemy.dialects.postgresql import JSONB as JSONB_TYPE
            tag_conditions = [
                ConversationMemory.tags.contains(cast(literal([tag]), JSONB_TYPE))
                for tag in tags
            ]
            query = query.where(or_(*tag_conditions))

        # Filter by session
        if session_id:
            query = query.where(ConversationMemory.session_id == session_id)

        # Filter by importance
        if min_importance:
            valid_importances = [
                imp for imp in MemoryImportance if imp >= min_importance
            ]
            query = query.where(ConversationMemory.importance.in_(valid_importances))

        # Filter expired
        if not include_expired:
            now = datetime.now(timezone.utc)
            query = query.where(
                or_(
                    ConversationMemory.expires_at.is_(None),
                    ConversationMemory.expires_at > now
                )
            )

        # Order by importance and recency
        # Use a weighted scoring system
        query = query.order_by(
            desc(ConversationMemory.importance),
            desc(ConversationMemory.strength),
            desc(ConversationMemory.created_at)
        ).limit(limit)

        result = await self.db.execute(query)
        memories = list(result.scalars().all())

        # Bulk update access tracking for all recalled memories
        if memories:
            from sqlalchemy import update
            memory_ids = [m.id for m in memories]
            now = datetime.now(timezone.utc)
            await self.db.execute(
                update(ConversationMemory)
                .where(ConversationMemory.id.in_(memory_ids))
                .values(
                    access_count=ConversationMemory.access_count + 1,
                    last_accessed_at=now,
                    strength=func.least(1.0, ConversationMemory.strength + MEMORY_CONSTANTS.access_boost),
                )
            )
            await self.db.commit()

        return memories

    async def get_recent_conversation(
        self,
        npc_id: int,
        user_id: int,
        session_id: Optional[int] = None,
        limit: int = 5
    ) -> List[ConversationMemory]:
        """
        Get recent conversation exchanges

        Args:
            npc_id: NPC ID
            user_id: Player ID
            session_id: Optional session filter
            limit: Number of recent exchanges

        Returns:
            Recent conversation memories
        """
        query = select(ConversationMemory).where(
            and_(
                ConversationMemory.npc_id == npc_id,
                ConversationMemory.user_id == user_id
            )
        )

        if session_id:
            query = query.where(ConversationMemory.session_id == session_id)

        query = query.order_by(desc(ConversationMemory.created_at)).limit(limit)

        return await self._fetch_list(query)

    async def decay_memories(self, npc_id: int) -> int:
        """
        Apply decay to memories (reduce strength over time).

        Uses a single SQL UPDATE with CASE-based decay rates instead of
        loading all memories into Python.

        Args:
            npc_id: NPC whose memories to decay

        Returns:
            Number of memories decayed
        """
        from sqlalchemy import update, literal, extract

        now = datetime.now(timezone.utc)

        # Hours since last interaction (last_accessed_at or created_at)
        hours_since = extract(
            'epoch',
            literal(now) - func.coalesce(
                ConversationMemory.last_accessed_at,
                ConversationMemory.created_at
            )
        ) / 3600.0

        # Decay rate based on memory_type and importance
        decay_rate = build_decay_rate_case(
            ConversationMemory.memory_type,
            ConversationMemory.importance,
        )

        new_strength = func.greatest(
            0.0,
            ConversationMemory.strength - decay_rate * hours_since
        )

        stmt = (
            update(ConversationMemory)
            .where(ConversationMemory.npc_id == npc_id)
            .values(strength=new_strength)
        )

        result = await self.db.execute(stmt)
        await self.db.commit()
        return result.rowcount

    async def forget_expired_memories(self) -> int:
        """
        Delete expired memories using a single bulk DELETE.

        Returns:
            Number of memories deleted
        """
        return await self._bulk_expire(
            ConversationMemory,
            expires_col=ConversationMemory.expires_at,
            extra_or_conditions=(
                ConversationMemory.strength < MEMORY_CONSTANTS.weakness_threshold,
            ),
        )

    async def promote_to_long_term(
        self,
        memory_id: int
    ) -> Optional[ConversationMemory]:
        """
        Promote a short-term memory to long-term

        Args:
            memory_id: Memory to promote

        Returns:
            Updated memory or None if not found
        """
        memory = await self.db.get(ConversationMemory, memory_id)
        if not memory:
            return None

        memory.memory_type = MemoryType.LONG_TERM
        if memory.importance < MemoryImportance.IMPORTANT:
            memory.importance = MemoryImportance.IMPORTANT
        memory.strength = 1.0
        memory.expires_at = self._calculate_expiration(
            MemoryType.LONG_TERM,
            memory.importance
        )

        await self.db.commit()
        await self.db.refresh(memory)

        return memory

    async def get_memory_summary(
        self,
        npc_id: int,
        user_id: int
    ) -> Dict[str, Any]:
        """
        Get a summary of all memories for this NPC-player pair

        Args:
            npc_id: NPC ID
            user_id: Player ID

        Returns:
            Summary statistics
        """
        # Count memories by type
        type_query = select(
            ConversationMemory.memory_type,
            func.count(ConversationMemory.id).label('count')
        ).where(
            and_(
                ConversationMemory.npc_id == npc_id,
                ConversationMemory.user_id == user_id
            )
        ).group_by(ConversationMemory.memory_type)

        type_result = await self.db.execute(type_query)
        type_counts = {row[0]: row[1] for row in type_result}

        # Count by importance
        imp_query = select(
            ConversationMemory.importance,
            func.count(ConversationMemory.id).label('count')
        ).where(
            and_(
                ConversationMemory.npc_id == npc_id,
                ConversationMemory.user_id == user_id
            )
        ).group_by(ConversationMemory.importance)

        imp_result = await self.db.execute(imp_query)
        importance_counts = {row[0]: row[1] for row in imp_result}

        # Get total
        total_query = select(func.count(ConversationMemory.id)).where(
            and_(
                ConversationMemory.npc_id == npc_id,
                ConversationMemory.user_id == user_id
            )
        )
        total_result = await self.db.execute(total_query)
        total = total_result.scalar()

        return {
            "total_memories": total,
            "by_type": type_counts,
            "by_importance": importance_counts
        }
