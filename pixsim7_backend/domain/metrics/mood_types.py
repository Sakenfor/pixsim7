"""
Unified mood system types and enums.

This module defines mood domains (general, intimate, social) and their corresponding
mood IDs. The unified mood system allows computing multiple mood aspects in a single
call without requiring separate persistence.
"""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class MoodDomain(str, Enum):
    """Mood domains for different contexts."""
    GENERAL = "general"      # Day-to-day emotional state
    INTIMATE = "intimate"    # Romantic/intimate interactions
    SOCIAL = "social"        # Group dynamics, reputation-based


class GeneralMoodId(str, Enum):
    """
    General emotional states based on valence/arousal model.

    Mapped to quadrants:
    - High valence, high arousal → EXCITED
    - High valence, low arousal → CONTENT
    - Low valence, high arousal → ANXIOUS
    - Low valence, low arousal → CALM
    """
    EXCITED = "excited"
    CONTENT = "content"
    ANXIOUS = "anxious"
    CALM = "calm"


class IntimacyMoodId(str, Enum):
    """
    Intimate/romantic mood states.

    These moods are computed when relationship has romantic/intimate context
    (chemistry > threshold, intimacy level is not platonic).
    """
    PLAYFUL = "playful"          # Flirty, teasing (early stage)
    TENDER = "tender"            # Affectionate, caring (high trust)
    PASSIONATE = "passionate"    # Intense desire (high chemistry + tension)
    CONFLICTED = "conflicted"    # Want/shouldn't tension (high chem, low trust)
    SHY = "shy"                  # Nervous, hesitant (low values)
    EAGER = "eager"              # Anticipatory, excited (future use)


class GeneralMoodResult(BaseModel):
    """Result of general mood computation."""
    mood_id: GeneralMoodId = Field(..., description="Computed mood ID")
    valence: float = Field(..., ge=0, le=100, description="Emotional valence (0-100)")
    arousal: float = Field(..., ge=0, le=100, description="Emotional arousal (0-100)")


class IntimacyMoodResult(BaseModel):
    """Result of intimacy mood computation."""
    mood_id: IntimacyMoodId = Field(..., description="Computed intimacy mood ID")
    intensity: float = Field(..., ge=0, le=1, description="Mood intensity (0-1)")


class ActiveEmotionResult(BaseModel):
    """Active discrete emotion from NPCEmotionalState table."""
    emotion_type: str = Field(..., description="Emotion type (from EmotionType enum)")
    intensity: float = Field(..., ge=0, le=1, description="Emotion intensity (0-1)")
    trigger: Optional[str] = Field(None, description="What triggered this emotion")
    expires_at: Optional[str] = Field(None, description="ISO timestamp when emotion expires")


class UnifiedMoodResult(BaseModel):
    """
    Complete mood state combining all mood domains.

    This is a computed result, not persisted. Use preview APIs to compute on demand.

    - general_mood: Always present (4-quadrant valence/arousal model)
    - intimacy_mood: Present when relationship has romantic context
    - active_emotion: Present when discrete emotion exists in NPCEmotionalState table
    """
    general_mood: GeneralMoodResult = Field(..., description="General mood state (always present)")
    intimacy_mood: Optional[IntimacyMoodResult] = Field(None, description="Intimacy mood (romantic contexts only)")
    active_emotion: Optional[ActiveEmotionResult] = Field(None, description="Active discrete emotion (event-driven)")

    class Config:
        json_schema_extra = {
            "example": {
                "general_mood": {
                    "mood_id": "excited",
                    "valence": 75.0,
                    "arousal": 80.0
                },
                "intimacy_mood": {
                    "mood_id": "playful",
                    "intensity": 0.6
                },
                "active_emotion": None
            }
        }
