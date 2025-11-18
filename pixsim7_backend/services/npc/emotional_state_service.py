"""
NPC Emotional State Service

Manages emotional states for NPCs including:
- Setting and updating emotions
- Tracking intensity and decay
- Managing multiple simultaneous emotions
- Event-triggered emotional responses
"""
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, desc

from pixsim7_backend.domain.npc_memory import (
    NPCEmotionalState,
    EmotionType
)


class EmotionalStateService:
    """Service for managing NPC emotional states"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def set_emotion(
        self,
        npc_id: int,
        emotion: EmotionType,
        intensity: float = 0.7,
        duration_seconds: Optional[float] = None,
        decay_rate: float = 0.1,
        triggered_by: Optional[str] = None,
        trigger_memory_id: Optional[int] = None,
        session_id: Optional[int] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> NPCEmotionalState:
        """
        Set an emotional state for an NPC

        Args:
            npc_id: NPC to set emotion for
            emotion: Type of emotion
            intensity: How intense (0.0-1.0)
            duration_seconds: How long it lasts (None = indefinite)
            decay_rate: How fast intensity decreases per minute
            triggered_by: What caused this emotion
            trigger_memory_id: Memory that triggered this
            session_id: Session this is part of
            context: Additional context

        Returns:
            Created emotional state
        """
        # Calculate expiration
        expires_at = None
        if duration_seconds:
            expires_at = datetime.utcnow() + timedelta(seconds=duration_seconds)

        state = NPCEmotionalState(
            npc_id=npc_id,
            session_id=session_id,
            emotion=emotion,
            intensity=max(0.0, min(1.0, intensity)),
            duration_seconds=duration_seconds,
            decay_rate=decay_rate,
            triggered_by=triggered_by,
            trigger_memory_id=trigger_memory_id,
            context=context or {},
            expires_at=expires_at
        )

        self.db.add(state)
        await self.db.commit()
        await self.db.refresh(state)

        return state

    async def get_current_emotions(
        self,
        npc_id: int,
        session_id: Optional[int] = None,
        update_intensity: bool = True
    ) -> List[NPCEmotionalState]:
        """
        Get current active emotions for an NPC

        Args:
            npc_id: NPC ID
            session_id: Optional session filter
            update_intensity: Whether to apply decay before returning

        Returns:
            List of active emotional states
        """
        query = select(NPCEmotionalState).where(
            and_(
                NPCEmotionalState.npc_id == npc_id,
                NPCEmotionalState.is_active == True
            )
        )

        if session_id:
            query = query.where(
                or_(
                    NPCEmotionalState.session_id == session_id,
                    NPCEmotionalState.session_id.is_(None)  # Session-independent emotions
                )
            )

        query = query.order_by(desc(NPCEmotionalState.intensity))

        result = await self.db.execute(query)
        states = list(result.scalars().all())

        if update_intensity:
            # Update intensities based on decay and expiration
            states = await self._update_emotional_intensities(states)

        return states

    async def get_dominant_emotion(
        self,
        npc_id: int,
        session_id: Optional[int] = None
    ) -> Optional[Tuple[EmotionType, float]]:
        """
        Get the strongest current emotion

        Args:
            npc_id: NPC ID
            session_id: Optional session filter

        Returns:
            Tuple of (emotion_type, intensity) or None if no active emotions
        """
        emotions = await self.get_current_emotions(npc_id, session_id)

        if not emotions:
            return None

        # Return the strongest emotion
        strongest = emotions[0]  # Already ordered by intensity
        return (strongest.emotion, strongest.intensity)

    async def _update_emotional_intensities(
        self,
        states: List[NPCEmotionalState]
    ) -> List[NPCEmotionalState]:
        """
        Update emotional intensities based on decay and expiration

        Args:
            states: Emotional states to update

        Returns:
            Updated states (excluding expired ones)
        """
        now = datetime.utcnow()
        active_states = []

        for state in states:
            # Check if expired
            if state.expires_at and state.expires_at <= now:
                state.is_active = False
                state.ended_at = now
                continue

            # Calculate time since started
            time_elapsed = (now - state.started_at).total_seconds() / 60  # minutes

            # Apply decay
            intensity_loss = state.decay_rate * time_elapsed
            new_intensity = max(0.0, state.intensity - intensity_loss)

            # If intensity drops too low, mark as inactive
            if new_intensity < 0.05:
                state.is_active = False
                state.ended_at = now
            else:
                state.intensity = new_intensity
                active_states.append(state)

        await self.db.commit()

        return active_states

    async def clear_emotion(
        self,
        state_id: int
    ) -> bool:
        """
        Clear a specific emotional state

        Args:
            state_id: Emotional state ID

        Returns:
            True if cleared, False if not found
        """
        state = await self.db.get(NPCEmotionalState, state_id)
        if not state:
            return False

        state.is_active = False
        state.ended_at = datetime.utcnow()

        await self.db.commit()
        return True

    async def clear_all_emotions(
        self,
        npc_id: int,
        session_id: Optional[int] = None
    ) -> int:
        """
        Clear all active emotions for an NPC

        Args:
            npc_id: NPC ID
            session_id: Optional session filter

        Returns:
            Number of emotions cleared
        """
        query = select(NPCEmotionalState).where(
            and_(
                NPCEmotionalState.npc_id == npc_id,
                NPCEmotionalState.is_active == True
            )
        )

        if session_id:
            query = query.where(NPCEmotionalState.session_id == session_id)

        result = await self.db.execute(query)
        states = result.scalars().all()

        now = datetime.utcnow()
        for state in states:
            state.is_active = False
            state.ended_at = now

        await self.db.commit()
        return len(states)

    async def transition_emotion(
        self,
        npc_id: int,
        from_emotion: EmotionType,
        to_emotion: EmotionType,
        intensity: float = 0.7,
        session_id: Optional[int] = None
    ) -> Optional[NPCEmotionalState]:
        """
        Transition from one emotion to another

        Args:
            npc_id: NPC ID
            from_emotion: Current emotion to replace
            to_emotion: New emotion
            intensity: Intensity of new emotion
            session_id: Optional session filter

        Returns:
            New emotional state or None if from_emotion not found
        """
        # Find current emotion
        query = select(NPCEmotionalState).where(
            and_(
                NPCEmotionalState.npc_id == npc_id,
                NPCEmotionalState.emotion == from_emotion,
                NPCEmotionalState.is_active == True
            )
        )

        if session_id:
            query = query.where(NPCEmotionalState.session_id == session_id)

        result = await self.db.execute(query)
        current_state = result.scalars().first()

        if not current_state:
            return None

        # Clear current emotion
        current_state.is_active = False
        current_state.ended_at = datetime.utcnow()

        # Create new emotion
        new_state = await self.set_emotion(
            npc_id=npc_id,
            emotion=to_emotion,
            intensity=intensity,
            session_id=session_id,
            triggered_by=f"transition_from_{from_emotion.value}",
            context={"transitioned_from": from_emotion.value}
        )

        return new_state

    def get_emotion_modifiers(
        self,
        emotions: List[NPCEmotionalState]
    ) -> Dict[str, Any]:
        """
        Get dialogue modifiers based on current emotions

        Args:
            emotions: List of active emotional states

        Returns:
            Dictionary of modifiers for dialogue generation
        """
        if not emotions:
            return {
                "tone": "neutral",
                "expressiveness": 0.5,
                "dialogue_adjustments": []
            }

        # Get dominant emotion
        dominant = emotions[0] if emotions else None

        if not dominant:
            return {
                "tone": "neutral",
                "expressiveness": 0.5,
                "dialogue_adjustments": []
            }

        # Map emotions to dialogue characteristics
        tone_map = {
            EmotionType.HAPPY: "cheerful",
            EmotionType.EXCITED: "energetic",
            EmotionType.CONTENT: "calm",
            EmotionType.PLAYFUL: "teasing",
            EmotionType.AFFECTIONATE: "warm",
            EmotionType.GRATEFUL: "appreciative",
            EmotionType.SAD: "melancholic",
            EmotionType.ANGRY: "sharp",
            EmotionType.FRUSTRATED: "terse",
            EmotionType.ANXIOUS: "nervous",
            EmotionType.HURT: "distant",
            EmotionType.JEALOUS: "guarded",
            EmotionType.CURIOUS: "inquisitive",
            EmotionType.THOUGHTFUL: "contemplative",
            EmotionType.SURPRISED: "astonished",
            EmotionType.CONFUSED: "uncertain",
            EmotionType.NERVOUS: "hesitant",
            EmotionType.BORED: "disinterested",
            EmotionType.TIRED: "weary"
        }

        adjustments = []

        # High intensity emotions affect dialogue more
        if dominant.intensity > 0.7:
            adjustments.append(f"very_{dominant.emotion.value}")
        elif dominant.intensity > 0.4:
            adjustments.append(f"somewhat_{dominant.emotion.value}")
        else:
            adjustments.append(f"slightly_{dominant.emotion.value}")

        # Add context if available
        if dominant.triggered_by:
            adjustments.append(f"because_{dominant.triggered_by}")

        return {
            "tone": tone_map.get(dominant.emotion, "neutral"),
            "expressiveness": dominant.intensity,
            "primary_emotion": dominant.emotion.value,
            "emotion_intensity": dominant.intensity,
            "dialogue_adjustments": adjustments,
            "all_active_emotions": [
                {
                    "emotion": e.emotion.value,
                    "intensity": e.intensity,
                    "triggered_by": e.triggered_by
                }
                for e in emotions
            ]
        }

    async def get_emotion_history(
        self,
        npc_id: int,
        session_id: Optional[int] = None,
        limit: int = 20
    ) -> List[NPCEmotionalState]:
        """
        Get emotion history for an NPC

        Args:
            npc_id: NPC ID
            session_id: Optional session filter
            limit: Maximum number of records

        Returns:
            List of emotional states (past and present)
        """
        query = select(NPCEmotionalState).where(
            NPCEmotionalState.npc_id == npc_id
        )

        if session_id:
            query = query.where(NPCEmotionalState.session_id == session_id)

        query = query.order_by(desc(NPCEmotionalState.started_at)).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())
