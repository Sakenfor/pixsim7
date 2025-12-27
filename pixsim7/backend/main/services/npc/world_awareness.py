"""
NPC World Awareness Service

Manages NPC awareness of world events including:
- Registering world events (time, weather, story events)
- Tracking which NPCs know about events
- NPC reactions and opinions about events
- Contextual relevance for dialogue
"""
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, desc

from pixsim7.backend.main.domain.game.entities.npc_memory import (
    NPCWorldContext,
    WorldEventType,
    EmotionType
)


class WorldAwarenessService:
    """Service for managing NPC awareness of world events"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def register_event(
        self,
        npc_id: int,
        event_type: WorldEventType,
        event_name: str,
        event_description: str,
        world_id: Optional[int] = None,
        session_id: Optional[int] = None,
        is_aware: bool = True,
        awareness_source: Optional[str] = None,
        emotional_response: Optional[EmotionType] = None,
        opinion: Optional[str] = None,
        relevance_score: float = 0.5,
        duration_hours: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> NPCWorldContext:
        """
        Register a world event for an NPC

        Args:
            npc_id: NPC ID
            event_type: Type of event
            event_name: Event identifier
            event_description: What happened
            world_id: World ID
            session_id: Session ID
            is_aware: Whether NPC knows about this
            awareness_source: How NPC learned about it
            emotional_response: NPC's emotional reaction
            opinion: NPC's opinion
            relevance_score: How relevant (0.0-1.0)
            duration_hours: How long event is relevant
            metadata: Additional metadata

        Returns:
            Created world context
        """
        # Calculate expiration
        expires_at = None
        if duration_hours:
            expires_at = datetime.utcnow() + timedelta(hours=duration_hours)

        context = NPCWorldContext(
            npc_id=npc_id,
            world_id=world_id,
            session_id=session_id,
            event_type=event_type,
            event_name=event_name,
            event_description=event_description,
            is_aware=is_aware,
            awareness_source=awareness_source,
            emotional_response=emotional_response,
            opinion=opinion,
            relevance_score=max(0.0, min(1.0, relevance_score)),
            expires_at=expires_at,
            meta=metadata or {}
        )

        self.db.add(context)
        await self.db.commit()
        await self.db.refresh(context)

        return context

    async def broadcast_event(
        self,
        npc_ids: List[int],
        event_type: WorldEventType,
        event_name: str,
        event_description: str,
        world_id: Optional[int] = None,
        session_id: Optional[int] = None,
        relevance_scores: Optional[Dict[int, float]] = None,
        duration_hours: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> List[NPCWorldContext]:
        """
        Broadcast an event to multiple NPCs

        Args:
            npc_ids: List of NPC IDs to inform
            event_type: Type of event
            event_name: Event identifier
            event_description: What happened
            world_id: World ID
            session_id: Session ID
            relevance_scores: Per-NPC relevance scores
            duration_hours: How long event is relevant
            metadata: Additional metadata

        Returns:
            List of created contexts
        """
        contexts = []

        for npc_id in npc_ids:
            relevance = (relevance_scores or {}).get(npc_id, 0.5)

            context = await self.register_event(
                npc_id=npc_id,
                event_type=event_type,
                event_name=event_name,
                event_description=event_description,
                world_id=world_id,
                session_id=session_id,
                relevance_score=relevance,
                duration_hours=duration_hours,
                metadata=metadata
            )
            contexts.append(context)

        return contexts

    async def get_relevant_events(
        self,
        npc_id: int,
        min_relevance: float = 0.3,
        event_types: Optional[List[WorldEventType]] = None,
        limit: int = 10
    ) -> List[NPCWorldContext]:
        """
        Get relevant current events for an NPC

        Args:
            npc_id: NPC ID
            min_relevance: Minimum relevance score
            event_types: Filter by event types
            limit: Maximum number of events

        Returns:
            List of relevant events
        """
        now = datetime.utcnow()

        query = select(NPCWorldContext).where(
            and_(
                NPCWorldContext.npc_id == npc_id,
                NPCWorldContext.is_aware == True,
                NPCWorldContext.relevance_score >= min_relevance,
                or_(
                    NPCWorldContext.expires_at.is_(None),
                    NPCWorldContext.expires_at > now
                )
            )
        )

        if event_types:
            query = query.where(NPCWorldContext.event_type.in_(event_types))

        query = query.order_by(
            desc(NPCWorldContext.relevance_score),
            desc(NPCWorldContext.occurred_at)
        ).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_recent_events(
        self,
        npc_id: int,
        hours: float = 24,
        limit: int = 20
    ) -> List[NPCWorldContext]:
        """
        Get recent events

        Args:
            npc_id: NPC ID
            hours: How many hours back to look
            limit: Maximum number of events

        Returns:
            List of recent events
        """
        cutoff = datetime.utcnow() - timedelta(hours=hours)

        query = select(NPCWorldContext).where(
            and_(
                NPCWorldContext.npc_id == npc_id,
                NPCWorldContext.is_aware == True,
                NPCWorldContext.occurred_at >= cutoff
            )
        ).order_by(desc(NPCWorldContext.occurred_at)).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update_npc_reaction(
        self,
        context_id: int,
        emotional_response: Optional[EmotionType] = None,
        opinion: Optional[str] = None
    ) -> Optional[NPCWorldContext]:
        """
        Update NPC's reaction to an event

        Args:
            context_id: Context ID
            emotional_response: New emotional response
            opinion: NPC's opinion

        Returns:
            Updated context or None if not found
        """
        context = await self.db.get(NPCWorldContext, context_id)
        if not context:
            return None

        if emotional_response is not None:
            context.emotional_response = emotional_response

        if opinion is not None:
            context.opinion = opinion

        await self.db.commit()
        await self.db.refresh(context)

        return context

    async def make_aware(
        self,
        npc_id: int,
        event_name: str,
        awareness_source: str
    ) -> Optional[NPCWorldContext]:
        """
        Make an NPC aware of an event they weren't aware of

        Args:
            npc_id: NPC ID
            event_name: Event identifier
            awareness_source: How they learned about it

        Returns:
            Updated context or None if not found
        """
        query = select(NPCWorldContext).where(
            and_(
                NPCWorldContext.npc_id == npc_id,
                NPCWorldContext.event_name == event_name,
                NPCWorldContext.is_aware == False
            )
        )

        result = await self.db.execute(query)
        context = result.scalars().first()

        if not context:
            return None

        context.is_aware = True
        context.awareness_source = awareness_source
        context.npc_learned_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(context)

        return context

    async def expire_old_events(
        self,
        npc_id: Optional[int] = None
    ) -> int:
        """
        Mark expired events as no longer relevant

        Args:
            npc_id: Optional NPC ID to limit to

        Returns:
            Number of events expired
        """
        now = datetime.utcnow()

        query = select(NPCWorldContext).where(
            and_(
                NPCWorldContext.expires_at.isnot(None),
                NPCWorldContext.expires_at <= now,
                NPCWorldContext.is_aware == True
            )
        )

        if npc_id:
            query = query.where(NPCWorldContext.npc_id == npc_id)

        result = await self.db.execute(query)
        expired_contexts = result.scalars().all()

        count = 0
        for context in expired_contexts:
            context.is_aware = False  # Mark as no longer relevant
            count += 1

        await self.db.commit()
        return count

    def format_events_for_dialogue(
        self,
        events: List[NPCWorldContext],
        max_events: int = 3
    ) -> str:
        """
        Format events for inclusion in dialogue prompt

        Args:
            events: List of events
            max_events: Maximum number to include

        Returns:
            Formatted string for prompt
        """
        if not events:
            return ""

        # Sort by relevance
        sorted_events = sorted(events, key=lambda e: e.relevance_score, reverse=True)
        top_events = sorted_events[:max_events]

        lines = ["Recent events you're aware of:"]

        for event in top_events:
            line = f"- {event.event_description}"

            if event.opinion:
                line += f" (Your opinion: {event.opinion})"

            if event.emotional_response:
                line += f" [Feeling: {event.emotional_response.value}]"

            lines.append(line)

        return "\n".join(lines)

    async def get_events_by_type(
        self,
        npc_id: int,
        event_type: WorldEventType,
        limit: int = 10
    ) -> List[NPCWorldContext]:
        """
        Get events of a specific type

        Args:
            npc_id: NPC ID
            event_type: Event type to filter by
            limit: Maximum number of events

        Returns:
            List of events
        """
        query = select(NPCWorldContext).where(
            and_(
                NPCWorldContext.npc_id == npc_id,
                NPCWorldContext.event_type == event_type,
                NPCWorldContext.is_aware == True
            )
        ).order_by(desc(NPCWorldContext.occurred_at)).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_world_context_summary(
        self,
        npc_id: int
    ) -> Dict[str, Any]:
        """
        Get summary of NPC's world awareness

        Args:
            npc_id: NPC ID

        Returns:
            Summary dictionary
        """
        # Get all aware events
        query = select(NPCWorldContext).where(
            and_(
                NPCWorldContext.npc_id == npc_id,
                NPCWorldContext.is_aware == True
            )
        )

        result = await self.db.execute(query)
        events = list(result.scalars().all())

        # Count by type
        type_counts = {}
        for event in events:
            type_str = event.event_type.value
            type_counts[type_str] = type_counts.get(type_str, 0) + 1

        # Get recent high-relevance events
        relevant_events = [e for e in events if e.relevance_score >= 0.7]
        recent_relevant = sorted(
            relevant_events,
            key=lambda e: e.occurred_at,
            reverse=True
        )[:5]

        return {
            "total_events": len(events),
            "event_types": type_counts,
            "high_relevance_count": len(relevant_events),
            "recent_important_events": [
                {
                    "type": e.event_type.value,
                    "name": e.event_name,
                    "description": e.event_description,
                    "relevance": e.relevance_score,
                    "occurred_at": e.occurred_at.isoformat()
                }
                for e in recent_relevant
            ]
        }
