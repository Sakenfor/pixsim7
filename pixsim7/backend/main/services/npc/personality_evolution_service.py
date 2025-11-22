"""
NPC Personality Evolution Service

Manages personality evolution over time including:
- Tracking changes to Big Five personality traits
- Event-triggered personality shifts
- Gradual personality drift based on experiences
- Historical tracking of personality changes
"""
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc

from pixsim7.backend.main.domain.npc_memory import (
    PersonalityEvolutionEvent,
    PersonalityTrait
)


class PersonalityEvolutionService:
    """Service for managing NPC personality evolution"""

    def __init__(self, db: AsyncSession):
        self.db = db

    # Thresholds for personality change magnitudes
    TINY_CHANGE = 1.0      # Small daily drift
    SMALL_CHANGE = 3.0     # Minor event impact
    MEDIUM_CHANGE = 7.0    # Significant event
    LARGE_CHANGE = 15.0    # Life-changing event

    async def record_personality_change(
        self,
        npc_id: int,
        trait_changed: PersonalityTrait,
        old_value: float,
        new_value: float,
        triggered_by: str,
        user_id: Optional[int] = None,
        trigger_event_id: Optional[int] = None,
        relationship_tier_at_time: Optional[str] = None,
        world_time: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> PersonalityEvolutionEvent:
        """
        Record a personality trait change

        Args:
            npc_id: NPC ID
            trait_changed: Which trait changed
            old_value: Previous value (0-100)
            new_value: New value (0-100)
            triggered_by: What caused the change
            user_id: Optional user/player ID if player-related
            trigger_event_id: ID of related event/memory/milestone
            relationship_tier_at_time: Relationship tier when change occurred
            world_time: In-game time
            metadata: Additional metadata

        Returns:
            Created evolution event
        """
        change_amount = new_value - old_value

        event = PersonalityEvolutionEvent(
            npc_id=npc_id,
            user_id=user_id,
            trait_changed=trait_changed,
            old_value=old_value,
            new_value=new_value,
            change_amount=change_amount,
            triggered_by=triggered_by,
            trigger_event_id=trigger_event_id,
            relationship_tier_at_time=relationship_tier_at_time,
            world_time=world_time,
            meta=metadata or {}
        )

        self.db.add(event)
        await self.db.commit()
        await self.db.refresh(event)

        return event

    async def apply_trait_change(
        self,
        npc_id: int,
        trait: PersonalityTrait,
        current_value: float,
        change_amount: float,
        triggered_by: str,
        user_id: Optional[int] = None,
        trigger_event_id: Optional[int] = None,
        relationship_tier: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> tuple[float, PersonalityEvolutionEvent]:
        """
        Apply a change to a personality trait

        Args:
            npc_id: NPC ID
            trait: Trait to change
            current_value: Current value (0-100)
            change_amount: Amount to change (+/-)
            triggered_by: What caused the change
            user_id: Optional user ID
            trigger_event_id: Related event ID
            relationship_tier: Current relationship tier
            metadata: Additional metadata

        Returns:
            Tuple of (new_value, evolution_event)
        """
        # Calculate new value (clamped to 0-100)
        new_value = max(0.0, min(100.0, current_value + change_amount))

        # Record the change
        event = await self.record_personality_change(
            npc_id=npc_id,
            trait_changed=trait,
            old_value=current_value,
            new_value=new_value,
            triggered_by=triggered_by,
            user_id=user_id,
            trigger_event_id=trigger_event_id,
            relationship_tier_at_time=relationship_tier,
            metadata=metadata
        )

        return (new_value, event)

    async def get_trait_history(
        self,
        npc_id: int,
        trait: PersonalityTrait,
        limit: int = 20
    ) -> List[PersonalityEvolutionEvent]:
        """
        Get history of changes for a specific trait

        Args:
            npc_id: NPC ID
            trait: Trait to query
            limit: Maximum number of events

        Returns:
            List of evolution events
        """
        query = select(PersonalityEvolutionEvent).where(
            and_(
                PersonalityEvolutionEvent.npc_id == npc_id,
                PersonalityEvolutionEvent.trait_changed == trait
            )
        ).order_by(desc(PersonalityEvolutionEvent.changed_at)).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_all_personality_history(
        self,
        npc_id: int,
        user_id: Optional[int] = None,
        limit: int = 50
    ) -> List[PersonalityEvolutionEvent]:
        """
        Get all personality changes for an NPC

        Args:
            npc_id: NPC ID
            user_id: Optional filter by user
            limit: Maximum number of events

        Returns:
            List of evolution events
        """
        query = select(PersonalityEvolutionEvent).where(
            PersonalityEvolutionEvent.npc_id == npc_id
        )

        if user_id:
            query = query.where(PersonalityEvolutionEvent.user_id == user_id)

        query = query.order_by(desc(PersonalityEvolutionEvent.changed_at)).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def calculate_trait_trajectory(
        self,
        npc_id: int,
        trait: PersonalityTrait
    ) -> Dict[str, Any]:
        """
        Calculate the trajectory/trend of a personality trait

        Args:
            npc_id: NPC ID
            trait: Trait to analyze

        Returns:
            Trajectory analysis
        """
        history = await self.get_trait_history(npc_id, trait, limit=10)

        if not history:
            return {
                "trait": trait.value,
                "total_changes": 0,
                "trend": "stable",
                "net_change": 0.0
            }

        # Calculate net change
        first_event = history[-1]  # Oldest
        last_event = history[0]    # Most recent

        net_change = last_event.new_value - first_event.old_value

        # Determine trend
        if net_change > 5:
            trend = "increasing"
        elif net_change < -5:
            trend = "decreasing"
        else:
            trend = "stable"

        # Count positive and negative changes
        positive_changes = sum(1 for e in history if e.change_amount > 0)
        negative_changes = sum(1 for e in history if e.change_amount < 0)

        return {
            "trait": trait.value,
            "total_changes": len(history),
            "trend": trend,
            "net_change": net_change,
            "positive_changes": positive_changes,
            "negative_changes": negative_changes,
            "current_value": last_event.new_value,
            "starting_value": first_event.old_value
        }

    def suggest_trait_changes_from_milestone(
        self,
        milestone_type: str,
        current_traits: Dict[str, float]
    ) -> List[tuple[PersonalityTrait, float, str]]:
        """
        Suggest personality changes based on a milestone

        Args:
            milestone_type: Type of milestone
            current_traits: Current trait values

        Returns:
            List of (trait, change_amount, reason)
        """
        changes = []

        # Map milestone types to personality changes
        milestone_effects = {
            "became_friend": [
                (PersonalityTrait.AGREEABLENESS, self.SMALL_CHANGE, "forming_friendship"),
                (PersonalityTrait.OPENNESS, self.SMALL_CHANGE, "forming_friendship")
            ],
            "became_close_friend": [
                (PersonalityTrait.AGREEABLENESS, self.MEDIUM_CHANGE, "deepening_friendship"),
                (PersonalityTrait.EXTRAVERSION, self.SMALL_CHANGE, "deepening_friendship")
            ],
            "became_lover": [
                (PersonalityTrait.AGREEABLENESS, self.MEDIUM_CHANGE, "romantic_relationship"),
                (PersonalityTrait.OPENNESS, self.MEDIUM_CHANGE, "romantic_relationship"),
                (PersonalityTrait.NEUROTICISM, -self.SMALL_CHANGE, "emotional_security")
            ],
            "betrayal": [
                (PersonalityTrait.AGREEABLENESS, -self.LARGE_CHANGE, "trust_broken"),
                (PersonalityTrait.NEUROTICISM, self.MEDIUM_CHANGE, "emotional_trauma")
            ],
            "forgiveness": [
                (PersonalityTrait.AGREEABLENESS, self.MEDIUM_CHANGE, "choosing_forgiveness"),
                (PersonalityTrait.NEUROTICISM, -self.SMALL_CHANGE, "emotional_healing")
            ],
            "trust_milestone": [
                (PersonalityTrait.AGREEABLENESS, self.SMALL_CHANGE, "trust_earned"),
                (PersonalityTrait.OPENNESS, self.SMALL_CHANGE, "trust_earned")
            ]
        }

        return milestone_effects.get(milestone_type, [])

    def suggest_trait_changes_from_emotion(
        self,
        emotion: str,
        intensity: float,
        duration_hours: float
    ) -> List[tuple[PersonalityTrait, float, str]]:
        """
        Suggest personality changes based on prolonged emotional states

        Args:
            emotion: Emotion type
            intensity: Emotion intensity
            duration_hours: How long emotion lasted

        Returns:
            List of (trait, change_amount, reason)
        """
        changes = []

        # Only long-lasting, intense emotions affect personality
        if duration_hours < 24 or intensity < 0.7:
            return changes

        # Map emotions to personality drifts
        emotion_effects = {
            "happy": [
                (PersonalityTrait.EXTRAVERSION, self.TINY_CHANGE, "prolonged_happiness"),
                (PersonalityTrait.NEUROTICISM, -self.TINY_CHANGE, "prolonged_happiness")
            ],
            "anxious": [
                (PersonalityTrait.NEUROTICISM, self.TINY_CHANGE, "prolonged_anxiety"),
                (PersonalityTrait.EXTRAVERSION, -self.TINY_CHANGE, "prolonged_anxiety")
            ],
            "angry": [
                (PersonalityTrait.AGREEABLENESS, -self.TINY_CHANGE, "prolonged_anger"),
                (PersonalityTrait.NEUROTICISM, self.TINY_CHANGE, "prolonged_anger")
            ],
            "content": [
                (PersonalityTrait.NEUROTICISM, -self.TINY_CHANGE, "prolonged_contentment")
            ],
            "hurt": [
                (PersonalityTrait.NEUROTICISM, self.TINY_CHANGE, "prolonged_hurt"),
                (PersonalityTrait.AGREEABLENESS, -self.TINY_CHANGE, "prolonged_hurt")
            ]
        }

        return emotion_effects.get(emotion, [])

    async def get_personality_summary(
        self,
        npc_id: int
    ) -> Dict[str, Any]:
        """
        Get summary of personality evolution

        Args:
            npc_id: NPC ID

        Returns:
            Summary dictionary
        """
        history = await self.get_all_personality_history(npc_id, limit=100)

        if not history:
            return {
                "total_changes": 0,
                "traits_changed": [],
                "most_volatile_trait": None,
                "most_stable_trait": None
            }

        # Count changes per trait
        trait_changes = {}
        for event in history:
            trait = event.trait_changed.value
            trait_changes[trait] = trait_changes.get(trait, 0) + 1

        # Find most and least changed traits
        most_volatile = max(trait_changes.items(), key=lambda x: x[1]) if trait_changes else None
        least_changed_traits = set(PersonalityTrait) - set(PersonalityTrait(t) for t in trait_changes.keys())

        return {
            "total_changes": len(history),
            "traits_changed": list(trait_changes.keys()),
            "trait_change_counts": trait_changes,
            "most_volatile_trait": most_volatile[0] if most_volatile else None,
            "most_stable_traits": [t.value for t in least_changed_traits],
            "recent_changes": [
                {
                    "trait": e.trait_changed.value,
                    "change": e.change_amount,
                    "triggered_by": e.triggered_by,
                    "changed_at": e.changed_at.isoformat()
                }
                for e in history[:5]
            ]
        }
