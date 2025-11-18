"""
NPC Memory and Emotional State Models

Tracks conversation history and emotional states for NPCs to enable:
- Short-term memory (current session)
- Long-term memory (across sessions)
- Emotional states that affect dialogue
- Topic tracking and recall
"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from enum import Enum
from sqlmodel import SQLModel, Field, Relationship, JSON, Column
from sqlalchemy import Index


class MemoryType(str, Enum):
    """Type of memory"""
    SHORT_TERM = "short_term"  # Current session, decays quickly
    LONG_TERM = "long_term"    # Persistent across sessions
    WORKING = "working"         # Temporary, used for current conversation


class MemoryImportance(str, Enum):
    """Importance level of a memory"""
    TRIVIAL = "trivial"        # Forget quickly (weather, greetings)
    NORMAL = "normal"          # Standard conversation topics
    IMPORTANT = "important"    # Significant events, player choices
    CRITICAL = "critical"      # Major milestones, relationship changes


class EmotionType(str, Enum):
    """Types of emotions"""
    # Positive
    HAPPY = "happy"
    EXCITED = "excited"
    CONTENT = "content"
    PLAYFUL = "playful"
    AFFECTIONATE = "affectionate"
    GRATEFUL = "grateful"

    # Negative
    SAD = "sad"
    ANGRY = "angry"
    FRUSTRATED = "frustrated"
    ANXIOUS = "anxious"
    HURT = "hurt"
    JEALOUS = "jealous"

    # Neutral/Complex
    CURIOUS = "curious"
    THOUGHTFUL = "thoughtful"
    SURPRISED = "surprised"
    CONFUSED = "confused"
    NERVOUS = "nervous"
    BORED = "bored"
    TIRED = "tired"


class ConversationMemory(SQLModel, table=True):
    """
    Individual memory of a conversation exchange

    Stores what was discussed, when, and how important it is.
    Memories decay over time and can be recalled in future conversations.
    """
    __tablename__ = "npc_conversation_memories"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Foreign keys
    npc_id: int = Field(foreign_key="game_npcs.id", index=True)
    session_id: Optional[int] = Field(default=None, foreign_key="game_sessions.id", index=True)
    user_id: int = Field(foreign_key="users.id", index=True)  # Player who had this conversation

    # Memory metadata
    memory_type: MemoryType = Field(default=MemoryType.SHORT_TERM)
    importance: MemoryImportance = Field(default=MemoryImportance.NORMAL)

    # Memory content
    topic: str = Field(..., description="Main topic of the memory (e.g., 'player_asked_about_family')")
    summary: str = Field(..., description="Brief summary of what was discussed")
    player_said: Optional[str] = Field(None, description="What the player said")
    npc_said: Optional[str] = Field(None, description="What the NPC responded")

    # Context
    location_id: Optional[int] = Field(default=None, foreign_key="game_locations.id")
    world_time: Optional[float] = Field(default=None, description="In-game time when this occurred")

    # Emotional context
    npc_emotion_at_time: Optional[EmotionType] = Field(None, description="NPC's emotion during this exchange")
    relationship_tier_at_time: Optional[str] = Field(None, description="Relationship tier at the time")

    # Memory strength and decay
    strength: float = Field(default=1.0, ge=0.0, le=1.0, description="How strong/vivid the memory is")
    access_count: int = Field(default=0, description="How many times this memory has been recalled")
    last_accessed_at: Optional[datetime] = Field(default=None, description="When this memory was last recalled")

    # Tags for easy retrieval
    tags: List[str] = Field(default_factory=list, sa_column=Column(JSON))

    # Additional metadata
    metadata: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = Field(None, description="When this memory should be forgotten")

    # Indexes for efficient queries
    __table_args__ = (
        Index("idx_npc_user_memories", "npc_id", "user_id"),
        Index("idx_session_memories", "session_id"),
        Index("idx_memory_type_importance", "memory_type", "importance"),
        Index("idx_topic", "topic"),
    )


class NPCEmotionalState(SQLModel, table=True):
    """
    Current emotional state of an NPC

    Tracks temporary moods and emotions that affect dialogue tone.
    States have intensity and duration, and can be triggered by events.
    """
    __tablename__ = "npc_emotional_states"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Foreign keys
    npc_id: int = Field(foreign_key="game_npcs.id", index=True)
    session_id: Optional[int] = Field(default=None, foreign_key="game_sessions.id", index=True)

    # Emotional state
    emotion: EmotionType = Field(..., description="Current primary emotion")
    intensity: float = Field(default=0.5, ge=0.0, le=1.0, description="How intense the emotion is")

    # Duration and decay
    duration_seconds: Optional[float] = Field(None, description="How long this emotion lasts (None = indefinite)")
    decay_rate: float = Field(default=0.1, description="How quickly intensity decreases per minute")

    # Trigger
    triggered_by: Optional[str] = Field(None, description="What caused this emotion (event, dialogue, action)")
    trigger_memory_id: Optional[int] = Field(None, foreign_key="npc_conversation_memories.id")

    # Context
    context: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON), description="Additional context about why this emotion exists")

    # State tracking
    is_active: bool = Field(default=True, description="Whether this emotion is currently affecting the NPC")

    # Timestamps
    started_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = Field(None, description="When this emotion expires")
    ended_at: Optional[datetime] = Field(None, description="When this emotion actually ended")

    # Indexes
    __table_args__ = (
        Index("idx_npc_active_emotions", "npc_id", "is_active"),
        Index("idx_session_emotions", "session_id", "is_active"),
    )


class ConversationTopic(SQLModel, table=True):
    """
    Topics that have been discussed with an NPC

    Tracks what topics the player has explored with each NPC,
    enabling the NPC to avoid repeating information or build on previous discussions.
    """
    __tablename__ = "npc_conversation_topics"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Foreign keys
    npc_id: int = Field(foreign_key="game_npcs.id", index=True)
    user_id: int = Field(foreign_key="users.id", index=True)

    # Topic info
    topic_id: str = Field(..., description="Unique identifier for the topic (e.g., 'backstory', 'family', 'fears')")
    topic_name: str = Field(..., description="Human-readable topic name")

    # Discussion tracking
    times_discussed: int = Field(default=1, description="How many times this topic has come up")
    first_discussed_at: datetime = Field(default_factory=datetime.utcnow)
    last_discussed_at: datetime = Field(default_factory=datetime.utcnow)

    # Depth of knowledge
    depth_level: int = Field(default=1, description="How deeply this topic has been explored (1=surface, 5=very deep)")

    # Unlocks
    unlocked_sub_topics: List[str] = Field(default_factory=list, sa_column=Column(JSON), description="Sub-topics unlocked by discussing this")

    # Context
    relationship_tier_when_first_discussed: Optional[str] = Field(None)

    # Metadata
    metadata: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # Indexes
    __table_args__ = (
        Index("idx_npc_user_topics", "npc_id", "user_id"),
        Index("idx_topic_id", "topic_id"),
    )
