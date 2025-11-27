"""
PixSim7 Prompt Parser Ontology Stub

Centralized role names and keyword lists for prompt classification.
Future ontology expansion happens here without touching parser code everywhere.

This is NOT the full Ontology v1; it's a minimal stub to prepare for it.
"""

from typing import Dict, List

# ===== ROLE KEYWORDS =====
# Keywords used by SimplePromptParser for role classification

ROLE_KEYWORDS: Dict[str, List[str]] = {
    "character": [
        # Creature types
        "werewolf", "vampire", "minotaur", "centaur", "dragon", "beast",
        # Generic terms
        "woman", "man", "person", "character", "lady", "girl", "boy",
        "male", "female", "protagonist", "antagonist",
        # Common fantasy terms
        "warrior", "knight", "mage", "wizard", "hunter", "creature",
    ],

    "action": [
        # Movement
        "enters", "walks", "moves", "approaches", "leaves", "runs", "steps",
        "advances", "retreats", "climbs", "descends", "jumps",
        # Physical interaction
        "touches", "grabs", "holds", "releases", "pushes", "pulls",
        "leans", "sits", "stands", "kneels", "lies",
        # Social/intimate
        "kisses", "embraces", "caresses", "strokes", "hugs",
        "looks", "gazes", "stares", "glances", "watches",
        # Speech
        "says", "speaks", "whispers", "shouts", "asks", "tells",
    ],

    "setting": [
        # Natural
        "forest", "woods", "trees", "river", "lake", "mountain", "cave",
        "clearing", "path", "trail",
        # Built
        "castle", "tower", "dungeon", "chamber", "hall", "room",
        "street", "alley", "square", "marketplace",
        "bedroom", "bathroom", "kitchen", "lounge", "library",
        "bar", "tavern", "inn",
        # Time/atmosphere indicators
        "night", "day", "dawn", "dusk", "evening", "morning",
        "moonlight", "sunlight", "candlelight",
    ],

    "mood": [
        # Fear/anxiety
        "afraid", "anxious", "nervous", "worried", "scared", "terrified",
        # Positive emotions
        "happy", "joyful", "excited", "eager", "enthusiastic",
        # Romantic/sensual
        "teasing", "playful", "tender", "gentle", "passionate",
        # Negative emotions
        "angry", "furious", "sad", "melancholy", "depressed",
        "frustrated", "annoyed",
        # Atmosphere
        "tense", "relaxed", "calm", "chaotic", "peaceful",
    ],

    "romance": [
        # Actions
        "kiss", "kisses", "kissing", "embrace", "caress", "fondle",
        # Concepts
        "romance", "romantic", "intimacy", "intimate", "passion", "desire",
        "lust", "arousal", "attraction",
        # Roles
        "lover", "lovers", "beloved", "partner",
        # Descriptors
        "sensual", "erotic", "sexual", "seductive",
    ],

    "camera": [
        # Camera types
        "camera", "shot", "frame", "framing", "angle",
        # Shot types
        "close-up", "closeup", "wide", "medium", "extreme",
        "establishing", "cutaway",
        # Perspectives
        "pov", "point of view", "first-person", "third-person",
        "over-the-shoulder", "bird's eye", "low angle", "high angle",
        # Camera movement
        "pan", "zoom", "dolly", "tracking", "steadicam",
    ],
}

# ===== ACTION VERBS =====
# Common verbs that indicate action blocks
ACTION_VERBS: List[str] = [
    # From action keywords above
    "enters", "walks", "moves", "approaches", "leaves", "runs", "steps",
    "touches", "grabs", "holds", "releases", "pushes", "pulls",
    "leans", "sits", "stands", "kneels", "kisses", "embraces",
    "looks", "gazes", "stares", "glances", "says", "speaks",
    # Additional common verbs
    "goes", "comes", "arrives", "departs", "starts", "stops",
    "begins", "ends", "continues", "pauses", "waits",
    "opens", "closes", "lifts", "lowers", "raises",
    "turns", "spins", "rotates", "twists", "bends",
]

# ===== HELPER FUNCTIONS =====

def get_keywords_for_role(role: str) -> List[str]:
    """Get keyword list for a specific role."""
    return ROLE_KEYWORDS.get(role, [])


def get_all_keywords() -> Dict[str, List[str]]:
    """Get all role keywords."""
    return ROLE_KEYWORDS.copy()


def is_action_verb(word: str) -> bool:
    """Check if a word is a known action verb."""
    return word.lower() in ACTION_VERBS
