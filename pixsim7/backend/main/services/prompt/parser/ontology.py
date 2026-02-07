"""
PixSim7 Prompt Parser Ontology

Centralized role names and keyword lists for prompt classification.
Supports two modes:
  1. Fast mode (default): Uses hardcoded baseline keywords
  2. Vocabulary-backed mode: Syncs from vocabulary system on first use

Usage:
    # Fast mode (immediate, no I/O)
    from .ontology import ROLE_KEYWORDS, ACTION_VERBS

    # Vocabulary-backed mode (call once at startup)
    from .ontology import sync_from_vocabularies
    sync_from_vocabularies()  # Enriches keywords from YAML vocabs
"""

from typing import Dict, List, Set, Optional
import threading

# ===== BASELINE ROLE KEYWORDS =====
# Hardcoded defaults for fast mode - no YAML loading required

_BASELINE_ROLE_KEYWORDS: Dict[str, List[str]] = {
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
        # Movement (base + conjugated)
        "enter", "enters", "walk", "walks", "move", "moves",
        "approach", "approaches", "leave", "leaves", "run", "runs",
        "step", "steps", "advance", "advances", "retreat", "retreats",
        "climb", "climbs", "descend", "descends", "jump", "jumps",
        # Physical interaction
        "touch", "touches", "grab", "grabs", "hold", "holds",
        "release", "releases", "push", "pushes", "pull", "pulls",
        "lean", "leans", "sit", "sits", "stand", "stands",
        "kneel", "kneels", "lie", "lies",
        # Social/intimate
        "kiss", "kisses", "embrace", "embraces", "caress", "caresses",
        "stroke", "strokes", "hug", "hugs",
        "look", "looks", "gaze", "gazes", "stare", "stares",
        "glance", "glances", "watch", "watches",
        # Speech
        "say", "says", "speak", "speaks", "whisper", "whispers",
        "shout", "shouts", "ask", "asks", "tell", "tells",
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
        # Tone/intensity
        "soft", "intense", "harsh", "rough", "violent",
    ],

    "romance": [
        # Actions (base + conjugated)
        "kiss", "kisses", "kissing", "embrace", "embracing",
        "caress", "caressing", "fondle", "fondling",
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
        "close-up", "closeup", "close up", "wide", "medium", "extreme",
        "establishing", "cutaway", "tight framing",
        # Perspectives
        "pov", "point of view", "first-person", "third-person",
        "over-the-shoulder", "bird's eye", "low angle", "high angle",
        "viewpoint",
        # Camera movement
        "pan", "zoom", "dolly", "tracking", "steadicam",
    ],
}

# ===== BASELINE ACTION VERBS =====
# Base forms and common conjugations for verb detection
# The stemmer will handle additional forms (-ing, -ed, etc.)
_BASELINE_ACTION_VERBS: List[str] = [
    # Movement - base forms
    "enter", "walk", "move", "approach", "leave", "run", "step",
    "go", "come", "arrive", "depart", "start", "stop",
    "begin", "end", "continue", "pause", "wait",
    # Movement - common conjugations
    "enters", "walks", "moves", "approaches", "leaves", "runs", "steps",
    "goes", "comes", "arrives", "departs", "starts", "stops",
    "begins", "ends", "continues", "pauses", "waits",
    # Physical - base forms
    "touch", "grab", "hold", "release", "push", "pull",
    "lean", "sit", "stand", "kneel", "kiss", "embrace",
    "look", "gaze", "stare", "glance", "say", "speak",
    "open", "close", "lift", "lower", "raise",
    "turn", "spin", "rotate", "twist", "bend",
    # Physical - common conjugations
    "touches", "grabs", "holds", "releases", "pushes", "pulls",
    "leans", "sits", "stands", "kneels", "kisses", "embraces",
    "looks", "gazes", "stares", "glances", "says", "speaks",
    "opens", "closes", "lifts", "lowers", "raises",
    "turns", "spins", "rotates", "twists", "bends",
]


# ===== MUTABLE STATE (enriched by vocabulary sync) =====
# These start as copies of baseline and can be enriched

_sync_lock = threading.Lock()
_synced_from_vocabularies = False

# Mutable keyword dicts - start as baseline, can be enriched
ROLE_KEYWORDS: Dict[str, List[str]] = {
    role: list(keywords) for role, keywords in _BASELINE_ROLE_KEYWORDS.items()
}

ACTION_VERBS: List[str] = list(_BASELINE_ACTION_VERBS)

# Pre-compute set for faster lookups (rebuilt after sync)
_ACTION_VERBS_SET: Set[str] = set(ACTION_VERBS)


# ===== VOCABULARY SYNC =====

def sync_from_vocabularies(force: bool = False) -> Dict[str, int]:
    """
    Enrich keywords from the vocabulary system.

    Call once at startup for richer keyword matching. Thread-safe and idempotent.
    After sync, parsing uses the enriched keywords (still fast - just more keywords).

    Args:
        force: If True, re-sync even if already synced

    Returns:
        Dict with counts of added keywords per role
    """
    global ROLE_KEYWORDS, ACTION_VERBS, _ACTION_VERBS_SET, _synced_from_vocabularies

    with _sync_lock:
        if _synced_from_vocabularies and not force:
            return {}

        added_counts: Dict[str, int] = {}

        try:
            from pixsim7.backend.main.shared.ontology.vocabularies import get_registry

            registry = get_registry()

            # Pull keywords from moods vocabulary
            for mood in registry.all_moods():
                if hasattr(mood, 'keywords') and mood.keywords:
                    existing = set(ROLE_KEYWORDS.get("mood", []))
                    for kw in mood.keywords:
                        kw_lower = kw.lower()
                        if kw_lower not in existing:
                            ROLE_KEYWORDS.setdefault("mood", []).append(kw_lower)
                            added_counts["mood"] = added_counts.get("mood", 0) + 1

            # Pull keywords from locations vocabulary
            for loc in registry.all_locations():
                if hasattr(loc, 'keywords') and loc.keywords:
                    existing = set(ROLE_KEYWORDS.get("setting", []))
                    for kw in loc.keywords:
                        kw_lower = kw.lower()
                        if kw_lower not in existing:
                            ROLE_KEYWORDS.setdefault("setting", []).append(kw_lower)
                            added_counts["setting"] = added_counts.get("setting", 0) + 1

            # Pull keywords from spatial vocabulary (camera-related)
            for spatial in registry.all_spatial():
                if hasattr(spatial, 'keywords') and spatial.keywords:
                    existing = set(ROLE_KEYWORDS.get("camera", []))
                    for kw in spatial.keywords:
                        kw_lower = kw.lower()
                        if kw_lower not in existing:
                            ROLE_KEYWORDS.setdefault("camera", []).append(kw_lower)
                            added_counts["camera"] = added_counts.get("camera", 0) + 1

            # Pull keywords from poses vocabulary (can indicate actions)
            for pose in registry.all_poses():
                detector_labels = getattr(pose, "detector_labels", None)
                if detector_labels:
                    existing = set(ROLE_KEYWORDS.get("action", []))
                    for kw in detector_labels:
                        kw_lower = kw.lower()
                        if kw_lower not in existing:
                            ROLE_KEYWORDS.setdefault("action", []).append(kw_lower)
                            added_counts["action"] = added_counts.get("action", 0) + 1

            # Rebuild action verbs set
            _ACTION_VERBS_SET.clear()
            _ACTION_VERBS_SET.update(ACTION_VERBS)

            _synced_from_vocabularies = True

        except ImportError:
            # Vocabulary system not available - use baseline only
            pass
        except Exception:
            # Don't fail parsing if vocab sync fails
            pass

        return added_counts


def is_synced() -> bool:
    """Check if vocabulary sync has been performed."""
    return _synced_from_vocabularies


def reset_to_baseline() -> None:
    """Reset keywords to baseline (for testing)."""
    global ROLE_KEYWORDS, ACTION_VERBS, _ACTION_VERBS_SET, _synced_from_vocabularies

    with _sync_lock:
        ROLE_KEYWORDS.clear()
        for role, keywords in _BASELINE_ROLE_KEYWORDS.items():
            ROLE_KEYWORDS[role] = list(keywords)

        ACTION_VERBS.clear()
        ACTION_VERBS.extend(_BASELINE_ACTION_VERBS)

        _ACTION_VERBS_SET.clear()
        _ACTION_VERBS_SET.update(ACTION_VERBS)

        _synced_from_vocabularies = False


# ===== HELPER FUNCTIONS =====

def get_keywords_for_role(role: str) -> List[str]:
    """Get keyword list for a specific role."""
    return ROLE_KEYWORDS.get(role, [])


def get_all_keywords() -> Dict[str, List[str]]:
    """Get all role keywords."""
    return ROLE_KEYWORDS.copy()


def is_action_verb(word: str) -> bool:
    """Check if a word is a known action verb."""
    return word.lower() in _ACTION_VERBS_SET
