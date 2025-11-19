from __future__ import annotations

"""
Shared mood domain types for metrics.

Defines mood domains and IDs plus unified mood result models that can be
used by both general and intimacy-aware mood evaluators.
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel


class MoodDomain(str, Enum):
    """Separate mood domains for different contexts."""

    GENERAL = "general"   # Day-to-day emotional state
    INTIMATE = "intimate"  # Romantic/intimate interactions
    SOCIAL = "social"     # Group dynamics, reputation-based


class GeneralMoodId(str, Enum):
    """General emotional states (valence/arousal based)."""

    EXCITED = "excited"   # High valence, high arousal
    CONTENT = "content"   # High valence, low arousal
    ANXIOUS = "anxious"   # Low valence, high arousal
    CALM = "calm"         # Low valence, low arousal


class IntimacyMoodId(str, Enum):
    """Intimate/romantic mood states."""

    PLAYFUL = "playful"       # Flirty, teasing
    TENDER = "tender"         # Affectionate, caring
    PASSIONATE = "passionate"  # Intense desire
    CONFLICTED = "conflicted"  # Want/shouldn't tension
    SHY = "shy"               # Nervous, hesitant
    EAGER = "eager"           # Anticipatory, excited


class GeneralMoodResult(BaseModel):
    """Computed general mood from valence/arousal."""

    mood_id: GeneralMoodId
    valence: float
    arousal: float


class IntimacyMoodResult(BaseModel):
    """Computed intimacy mood from relationship/intimacy context."""

    mood_id: IntimacyMoodId
    intensity: float


class ActiveEmotionResult(BaseModel):
    """Event-driven discrete emotion state."""

    emotion_type: str
    intensity: float
    trigger: Optional[str] = None
    expires_at: Optional[str] = None


class UnifiedMoodResult(BaseModel):
    """
    Complete mood state for preview/computation.

    This is a pure computation result (no persistence); it can be used
    by frontends, NPC brain projections, and generation/social context.
    """

    general_mood: GeneralMoodResult
    intimacy_mood: Optional[IntimacyMoodResult] = None
    active_emotion: Optional[ActiveEmotionResult] = None

