"""
NPC Relationship Milestone Service

Manages relationship milestones including:
- Automatic milestone detection based on relationship changes
- Manual milestone creation
- Milestone history tracking
- Triggering emotional responses when milestones are reached
"""
from datetime import datetime
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc

from pixsim7_backend.domain.npc_memory import (
    RelationshipMilestone,
    MilestoneType,
    EmotionType
)


class MilestoneService:
    """Service for managing relationship milestones"""

    def __init__(self, db: AsyncSession):
        self.db = db

    # Milestone thresholds for auto-detection
    RELATIONSHIP_TIER_MILESTONES = {
        "stranger": MilestoneType.FIRST_MEETING,
        "acquaintance": MilestoneType.BECAME_ACQUAINTANCE,
        "friend": MilestoneType.BECAME_FRIEND,
        "close_friend": MilestoneType.BECAME_CLOSE_FRIEND,
        "romantic": MilestoneType.BECAME_LOVER,
    }

    # Emotional responses for milestones
    MILESTONE_EMOTIONS = {
        MilestoneType.FIRST_MEETING: (EmotionType.CURIOUS, 0.6),
        MilestoneType.BECAME_ACQUAINTANCE: (EmotionType.CONTENT, 0.5),
        MilestoneType.BECAME_FRIEND: (EmotionType.HAPPY, 0.7),
        MilestoneType.BECAME_CLOSE_FRIEND: (EmotionType.AFFECTIONATE, 0.8),
        MilestoneType.FIRST_FLIRT: (EmotionType.PLAYFUL, 0.7),
        MilestoneType.FIRST_KISS: (EmotionType.EXCITED, 0.9),
        MilestoneType.BECAME_LOVER: (EmotionType.AFFECTIONATE, 0.95),
        MilestoneType.FIRST_ARGUMENT: (EmotionType.FRUSTRATED, 0.7),
        MilestoneType.RECONCILIATION: (EmotionType.GRATEFUL, 0.8),
        MilestoneType.BETRAYAL: (EmotionType.HURT, 0.95),
        MilestoneType.FORGIVENESS: (EmotionType.CONTENT, 0.7),
    }

    async def create_milestone(
        self,
        npc_id: int,
        user_id: int,
        milestone_type: MilestoneType,
        milestone_name: str,
        relationship_values: Dict[str, float],
        relationship_tier: str,
        session_id: Optional[int] = None,
        triggered_by: Optional[str] = None,
        trigger_memory_id: Optional[int] = None,
        unlocked_content: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> RelationshipMilestone:
        """
        Create a relationship milestone

        Args:
            npc_id: NPC ID
            user_id: Player ID
            milestone_type: Type of milestone
            milestone_name: Human-readable name
            relationship_values: Current relationship axis values
            relationship_tier: Current relationship tier
            session_id: Optional session ID
            triggered_by: What caused this milestone
            trigger_memory_id: Memory that triggered it
            unlocked_content: Content unlocked by milestone
            metadata: Additional metadata

        Returns:
            Created milestone
        """
        # Check if this milestone already exists
        existing = await self.get_milestone_by_type(npc_id, user_id, milestone_type)
        if existing:
            return existing  # Don't create duplicates

        # Determine emotional impact
        emotional_impact = None
        if milestone_type in self.MILESTONE_EMOTIONS:
            emotional_impact = self.MILESTONE_EMOTIONS[milestone_type][0]

        milestone = RelationshipMilestone(
            npc_id=npc_id,
            user_id=user_id,
            session_id=session_id,
            milestone_type=milestone_type,
            milestone_name=milestone_name,
            relationship_values=relationship_values,
            relationship_tier=relationship_tier,
            triggered_by=triggered_by,
            trigger_memory_id=trigger_memory_id,
            unlocked_content=unlocked_content or [],
            emotional_impact=emotional_impact,
            metadata=metadata or {}
        )

        self.db.add(milestone)
        await self.db.commit()
        await self.db.refresh(milestone)

        return milestone

    async def get_milestone_by_type(
        self,
        npc_id: int,
        user_id: int,
        milestone_type: MilestoneType
    ) -> Optional[RelationshipMilestone]:
        """
        Get a specific milestone by type

        Args:
            npc_id: NPC ID
            user_id: Player ID
            milestone_type: Milestone type to find

        Returns:
            Milestone if found, None otherwise
        """
        query = select(RelationshipMilestone).where(
            and_(
                RelationshipMilestone.npc_id == npc_id,
                RelationshipMilestone.user_id == user_id,
                RelationshipMilestone.milestone_type == milestone_type
            )
        )

        result = await self.db.execute(query)
        return result.scalars().first()

    async def get_all_milestones(
        self,
        npc_id: int,
        user_id: int,
        limit: int = 50
    ) -> List[RelationshipMilestone]:
        """
        Get all milestones for an NPC-player relationship

        Args:
            npc_id: NPC ID
            user_id: Player ID
            limit: Maximum number of milestones

        Returns:
            List of milestones in chronological order
        """
        query = select(RelationshipMilestone).where(
            and_(
                RelationshipMilestone.npc_id == npc_id,
                RelationshipMilestone.user_id == user_id
            )
        ).order_by(RelationshipMilestone.achieved_at).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_recent_milestones(
        self,
        npc_id: int,
        user_id: int,
        limit: int = 5
    ) -> List[RelationshipMilestone]:
        """
        Get recent milestones

        Args:
            npc_id: NPC ID
            user_id: Player ID
            limit: Number of milestones to return

        Returns:
            List of recent milestones
        """
        query = select(RelationshipMilestone).where(
            and_(
                RelationshipMilestone.npc_id == npc_id,
                RelationshipMilestone.user_id == user_id
            )
        ).order_by(desc(RelationshipMilestone.achieved_at)).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def check_and_create_tier_milestone(
        self,
        npc_id: int,
        user_id: int,
        new_tier: str,
        relationship_values: Dict[str, float],
        session_id: Optional[int] = None,
        triggered_by: Optional[str] = None
    ) -> Optional[RelationshipMilestone]:
        """
        Check if a tier change should create a milestone

        Args:
            npc_id: NPC ID
            user_id: Player ID
            new_tier: New relationship tier
            relationship_values: Current relationship values
            session_id: Optional session ID
            triggered_by: What triggered the change

        Returns:
            Created milestone or None if no milestone for this tier
        """
        # Check if this tier has an associated milestone
        if new_tier not in self.RELATIONSHIP_TIER_MILESTONES:
            return None

        milestone_type = self.RELATIONSHIP_TIER_MILESTONES[new_tier]

        # Check if milestone already exists
        existing = await self.get_milestone_by_type(npc_id, user_id, milestone_type)
        if existing:
            return None  # Already achieved

        # Create the milestone
        milestone_name = self._get_milestone_name(milestone_type)

        milestone = await self.create_milestone(
            npc_id=npc_id,
            user_id=user_id,
            milestone_type=milestone_type,
            milestone_name=milestone_name,
            relationship_values=relationship_values,
            relationship_tier=new_tier,
            session_id=session_id,
            triggered_by=triggered_by or "relationship_tier_change",
            metadata={"auto_detected": True}
        )

        return milestone

    async def check_custom_milestone_conditions(
        self,
        npc_id: int,
        user_id: int,
        relationship_values: Dict[str, float],
        relationship_tier: str,
        session_id: Optional[int] = None
    ) -> List[RelationshipMilestone]:
        """
        Check for custom milestone conditions based on relationship values

        Args:
            npc_id: NPC ID
            user_id: Player ID
            relationship_values: Current relationship values
            relationship_tier: Current tier
            session_id: Optional session ID

        Returns:
            List of newly created milestones
        """
        created_milestones = []

        # Check trust milestone (trust > 80)
        if relationship_values.get("trust", 0) > 80:
            existing = await self.get_milestone_by_type(
                npc_id, user_id, MilestoneType.TRUST_MILESTONE
            )
            if not existing:
                milestone = await self.create_milestone(
                    npc_id=npc_id,
                    user_id=user_id,
                    milestone_type=MilestoneType.TRUST_MILESTONE,
                    milestone_name="Earned Deep Trust",
                    relationship_values=relationship_values,
                    relationship_tier=relationship_tier,
                    session_id=session_id,
                    triggered_by="trust_threshold",
                    metadata={"trust_value": relationship_values.get("trust")}
                )
                created_milestones.append(milestone)

        # Check chemistry milestone (chemistry > 80)
        if relationship_values.get("chemistry", 0) > 80:
            existing = await self.get_milestone_by_type(
                npc_id, user_id, MilestoneType.CHEMISTRY_MILESTONE
            )
            if not existing:
                milestone = await self.create_milestone(
                    npc_id=npc_id,
                    user_id=user_id,
                    milestone_type=MilestoneType.CHEMISTRY_MILESTONE,
                    milestone_name="Strong Chemistry",
                    relationship_values=relationship_values,
                    relationship_tier=relationship_tier,
                    session_id=session_id,
                    triggered_by="chemistry_threshold",
                    metadata={"chemistry_value": relationship_values.get("chemistry")}
                )
                created_milestones.append(milestone)

        return created_milestones

    def _get_milestone_name(self, milestone_type: MilestoneType) -> str:
        """Get human-readable milestone name"""
        names = {
            MilestoneType.FIRST_MEETING: "First Meeting",
            MilestoneType.FIRST_CONVERSATION: "First Conversation",
            MilestoneType.BECAME_ACQUAINTANCE: "Became Acquaintance",
            MilestoneType.BECAME_FRIEND: "Became Friend",
            MilestoneType.BECAME_CLOSE_FRIEND: "Became Close Friend",
            MilestoneType.FIRST_FLIRT: "First Flirtation",
            MilestoneType.FIRST_KISS: "First Kiss",
            MilestoneType.BECAME_LOVER: "Became Lover",
            MilestoneType.FIRST_ARGUMENT: "First Argument",
            MilestoneType.RECONCILIATION: "Reconciliation",
            MilestoneType.BETRAYAL: "Betrayal",
            MilestoneType.FORGIVENESS: "Forgiveness",
            MilestoneType.TRUST_MILESTONE: "Deep Trust Earned",
            MilestoneType.CHEMISTRY_MILESTONE: "Strong Chemistry",
        }
        return names.get(milestone_type, milestone_type.value.replace("_", " ").title())

    def get_milestone_emotion_trigger(
        self,
        milestone_type: MilestoneType
    ) -> Optional[Tuple[EmotionType, float]]:
        """
        Get the emotion and intensity that should be triggered by a milestone

        Args:
            milestone_type: Milestone type

        Returns:
            Tuple of (emotion, intensity) or None
        """
        return self.MILESTONE_EMOTIONS.get(milestone_type)

    async def get_milestone_summary(
        self,
        npc_id: int,
        user_id: int
    ) -> Dict[str, Any]:
        """
        Get summary statistics about milestones

        Args:
            npc_id: NPC ID
            user_id: Player ID

        Returns:
            Summary dictionary
        """
        milestones = await self.get_all_milestones(npc_id, user_id)

        # Count by type
        type_counts = {}
        for milestone in milestones:
            type_str = milestone.milestone_type.value
            type_counts[type_str] = type_counts.get(type_str, 0) + 1

        # Get first and most recent
        first_milestone = milestones[0] if milestones else None
        recent_milestone = milestones[-1] if milestones else None

        return {
            "total_milestones": len(milestones),
            "milestone_types": type_counts,
            "first_milestone": {
                "type": first_milestone.milestone_type.value,
                "name": first_milestone.milestone_name,
                "achieved_at": first_milestone.achieved_at.isoformat()
            } if first_milestone else None,
            "most_recent_milestone": {
                "type": recent_milestone.milestone_type.value,
                "name": recent_milestone.milestone_name,
                "achieved_at": recent_milestone.achieved_at.isoformat()
            } if recent_milestone else None,
        }
