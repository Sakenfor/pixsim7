"""
NPC Mood Metric Evaluators

Provides mood evaluation using valence-arousal model based on relationship state.
"""

from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7_backend.domain.game.models import GameWorld, GameSession
from pixsim7_backend.domain.npc_memory import NPCEmotionalState, EmotionType


def _compute_valence_arousal(relationship_values: dict[str, Any]) -> tuple[float, float]:
    """
    Compute valence and arousal from relationship axes.

    Valence (pleasure): primarily driven by affinity and chemistry
    Arousal (energy): primarily driven by chemistry and tension

    Args:
        relationship_values: Dict with affinity, trust, chemistry, tension (0-100 scale)

    Returns:
        Tuple of (valence, arousal) on 0-100 scale
    """
    affinity = relationship_values.get("affinity", 50.0)
    chemistry = relationship_values.get("chemistry", 50.0)
    tension = relationship_values.get("tension", 0.0)

    # Valence: positive emotions (0-100 scale)
    # High affinity and chemistry = positive valence
    valence = (affinity * 0.6 + chemistry * 0.4)

    # Arousal: energy level (0-100 scale)
    # High chemistry or tension = high arousal
    arousal = (chemistry * 0.5 + tension * 0.5)

    return (valence, arousal)


def _default_mood_id(valence: float, arousal: float) -> str:
    """
    Derive mood ID from valence/arousal quadrants using hardcoded defaults.

    Args:
        valence: Valence value (0-100)
        arousal: Arousal value (0-100)

    Returns:
        Mood ID string
    """
    if valence >= 50 and arousal >= 50:
        return "excited"  # High valence, high arousal
    elif valence >= 50 and arousal < 50:
        return "content"  # High valence, low arousal
    elif valence < 50 and arousal >= 50:
        return "anxious"  # Low valence, high arousal
    else:
        return "calm"  # Low valence, low arousal


def _compute_mood_from_schema(
    valence: float,
    arousal: float,
    mood_schema: Optional[dict[str, Any]]
) -> str:
    """
    Compute mood ID using world-specific mood schema.

    Schema format:
    {
      "moods": [
        {
          "id": "excited",
          "valence_min": 50,
          "valence_max": 100,
          "arousal_min": 50,
          "arousal_max": 100
        },
        ...
      ]
    }

    Args:
        valence: Valence value (0-100)
        arousal: Arousal value (0-100)
        mood_schema: Optional mood schema from GameWorld.meta

    Returns:
        Mood ID string
    """
    if not mood_schema or "moods" not in mood_schema:
        return _default_mood_id(valence, arousal)

    moods = mood_schema.get("moods", [])

    # Find first matching mood based on valence/arousal ranges
    for mood in moods:
        valence_min = mood.get("valence_min", 0)
        valence_max = mood.get("valence_max", 100)
        arousal_min = mood.get("arousal_min", 0)
        arousal_max = mood.get("arousal_max", 100)

        if (valence_min <= valence <= valence_max and
            arousal_min <= arousal <= arousal_max):
            return mood["id"]

    # Fallback to default if no match
    return _default_mood_id(valence, arousal)


async def evaluate_npc_mood(
    world_id: int,
    payload: dict[str, Any],
    db: AsyncSession
) -> dict[str, Any]:
    """
    Evaluate NPC mood metric based on relationship state.

    Computes mood using valence-arousal model and optionally integrates
    with EmotionalState system if available.

    Args:
        world_id: World ID for schema lookup
        payload: Dict with:
            - npc_id (int, required): NPC ID
            - session_id (int, optional): Session ID for emotional state lookup
            - relationship_values (dict, optional): Override relationship values
              - affinity (float): 0-100
              - trust (float): 0-100
              - chemistry (float): 0-100
              - tension (float): 0-100
            - emotional_state (dict, optional): Override emotional state
              - emotion (str): EmotionType value
              - intensity (float): 0.0-1.0
        db: Database session

    Returns:
        Dict with:
            - mood_id (str): Computed mood label
            - valence (float): Valence value (0-100)
            - arousal (float): Arousal value (0-100)
            - emotion_type (str, optional): Discrete emotion from EmotionalState
            - emotion_intensity (float, optional): Emotion intensity (0-1)
            - npc_id (int): Echo of input

    Raises:
        ValueError: If required fields missing or world not found
    """
    # Validate payload
    if "npc_id" not in payload:
        raise ValueError("Missing required field: npc_id")

    npc_id = int(payload["npc_id"])
    session_id = payload.get("session_id")

    # Load world and mood schema
    result = await db.execute(
        select(GameWorld).where(GameWorld.id == world_id)
    )
    world = result.scalar_one_or_none()

    if not world:
        raise ValueError(f"World not found: {world_id}")

    # Extract mood schema from world meta
    mood_schema = None
    if world.meta:
        mood_schema = world.meta.get("npc_mood_schema")

    # Get relationship values (from payload override or session)
    relationship_values: Optional[dict[str, Any]] = payload.get("relationship_values")

    if not relationship_values and session_id:
        # Try to load from session
        session_result = await db.execute(
            select(GameSession).where(GameSession.id == session_id)
        )
        session = session_result.scalar_one_or_none()

        if session and session.relationships:
            npc_key = f"npc:{npc_id}"
            npc_rel = session.relationships.get(npc_key, {})
            relationship_values = {
                "affinity": npc_rel.get("affinity", 50.0),
                "trust": npc_rel.get("trust", 50.0),
                "chemistry": npc_rel.get("chemistry", 50.0),
                "tension": npc_rel.get("tension", 0.0),
            }

    if not relationship_values:
        # Use neutral defaults
        relationship_values = {
            "affinity": 50.0,
            "trust": 50.0,
            "chemistry": 50.0,
            "tension": 0.0,
        }

    # Compute valence and arousal
    valence, arousal = _compute_valence_arousal(relationship_values)

    # Compute mood ID using schema
    mood_id = _compute_mood_from_schema(valence, arousal, mood_schema)

    # Build result
    result_dict: dict[str, Any] = {
        "mood_id": mood_id,
        "valence": valence,
        "arousal": arousal,
        "npc_id": npc_id,
    }

    # Optionally load emotional state if available
    emotional_state_override = payload.get("emotional_state")

    if emotional_state_override:
        # Use provided emotional state
        result_dict["emotion_type"] = emotional_state_override.get("emotion")
        result_dict["emotion_intensity"] = emotional_state_override.get("intensity", 0.0)
    elif session_id:
        # Try to load from database
        emotion_result = await db.execute(
            select(NPCEmotionalState).where(
                NPCEmotionalState.npc_id == npc_id,
                NPCEmotionalState.session_id == session_id,
                NPCEmotionalState.is_active == True
            ).order_by(NPCEmotionalState.intensity.desc()).limit(1)
        )
        dominant_emotion = emotion_result.scalar_one_or_none()

        if dominant_emotion:
            result_dict["emotion_type"] = dominant_emotion.emotion.value
            result_dict["emotion_intensity"] = dominant_emotion.intensity

    return result_dict
