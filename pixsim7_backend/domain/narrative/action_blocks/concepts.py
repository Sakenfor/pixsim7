"""
Concept library for dynamic action block generation.
Provides building blocks for creatures, interactions, body areas, and movements.
"""

from typing import Dict, List, Optional, Set
from enum import Enum
from dataclasses import dataclass, field
from pydantic import BaseModel, Field


class CreatureType(str, Enum):
    """Available creature types for generation."""
    HUMAN = "human"
    WEREWOLF = "werewolf"
    VAMPIRE = "vampire"
    DRAGON = "dragon"
    TENTACLE = "tentacle"
    SLIME = "slime"
    ROBOT = "robot"
    ALIEN = "alien"
    DEMON = "demon"
    ANGEL = "angel"
    ELEMENTAL = "elemental"
    SHAPESHIFTER = "shapeshifter"


class MovementType(str, Enum):
    """Types of movement patterns."""
    WALKING = "walking"
    CRAWLING = "crawling"
    SLITHERING = "slithering"
    FLYING = "flying"
    FLOATING = "floating"
    TELEPORTING = "teleporting"
    PHASING = "phasing"
    FLOWING = "flowing"


class InteractionType(str, Enum):
    """Types of interactions between entities."""
    PHYSICAL = "physical"
    MAGICAL = "magical"
    PSYCHIC = "psychic"
    ENERGETIC = "energetic"
    MECHANICAL = "mechanical"


class BodyArea(str, Enum):
    """Anatomical areas for interactions."""
    HEAD = "head"
    FACE = "face"
    NECK = "neck"
    SHOULDERS = "shoulders"
    CHEST = "chest"
    ARMS = "arms"
    HANDS = "hands"
    TORSO = "torso"
    WAIST = "waist"
    HIPS = "hips"
    THIGHS = "thighs"
    LEGS = "legs"
    FEET = "feet"
    BACK = "back"
    FULL_BODY = "full_body"


@dataclass
class CreatureProperties:
    """Properties and capabilities of a creature type."""
    type: CreatureType
    movement_types: List[MovementType]
    special_features: List[str]
    texture_descriptors: List[str]
    size_category: str  # small, medium, large, huge
    interaction_capabilities: List[InteractionType]
    unique_actions: List[str]  # creature-specific actions


@dataclass
class InteractionPattern:
    """Pattern for generating interactions between entities."""
    name: str
    primary_action: str
    continuous_actions: List[str]
    affected_areas: List[BodyArea]
    intensity_range: tuple[int, int]  # min, max intensity
    requires_position: Optional[str] = None
    compatible_creatures: Optional[List[CreatureType]] = None


@dataclass
class ActionVocabulary:
    """Vocabulary for different types of actions."""
    touch_verbs: List[str] = field(default_factory=lambda: [
        "touching", "caressing", "stroking", "grazing", "tracing",
        "brushing", "gliding", "pressing", "massaging"
    ])
    grip_verbs: List[str] = field(default_factory=lambda: [
        "gripping", "holding", "grasping", "clutching", "squeezing",
        "clenching", "embracing", "clasping"
    ])
    movement_verbs: List[str] = field(default_factory=lambda: [
        "moving", "shifting", "sliding", "rotating", "circling",
        "swaying", "undulating", "pulsing", "vibrating"
    ])
    exploration_verbs: List[str] = field(default_factory=lambda: [
        "exploring", "discovering", "investigating", "examining",
        "probing", "searching", "mapping", "tracing"
    ])
    intensity_modifiers: List[str] = field(default_factory=lambda: [
        "gently", "softly", "firmly", "intensely", "powerfully",
        "delicately", "forcefully", "tenderly", "aggressively"
    ])


class ConceptLibrary:
    """Main library for all generation concepts."""

    def __init__(self):
        self.creatures = self._init_creatures()
        self.interaction_patterns = self._init_interaction_patterns()
        self.vocabulary = ActionVocabulary()
        self.position_library = self._init_positions()
        self.camera_patterns = self._init_camera_patterns()

    def _init_creatures(self) -> Dict[CreatureType, CreatureProperties]:
        """Initialize creature properties database."""
        return {
            CreatureType.WEREWOLF: CreatureProperties(
                type=CreatureType.WEREWOLF,
                movement_types=[MovementType.WALKING, MovementType.CRAWLING],
                special_features=["fur", "claws", "fangs", "muscular build", "lupine features"],
                texture_descriptors=["coarse fur", "rough paw pads", "warm breath", "powerful muscles"],
                size_category="large",
                interaction_capabilities=[InteractionType.PHYSICAL],
                unique_actions=["sniffing", "growling", "nuzzling", "licking", "pawing"]
            ),
            CreatureType.VAMPIRE: CreatureProperties(
                type=CreatureType.VAMPIRE,
                movement_types=[MovementType.WALKING, MovementType.FLOATING, MovementType.TELEPORTING],
                special_features=["fangs", "pale skin", "hypnotic gaze", "cold touch"],
                texture_descriptors=["cold skin", "silky hair", "sharp fangs"],
                size_category="medium",
                interaction_capabilities=[InteractionType.PHYSICAL, InteractionType.PSYCHIC],
                unique_actions=["biting", "draining", "mesmerizing", "seducing"]
            ),
            CreatureType.TENTACLE: CreatureProperties(
                type=CreatureType.TENTACLE,
                movement_types=[MovementType.SLITHERING, MovementType.FLOWING],
                special_features=["multiple appendages", "suction cups", "flexibility", "prehensile"],
                texture_descriptors=["slick surface", "rubbery texture", "pulsating", "wet"],
                size_category="variable",
                interaction_capabilities=[InteractionType.PHYSICAL],
                unique_actions=["wrapping", "constricting", "probing", "undulating", "suctioning"]
            ),
            CreatureType.SLIME: CreatureProperties(
                type=CreatureType.SLIME,
                movement_types=[MovementType.FLOWING, MovementType.CRAWLING],
                special_features=["amorphous", "translucent", "shape-shifting", "absorbing"],
                texture_descriptors=["viscous", "warm", "tingling", "enveloping"],
                size_category="variable",
                interaction_capabilities=[InteractionType.PHYSICAL, InteractionType.ENERGETIC],
                unique_actions=["enveloping", "absorbing", "rippling", "conforming", "dissolving"]
            ),
            CreatureType.DRAGON: CreatureProperties(
                type=CreatureType.DRAGON,
                movement_types=[MovementType.WALKING, MovementType.FLYING, MovementType.CRAWLING],
                special_features=["scales", "wings", "fire breath", "massive size", "tail"],
                texture_descriptors=["rough scales", "hot breath", "powerful wings"],
                size_category="huge",
                interaction_capabilities=[InteractionType.PHYSICAL, InteractionType.MAGICAL],
                unique_actions=["coiling", "breathing fire", "rumbling", "wing-wrapping"]
            )
        }

    def _init_interaction_patterns(self) -> List[InteractionPattern]:
        """Initialize interaction pattern templates."""
        return [
            InteractionPattern(
                name="exploration",
                primary_action="exploring",
                continuous_actions=["touching", "feeling", "discovering"],
                affected_areas=[BodyArea.FULL_BODY],
                intensity_range=(1, 5)
            ),
            InteractionPattern(
                name="embrace",
                primary_action="embracing",
                continuous_actions=["holding", "pressing", "caressing"],
                affected_areas=[BodyArea.TORSO, BodyArea.ARMS],
                intensity_range=(3, 7)
            ),
            InteractionPattern(
                name="focused_attention",
                primary_action="focusing on",
                continuous_actions=["examining", "touching", "stimulating"],
                affected_areas=[BodyArea.NECK, BodyArea.SHOULDERS],
                intensity_range=(4, 8)
            ),
            InteractionPattern(
                name="progressive_intensity",
                primary_action="building intensity",
                continuous_actions=["starting gently", "increasing pressure", "reaching peak"],
                affected_areas=[BodyArea.FULL_BODY],
                intensity_range=(2, 10)
            )
        ]

    def _init_positions(self) -> Dict[str, dict]:
        """Initialize position library."""
        return {
            "standing": {
                "variations": ["upright", "leaning", "braced", "swaying"],
                "stability": "high",
                "mobility": "medium"
            },
            "sitting": {
                "variations": ["chair", "edge", "floor", "lap"],
                "stability": "medium",
                "mobility": "low"
            },
            "lying": {
                "variations": ["back", "side", "stomach", "elevated"],
                "stability": "low",
                "mobility": "low"
            },
            "kneeling": {
                "variations": ["upright", "bent", "all-fours", "single-knee"],
                "stability": "medium",
                "mobility": "medium"
            },
            "bent": {
                "variations": ["forward", "backward", "sideways", "arched"],
                "stability": "low",
                "mobility": "high"
            }
        }

    def _init_camera_patterns(self) -> Dict[str, dict]:
        """Initialize camera movement patterns."""
        return {
            "orbit": {
                "movement": "rotation",
                "speed": "slow",
                "path": "circular",
                "focus": "subjects"
            },
            "approach": {
                "movement": "dolly",
                "speed": "slow",
                "path": "linear",
                "focus": "interaction"
            },
            "reveal": {
                "movement": "tracking",
                "speed": "medium",
                "path": "arc",
                "focus": "progressive"
            },
            "intimate": {
                "movement": "handheld",
                "speed": "slow",
                "path": "linear",
                "focus": "details"
            }
        }

    def get_creature(self, creature_type: CreatureType) -> Optional[CreatureProperties]:
        """Get properties for a specific creature type."""
        return self.creatures.get(creature_type)

    def get_compatible_interactions(
        self,
        creature: CreatureType,
        intensity: int
    ) -> List[InteractionPattern]:
        """Get interaction patterns compatible with creature and intensity."""
        patterns = []
        for pattern in self.interaction_patterns:
            if pattern.compatible_creatures is None or creature in pattern.compatible_creatures:
                if pattern.intensity_range[0] <= intensity <= pattern.intensity_range[1]:
                    patterns.append(pattern)
        return patterns

    def generate_action_vocabulary(
        self,
        interaction_type: str,
        intensity: int
    ) -> List[str]:
        """Generate appropriate action words based on type and intensity."""
        vocab = []

        if interaction_type == "touch":
            vocab = self.vocabulary.touch_verbs
        elif interaction_type == "grip":
            vocab = self.vocabulary.grip_verbs
        elif interaction_type == "movement":
            vocab = self.vocabulary.movement_verbs
        elif interaction_type == "exploration":
            vocab = self.vocabulary.exploration_verbs

        # Filter by intensity
        if intensity < 4:
            vocab = vocab[:len(vocab)//2]  # Use gentler words
        elif intensity > 7:
            vocab = vocab[len(vocab)//2:]  # Use stronger words

        return vocab


# Singleton instance
concept_library = ConceptLibrary()