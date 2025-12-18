"""
OntologyService - Single source of truth for action block vocabulary.

Loads ontology.yaml and exposes structured access to:
- Poses (categories, parents, compatible transitions)
- Intimacy levels (ordered scale, adjacency)
- Content ratings (ordered scale)
- Moods, branch intents, locations

This service is designed to be loaded once and shared across filters/scorers.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Any
import yaml

import pixsim_logging

logger = pixsim_logging.get_logger()

# Default ontology path
_DEFAULT_ONTOLOGY_PATH = Path(__file__).parent.parent.parent / "shared" / "ontology.yaml"


@dataclass
class PoseDefinition:
    """A pose from ontology.yaml."""
    id: str
    label: str
    category: str
    parent: Optional[str] = None
    intimacy_min: int = 0
    detector_labels: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)

    @property
    def short_id(self) -> str:
        """Get ID without 'pose:' prefix."""
        return self.id.removeprefix("pose:")


@dataclass
class IntimacyLevel:
    """An intimacy level from ontology.yaml."""
    id: str
    label: str
    level: int
    range: tuple[int, int]

    @property
    def short_id(self) -> str:
        """Get ID without 'intimacy:' prefix."""
        return self.id.removeprefix("intimacy:")


@dataclass
class ContentRatingDef:
    """A content rating from ontology.yaml."""
    id: str
    label: str
    level: int
    description: str = ""
    requires_age_verification: bool = False

    @property
    def short_id(self) -> str:
        """Get ID without 'rating:' prefix."""
        return self.id.removeprefix("rating:")


@dataclass
class MoodDefinition:
    """A mood from ontology.yaml."""
    id: str
    label: str
    keywords: List[str] = field(default_factory=list)
    intensity_range: Optional[tuple[int, int]] = None

    @property
    def short_id(self) -> str:
        """Get ID without 'mood:' prefix."""
        return self.id.removeprefix("mood:")


@dataclass
class BranchIntentDef:
    """A branch intent from ontology.yaml."""
    id: str
    label: str
    description: str = ""

    @property
    def short_id(self) -> str:
        """Get ID without 'branch:' prefix."""
        return self.id.removeprefix("branch:")


@dataclass
class LocationDefinition:
    """A location from ontology.yaml."""
    id: str
    label: str
    indoor: bool = True
    romantic: bool = False
    private: bool = False
    keywords: List[str] = field(default_factory=list)

    @property
    def short_id(self) -> str:
        """Get ID without 'location:' prefix."""
        return self.id.removeprefix("location:")


@dataclass
class ScoringWeights:
    """Scoring weights from ontology.yaml."""
    chain_compatibility: float = 0.30
    location_match: float = 0.20
    pose_match: float = 0.15
    intimacy_match: float = 0.15
    mood_match: float = 0.10
    branch_intent: float = 0.10


@dataclass
class PartialCredit:
    """Partial credit rules from ontology.yaml."""
    generic_block: float = 0.5
    parent_pose: float = 0.8
    same_category: float = 0.6
    adjacent_intimacy: float = 0.7


@dataclass
class ChainConstraints:
    """Chain building constraints from ontology.yaml."""
    max_blocks: int = 3
    min_remaining_budget: float = 3.0


@dataclass
class DurationConstraints:
    """Duration constraints from ontology.yaml."""
    min_block: float = 3.0
    max_block: float = 12.0
    default_single: float = 6.0
    default_transition: float = 7.0


@dataclass
class ScoringConfig:
    """Complete scoring configuration from ontology.yaml."""
    weights: ScoringWeights = field(default_factory=ScoringWeights)
    partial_credit: PartialCredit = field(default_factory=PartialCredit)
    chain: ChainConstraints = field(default_factory=ChainConstraints)
    duration: DurationConstraints = field(default_factory=DurationConstraints)


class OntologyService:
    """
    Service for accessing ontology data.

    Loads ontology.yaml once and provides structured access.
    Use the module-level `get_ontology()` function to get a shared instance.
    """

    def __init__(self, ontology_path: Optional[Path] = None):
        """
        Initialize the ontology service.

        Args:
            ontology_path: Path to ontology.yaml. Uses default if None.
        """
        self._path = ontology_path or _DEFAULT_ONTOLOGY_PATH
        self._raw: Dict[str, Any] = {}

        # Pose data
        self._poses: Dict[str, PoseDefinition] = {}
        self._pose_categories: List[str] = []
        self._poses_by_category: Dict[str, List[str]] = {}
        self._detector_to_pose: Dict[str, str] = {}

        # Intimacy levels
        self._intimacy_levels: Dict[str, IntimacyLevel] = {}
        self._intimacy_by_level: Dict[int, str] = {}

        # Ratings
        self._ratings: Dict[str, ContentRatingDef] = {}
        self._rating_by_level: Dict[int, str] = {}

        # Moods and intents
        self._moods: Dict[str, MoodDefinition] = {}
        self._branch_intents: Dict[str, BranchIntentDef] = {}

        # Locations
        self._locations: Dict[str, LocationDefinition] = {}

        # Scoring
        self._scoring: ScoringConfig = ScoringConfig()

        self._loaded = False

    def load(self) -> "OntologyService":
        """Load ontology data from YAML. Returns self for chaining."""
        if self._loaded:
            return self

        if not self._path.exists():
            logger.warning("ontology_not_found", path=str(self._path))
            return self

        try:
            with open(self._path, "r") as f:
                self._raw = yaml.safe_load(f)

            self._load_poses()
            self._load_intimacy_levels()
            self._load_ratings()
            self._load_moods()
            self._load_branch_intents()
            self._load_locations()
            self._load_scoring()

            self._loaded = True
            logger.info(
                "ontology_loaded",
                poses=len(self._poses),
                intimacy_levels=len(self._intimacy_levels),
                ratings=len(self._ratings),
                locations=len(self._locations),
            )

        except Exception as e:
            logger.error("ontology_load_failed", error=str(e))

        return self

    # =========================================================================
    # Poses
    # =========================================================================

    def get_pose(self, pose_id: str) -> Optional[PoseDefinition]:
        """Get a pose by ID (with or without 'pose:' prefix)."""
        self._ensure_loaded()
        canonical = self._canonicalize_id(pose_id, "pose")
        return self._poses.get(canonical)

    def get_pose_category(self, pose_id: str) -> Optional[str]:
        """Get the category for a pose."""
        pose = self.get_pose(pose_id)
        return pose.category if pose else None

    def get_pose_parent(self, pose_id: str) -> Optional[str]:
        """Get the parent pose ID."""
        pose = self.get_pose(pose_id)
        return pose.parent if pose else None

    def poses_in_category(self, category: str) -> List[str]:
        """Get all pose IDs in a category."""
        self._ensure_loaded()
        return self._poses_by_category.get(category, [])

    def all_pose_categories(self) -> List[str]:
        """Get all pose category names."""
        self._ensure_loaded()
        return self._pose_categories.copy()

    def map_detector_to_pose(self, detector_label: str) -> Optional[str]:
        """Map a detector label to a pose ID."""
        self._ensure_loaded()
        return self._detector_to_pose.get(detector_label.lower())

    def are_poses_compatible(self, pose1: str, pose2: str) -> bool:
        """
        Check if two poses are compatible for chaining.

        Compatible means:
        - Same pose
        - Same category
        - Parent-child relationship
        """
        if pose1 == pose2:
            return True

        p1 = self.get_pose(pose1)
        p2 = self.get_pose(pose2)

        if not p1 or not p2:
            return False

        # Same category
        if p1.category == p2.category:
            return True

        # Parent-child
        canonical1 = self._canonicalize_id(pose1, "pose")
        canonical2 = self._canonicalize_id(pose2, "pose")
        if p1.parent == canonical2 or p2.parent == canonical1:
            return True

        return False

    def pose_similarity_score(self, pose1: str, pose2: str) -> float:
        """
        Calculate similarity score between poses.

        Returns:
            1.0 for exact match
            parent_pose credit for parent-child
            same_category credit for same category
            0.0 for unrelated
        """
        if pose1 == pose2:
            return 1.0

        p1 = self.get_pose(pose1)
        p2 = self.get_pose(pose2)

        if not p1 or not p2:
            return 0.0

        canonical1 = self._canonicalize_id(pose1, "pose")
        canonical2 = self._canonicalize_id(pose2, "pose")

        # Parent-child
        if p1.parent == canonical2 or p2.parent == canonical1:
            return self._scoring.partial_credit.parent_pose

        # Same category
        if p1.category == p2.category:
            return self._scoring.partial_credit.same_category

        return 0.0

    # =========================================================================
    # Intimacy Levels
    # =========================================================================

    def get_intimacy_level(self, level_id: str) -> Optional[IntimacyLevel]:
        """Get an intimacy level by ID."""
        self._ensure_loaded()
        canonical = self._canonicalize_id(level_id, "intimacy")
        return self._intimacy_levels.get(canonical)

    def get_intimacy_order(self, level_id: str) -> int:
        """Get numeric order for an intimacy level (0-5)."""
        level = self.get_intimacy_level(level_id)
        return level.level if level else 0

    def intimacy_distance(self, level1: str, level2: str) -> int:
        """Get distance between two intimacy levels."""
        return abs(self.get_intimacy_order(level1) - self.get_intimacy_order(level2))

    def are_intimacy_adjacent(self, level1: str, level2: str) -> bool:
        """Check if two intimacy levels are adjacent."""
        return self.intimacy_distance(level1, level2) <= 1

    def all_intimacy_levels(self) -> List[str]:
        """Get all intimacy level IDs in order."""
        self._ensure_loaded()
        return [self._intimacy_by_level[i] for i in sorted(self._intimacy_by_level.keys())]

    # =========================================================================
    # Content Ratings
    # =========================================================================

    def get_rating(self, rating_id: str) -> Optional[ContentRatingDef]:
        """Get a content rating by ID."""
        self._ensure_loaded()
        canonical = self._canonicalize_id(rating_id, "rating")
        return self._ratings.get(canonical)

    def get_rating_level(self, rating_id: str) -> int:
        """Get numeric level for a rating (0-3)."""
        rating = self.get_rating(rating_id)
        return rating.level if rating else 0

    def is_rating_allowed(self, block_rating: str, max_rating: str) -> bool:
        """Check if a block's rating is within the allowed max."""
        return self.get_rating_level(block_rating) <= self.get_rating_level(max_rating)

    def all_ratings(self) -> List[str]:
        """Get all rating IDs in order."""
        self._ensure_loaded()
        return [self._rating_by_level[i] for i in sorted(self._rating_by_level.keys())]

    # =========================================================================
    # Moods
    # =========================================================================

    def get_mood(self, mood_id: str) -> Optional[MoodDefinition]:
        """Get a mood by ID."""
        self._ensure_loaded()
        canonical = self._canonicalize_id(mood_id, "mood")
        return self._moods.get(canonical)

    def all_mood_ids(self) -> List[str]:
        """Get all mood IDs."""
        self._ensure_loaded()
        return list(self._moods.keys())

    # =========================================================================
    # Branch Intents
    # =========================================================================

    def get_branch_intent(self, intent_id: str) -> Optional[BranchIntentDef]:
        """Get a branch intent by ID."""
        self._ensure_loaded()
        canonical = self._canonicalize_id(intent_id, "branch")
        return self._branch_intents.get(canonical)

    def all_branch_intents(self) -> List[str]:
        """Get all branch intent IDs."""
        self._ensure_loaded()
        return list(self._branch_intents.keys())

    # =========================================================================
    # Locations
    # =========================================================================

    def get_location(self, location_id: str) -> Optional[LocationDefinition]:
        """Get a location by ID."""
        self._ensure_loaded()
        canonical = self._canonicalize_id(location_id, "location")
        return self._locations.get(canonical)

    def all_location_ids(self) -> List[str]:
        """Get all location IDs."""
        self._ensure_loaded()
        return list(self._locations.keys())

    # =========================================================================
    # Scoring Config
    # =========================================================================

    @property
    def scoring(self) -> ScoringConfig:
        """Get scoring configuration."""
        self._ensure_loaded()
        return self._scoring

    @property
    def weights(self) -> ScoringWeights:
        """Get scoring weights."""
        return self.scoring.weights

    @property
    def partial_credit(self) -> PartialCredit:
        """Get partial credit rules."""
        return self.scoring.partial_credit

    @property
    def chain_constraints(self) -> ChainConstraints:
        """Get chain building constraints."""
        return self.scoring.chain

    @property
    def duration_constraints(self) -> DurationConstraints:
        """Get duration constraints."""
        return self.scoring.duration

    # =========================================================================
    # ID Canonicalization
    # =========================================================================

    def canonicalize_pose_id(self, pose_id: str) -> str:
        """Ensure pose ID has 'pose:' prefix."""
        return self._canonicalize_id(pose_id, "pose")

    def canonicalize_intimacy_id(self, level_id: str) -> str:
        """Ensure intimacy ID has 'intimacy:' prefix."""
        return self._canonicalize_id(level_id, "intimacy")

    def canonicalize_rating_id(self, rating_id: str) -> str:
        """Ensure rating ID has 'rating:' prefix."""
        return self._canonicalize_id(rating_id, "rating")

    def canonicalize_mood_id(self, mood_id: str) -> str:
        """Ensure mood ID has 'mood:' prefix."""
        return self._canonicalize_id(mood_id, "mood")

    def canonicalize_location_id(self, location_id: str) -> str:
        """Ensure location ID has 'location:' prefix."""
        return self._canonicalize_id(location_id, "location")

    # =========================================================================
    # Internal
    # =========================================================================

    def _ensure_loaded(self) -> None:
        """Ensure ontology is loaded."""
        if not self._loaded:
            self.load()

    def _canonicalize_id(self, id_str: str, prefix: str) -> str:
        """Ensure ID has proper prefix."""
        if not id_str:
            return ""
        expected_prefix = f"{prefix}:"
        if id_str.startswith(expected_prefix):
            return id_str
        return f"{expected_prefix}{id_str}"

    def _load_poses(self) -> None:
        """Load pose definitions."""
        action_blocks = self._raw.get("action_blocks", {})
        poses_data = action_blocks.get("poses", {})

        self._pose_categories = poses_data.get("categories", [])

        for pose_data in poses_data.get("definitions", []):
            pose = PoseDefinition(
                id=pose_data["id"],
                label=pose_data.get("label", ""),
                category=pose_data.get("category", ""),
                parent=pose_data.get("parent"),
                intimacy_min=pose_data.get("intimacy_min", 0),
                detector_labels=pose_data.get("detector_labels", []),
                tags=pose_data.get("tags", []),
            )
            self._poses[pose.id] = pose

            # Category index
            cat = pose.category
            if cat not in self._poses_by_category:
                self._poses_by_category[cat] = []
            self._poses_by_category[cat].append(pose.id)

            # Detector label index
            for label in pose.detector_labels:
                self._detector_to_pose[label.lower()] = pose.id

    def _load_intimacy_levels(self) -> None:
        """Load intimacy level definitions."""
        action_blocks = self._raw.get("action_blocks", {})

        for level_data in action_blocks.get("intimacy_levels", []):
            level = IntimacyLevel(
                id=level_data["id"],
                label=level_data.get("label", ""),
                level=level_data.get("level", 0),
                range=tuple(level_data.get("range", [0, 0])),
            )
            self._intimacy_levels[level.id] = level
            self._intimacy_by_level[level.level] = level.id

    def _load_ratings(self) -> None:
        """Load content rating definitions."""
        action_blocks = self._raw.get("action_blocks", {})

        for rating_data in action_blocks.get("content_ratings", []):
            rating = ContentRatingDef(
                id=rating_data["id"],
                label=rating_data.get("label", ""),
                level=rating_data.get("level", 0),
                description=rating_data.get("description", ""),
                requires_age_verification=rating_data.get("requires_age_verification", False),
            )
            self._ratings[rating.id] = rating
            self._rating_by_level[rating.level] = rating.id

    def _load_moods(self) -> None:
        """Load mood definitions."""
        action_blocks = self._raw.get("action_blocks", {})

        for mood_data in action_blocks.get("moods", []):
            intensity_range = mood_data.get("intensity_range")
            mood = MoodDefinition(
                id=mood_data["id"],
                label=mood_data.get("label", ""),
                keywords=mood_data.get("keywords", []),
                intensity_range=tuple(intensity_range) if intensity_range else None,
            )
            self._moods[mood.id] = mood

    def _load_branch_intents(self) -> None:
        """Load branch intent definitions."""
        action_blocks = self._raw.get("action_blocks", {})

        for intent_data in action_blocks.get("branch_intents", []):
            intent = BranchIntentDef(
                id=intent_data["id"],
                label=intent_data.get("label", ""),
                description=intent_data.get("description", ""),
            )
            self._branch_intents[intent.id] = intent

    def _load_locations(self) -> None:
        """Load location definitions."""
        action_blocks = self._raw.get("action_blocks", {})

        for loc_data in action_blocks.get("locations", []):
            location = LocationDefinition(
                id=loc_data["id"],
                label=loc_data.get("label", ""),
                indoor=loc_data.get("indoor", True),
                romantic=loc_data.get("romantic", False),
                private=loc_data.get("private", False),
                keywords=loc_data.get("keywords", []),
            )
            self._locations[location.id] = location

    def _load_scoring(self) -> None:
        """Load scoring configuration."""
        scoring_data = self._raw.get("scoring", {})

        weights_data = scoring_data.get("weights", {})
        partial_data = scoring_data.get("partial_credit", {})
        chain_data = scoring_data.get("chain", {})
        duration_data = scoring_data.get("duration", {})

        self._scoring = ScoringConfig(
            weights=ScoringWeights(
                chain_compatibility=weights_data.get("chain_compatibility", 0.30),
                location_match=weights_data.get("location_match", 0.20),
                pose_match=weights_data.get("pose_match", 0.15),
                intimacy_match=weights_data.get("intimacy_match", 0.15),
                mood_match=weights_data.get("mood_match", 0.10),
                branch_intent=weights_data.get("branch_intent", 0.10),
            ),
            partial_credit=PartialCredit(
                generic_block=partial_data.get("generic_block", 0.5),
                parent_pose=partial_data.get("parent_pose", 0.8),
                same_category=partial_data.get("same_category", 0.6),
                adjacent_intimacy=partial_data.get("adjacent_intimacy", 0.7),
            ),
            chain=ChainConstraints(
                max_blocks=chain_data.get("max_blocks", 3),
                min_remaining_budget=chain_data.get("min_remaining_budget", 3.0),
            ),
            duration=DurationConstraints(
                min_block=duration_data.get("min_block", 3.0),
                max_block=duration_data.get("max_block", 12.0),
                default_single=duration_data.get("default_single", 6.0),
                default_transition=duration_data.get("default_transition", 7.0),
            ),
        )


# =============================================================================
# SINGLETON ACCESS
# =============================================================================

_ontology_instance: Optional[OntologyService] = None


def get_ontology(reload: bool = False) -> OntologyService:
    """
    Get the shared OntologyService instance.

    Args:
        reload: Force reload from YAML file

    Returns:
        Shared OntologyService instance
    """
    global _ontology_instance

    if _ontology_instance is None or reload:
        _ontology_instance = OntologyService().load()

    return _ontology_instance
