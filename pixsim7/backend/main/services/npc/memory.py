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


class MemoryService:
    """Service for managing NPC conversation memories"""

    def __init__(self, db: AsyncSession):
        self.db = db

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

        self.db.add(memory)
        await self.db.commit()
        await self.db.refresh(memory)

        return memory

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
        now = datetime.now(timezone.utc)

        # Long-term memories don't expire (or expire very slowly)
        if memory_type == MemoryType.LONG_TERM:
            if importance == MemoryImportance.CRITICAL:
                return None  # Never forget
            elif importance == MemoryImportance.IMPORTANT:
                return now + timedelta(days=365)  # 1 year
            else:
                return now + timedelta(days=90)  # 3 months

        # Short-term memories decay based on importance
        elif memory_type == MemoryType.SHORT_TERM:
            if importance == MemoryImportance.CRITICAL:
                return now + timedelta(days=30)  # 30 days
            elif importance == MemoryImportance.IMPORTANT:
                return now + timedelta(days=7)  # 1 week
            elif importance == MemoryImportance.NORMAL:
                return now + timedelta(days=1)  # 1 day
            else:  # TRIVIAL
                return now + timedelta(hours=6)  # 6 hours

        # Working memory is very short-lived
        else:  # WORKING
            return now + timedelta(hours=1)  # 1 hour

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

        # Filter by tags
        if tags:
            # PostgreSQL JSON array overlap operator
            tag_conditions = [
                func.jsonb_array_length(
                    func.jsonb_path_query_array(
                        ConversationMemory.tags,
                        f'$[*] ? (@ == "{tag}")'
                    )
                ) > 0
                for tag in tags
            ]
            query = query.where(or_(*tag_conditions))

        # Filter by session
        if session_id:
            query = query.where(ConversationMemory.session_id == session_id)

        # Filter by importance
        if min_importance:
            importance_order = {
                MemoryImportance.TRIVIAL: 0,
                MemoryImportance.NORMAL: 1,
                MemoryImportance.IMPORTANT: 2,
                MemoryImportance.CRITICAL: 3
            }
            min_level = importance_order[min_importance]
            valid_importances = [
                imp for imp, level in importance_order.items()
                if level >= min_level
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
        memories = result.scalars().all()

        # Update access tracking
        for memory in memories:
            memory.access_count += 1
            memory.last_accessed_at = datetime.now(timezone.utc)
            # Accessing a memory slightly strengthens it
            memory.strength = min(1.0, memory.strength + 0.05)

        await self.db.commit()

        return list(memories)

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

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def decay_memories(self, npc_id: int) -> int:
        """
        Apply decay to memories (reduce strength over time)

        Args:
            npc_id: NPC whose memories to decay

        Returns:
            Number of memories decayed
        """
        # Get all active memories
        query = select(ConversationMemory).where(
            ConversationMemory.npc_id == npc_id
        )

        result = await self.db.execute(query)
        memories = result.scalars().all()

        decayed_count = 0
        now = datetime.now(timezone.utc)

        for memory in memories:
            # Calculate time since last access or creation
            last_interaction = memory.last_accessed_at or memory.created_at
            hours_since = (now - last_interaction).total_seconds() / 3600

            # Decay rate depends on type and importance
            if memory.memory_type == MemoryType.LONG_TERM:
                decay_rate = 0.001  # Very slow decay
            elif memory.importance == MemoryImportance.CRITICAL:
                decay_rate = 0.005  # Slow decay
            elif memory.importance == MemoryImportance.IMPORTANT:
                decay_rate = 0.01  # Medium decay
            else:
                decay_rate = 0.02  # Faster decay

            # Apply decay
            decay_amount = decay_rate * hours_since
            memory.strength = max(0.0, memory.strength - decay_amount)

            decayed_count += 1

        await self.db.commit()
        return decayed_count

    async def forget_expired_memories(self) -> int:
        """
        Delete expired memories

        Returns:
            Number of memories deleted
        """
        now = datetime.now(timezone.utc)

        # Also forget memories with very low strength
        query = select(ConversationMemory).where(
            or_(
                and_(
                    ConversationMemory.expires_at.isnot(None),
                    ConversationMemory.expires_at < now
                ),
                ConversationMemory.strength < 0.1  # Very weak memories
            )
        )

        result = await self.db.execute(query)
        expired = result.scalars().all()

        for memory in expired:
            await self.db.delete(memory)

        await self.db.commit()
        return len(expired)

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
        memory.importance = max(memory.importance, MemoryImportance.IMPORTANT)
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
