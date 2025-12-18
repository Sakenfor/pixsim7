"""
OntologyRegistry - Unified ontology loading with plugin pack support.

Loads the core ontology.yaml and discovers additional ontology packs from plugins.
Provides type-safe query helpers and validation for concept references.

Usage:
    from pixsim7.backend.main.shared.ontology_registry import get_ontology_registry

    registry = get_ontology_registry()

    # Check if a concept exists
    if registry.is_known_concept("pose", "standing_neutral"):
        ...

    # Get pose info
    pose = registry.get_pose("pose:standing_neutral")

    # Plugin concepts are also accessible
    if registry.is_known_concept("mood", "mysterious"):
        ...
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Any, Callable
import yaml
import glob as glob_module

import pixsim_logging

logger = pixsim_logging.get_logger()

# Default paths
_DEFAULT_ONTOLOGY_PATH = Path(__file__).parent / "ontology.yaml"
_DEFAULT_PLUGINS_PATH = Path(__file__).parent.parent / "plugins"


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class PoseDefinition:
    """A pose from ontology."""
    id: str
    label: str
    category: str
    parent: Optional[str] = None
    intimacy_min: int = 0
    detector_labels: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    source: str = "core"  # Which pack defined this

    @property
    def short_id(self) -> str:
        """Get ID without 'pose:' prefix."""
        return self.id.removeprefix("pose:")


@dataclass
class IntimacyLevel:
    """An intimacy level from ontology."""
    id: str
    label: str
    level: int
    range: tuple[int, int]
    source: str = "core"

    @property
    def short_id(self) -> str:
        """Get ID without 'intimacy:' prefix."""
        return self.id.removeprefix("intimacy:")


@dataclass
class ContentRatingDef:
    """A content rating from ontology."""
    id: str
    label: str
    level: int
    description: str = ""
    requires_age_verification: bool = False
    source: str = "core"

    @property
    def short_id(self) -> str:
        """Get ID without 'rating:' prefix."""
        return self.id.removeprefix("rating:")


@dataclass
class MoodDefinition:
    """A mood from ontology."""
    id: str
    label: str
    keywords: List[str] = field(default_factory=list)
    intensity_range: Optional[tuple[int, int]] = None
    source: str = "core"

    @property
    def short_id(self) -> str:
        """Get ID without 'mood:' prefix."""
        return self.id.removeprefix("mood:")


@dataclass
class BranchIntentDef:
    """A branch intent from ontology."""
    id: str
    label: str
    description: str = ""
    source: str = "core"

    @property
    def short_id(self) -> str:
        """Get ID without 'branch:' prefix."""
        return self.id.removeprefix("branch:")


@dataclass
class LocationDefinition:
    """A location from ontology."""
    id: str
    label: str
    indoor: bool = True
    romantic: bool = False
    private: bool = False
    keywords: List[str] = field(default_factory=list)
    source: str = "core"

    @property
    def short_id(self) -> str:
        """Get ID without 'location:' prefix."""
        return self.id.removeprefix("location:")


@dataclass
class ScoringWeights:
    """Scoring weights from ontology."""
    chain_compatibility: float = 0.30
    location_match: float = 0.20
    pose_match: float = 0.15
    intimacy_match: float = 0.15
    mood_match: float = 0.10
    branch_intent: float = 0.10


@dataclass
class PartialCredit:
    """Partial credit rules from ontology."""
    generic_block: float = 0.5
    parent_pose: float = 0.8
    same_category: float = 0.6
    adjacent_intimacy: float = 0.7


@dataclass
class ChainConstraints:
    """Chain building constraints from ontology."""
    max_blocks: int = 3
    min_remaining_budget: float = 3.0


@dataclass
class DurationConstraints:
    """Duration constraints from ontology."""
    min_block: float = 3.0
    max_block: float = 12.0
    default_single: float = 6.0
    default_transition: float = 7.0


@dataclass
class ScoringConfig:
    """Complete scoring configuration from ontology."""
    weights: ScoringWeights = field(default_factory=ScoringWeights)
    partial_credit: PartialCredit = field(default_factory=PartialCredit)
    chain: ChainConstraints = field(default_factory=ChainConstraints)
    duration: DurationConstraints = field(default_factory=DurationConstraints)


@dataclass
class OntologyPackInfo:
    """Metadata about a loaded ontology pack."""
    id: str
    source_path: str
    plugin_id: Optional[str]
    version: Optional[str]
    label: Optional[str]
    concepts_added: Dict[str, int] = field(default_factory=dict)


# =============================================================================
# ONTOLOGY REGISTRY
# =============================================================================

class OntologyRegistry:
    """
    Registry for all ontology concepts from core and plugins.

    Loads ontology.yaml and plugin ontology packs, merging them deterministically.
    Validates no ID collisions (unless override rules apply).
    Provides query helpers for all concept kinds.
    """

    def __init__(
        self,
        ontology_path: Optional[Path] = None,
        plugins_path: Optional[Path] = None,
        strict_mode: bool = True,
    ):
        """
        Initialize the ontology registry.

        Args:
            ontology_path: Path to core ontology.yaml. Uses default if None.
            plugins_path: Path to plugins directory. Uses default if None.
            strict_mode: If True, unknown concepts cause validation errors.
                        If False, unknown concepts are allowed (for dev).
        """
        self._core_path = ontology_path or _DEFAULT_ONTOLOGY_PATH
        self._plugins_path = plugins_path or _DEFAULT_PLUGINS_PATH
        self._strict_mode = strict_mode

        # Raw data from files
        self._raw_core: Dict[str, Any] = {}
        self._raw_packs: List[tuple[str, Dict[str, Any]]] = []

        # Pack info
        self._packs: List[OntologyPackInfo] = []

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

        # Plugin scoring weight overrides (namespaced)
        self._plugin_scoring_weights: Dict[str, Dict[str, float]] = {}

        self._loaded = False

    @property
    def strict_mode(self) -> bool:
        """Whether unknown concepts cause validation errors."""
        return self._strict_mode

    @strict_mode.setter
    def strict_mode(self, value: bool) -> None:
        """Set strict mode."""
        self._strict_mode = value

    @property
    def loaded_packs(self) -> List[OntologyPackInfo]:
        """Get list of loaded ontology packs."""
        self._ensure_loaded()
        return self._packs.copy()

    # =========================================================================
    # Loading
    # =========================================================================

    def load(self) -> "OntologyRegistry":
        """Load ontology data from YAML files. Returns self for chaining."""
        if self._loaded:
            return self

        # Load core ontology
        self._load_core()

        # Discover and load plugin packs
        self._discover_plugin_packs()

        # Parse all data
        self._parse_poses()
        self._parse_intimacy_levels()
        self._parse_ratings()
        self._parse_moods()
        self._parse_branch_intents()
        self._parse_locations()
        self._parse_scoring()

        self._loaded = True

        logger.info(
            "ontology_registry_loaded",
            packs=len(self._packs),
            poses=len(self._poses),
            moods=len(self._moods),
            locations=len(self._locations),
            intimacy_levels=len(self._intimacy_levels),
            ratings=len(self._ratings),
        )

        return self

    def _load_core(self) -> None:
        """Load the core ontology.yaml."""
        if not self._core_path.exists():
            logger.warning("ontology_core_not_found", path=str(self._core_path))
            return

        try:
            with open(self._core_path, "r") as f:
                self._raw_core = yaml.safe_load(f) or {}

            # Register core pack
            self._packs.append(OntologyPackInfo(
                id="core",
                source_path=str(self._core_path),
                plugin_id=None,
                version=self._raw_core.get("version"),
                label=self._raw_core.get("label", "Core Ontology"),
            ))

            logger.debug("ontology_core_loaded", path=str(self._core_path))

        except Exception as e:
            logger.error("ontology_core_load_failed", error=str(e))

    def _discover_plugin_packs(self) -> None:
        """Discover and load ontology packs from plugins."""
        if not self._plugins_path.exists():
            return

        # Look for ontology*.yaml files in plugin directories
        pattern = str(self._plugins_path / "*" / "ontology*.yaml")
        pack_files = sorted(glob_module.glob(pattern))

        for pack_path in pack_files:
            self._load_plugin_pack(Path(pack_path))

    def _load_plugin_pack(self, pack_path: Path) -> None:
        """Load a single plugin ontology pack."""
        try:
            with open(pack_path, "r") as f:
                pack_data = yaml.safe_load(f) or {}

            # Extract plugin ID from path (parent directory name)
            plugin_id = pack_path.parent.name

            # Store raw data for later parsing
            self._raw_packs.append((plugin_id, pack_data))

            # Register pack info
            pack_info = OntologyPackInfo(
                id=pack_data.get("id", f"pack_{plugin_id}"),
                source_path=str(pack_path),
                plugin_id=plugin_id,
                version=pack_data.get("version"),
                label=pack_data.get("label", f"Plugin: {plugin_id}"),
            )
            self._packs.append(pack_info)

            logger.debug(
                "ontology_pack_loaded",
                plugin_id=plugin_id,
                pack_id=pack_info.id,
                path=str(pack_path),
            )

        except Exception as e:
            logger.warning(
                "ontology_pack_load_failed",
                path=str(pack_path),
                error=str(e),
            )

    def register_plugin_pack(
        self,
        plugin_id: str,
        pack_data: Dict[str, Any],
        allow_override: bool = False,
    ) -> None:
        """
        Register an ontology pack programmatically.

        This allows plugins to register concepts at runtime without YAML files.

        Args:
            plugin_id: Unique plugin identifier
            pack_data: Ontology pack data (same structure as ontology YAML)
            allow_override: If True, allow overriding existing concepts
        """
        self._ensure_loaded()

        # Validate no conflicts unless override allowed
        if not allow_override:
            self._validate_no_conflicts(plugin_id, pack_data)

        # Register pack info
        pack_info = OntologyPackInfo(
            id=pack_data.get("id", f"runtime_{plugin_id}"),
            source_path="<runtime>",
            plugin_id=plugin_id,
            version=pack_data.get("version"),
            label=pack_data.get("label", f"Runtime: {plugin_id}"),
        )
        self._packs.append(pack_info)

        # Parse and merge the new concepts
        self._merge_pack_data(plugin_id, pack_data, pack_info)

        logger.info(
            "ontology_pack_registered",
            plugin_id=plugin_id,
            pack_id=pack_info.id,
            concepts=pack_info.concepts_added,
        )

    def _validate_no_conflicts(self, plugin_id: str, pack_data: Dict[str, Any]) -> None:
        """Validate that pack doesn't conflict with existing concepts."""
        ab_data = pack_data.get("action_blocks", {})

        # Check poses
        for pose_data in ab_data.get("poses", {}).get("definitions", []):
            pose_id = pose_data.get("id")
            if pose_id and pose_id in self._poses:
                raise ValueError(
                    f"Plugin '{plugin_id}' conflicts: pose '{pose_id}' already defined "
                    f"by '{self._poses[pose_id].source}'"
                )

        # Check moods
        for mood_data in ab_data.get("moods", []):
            mood_id = mood_data.get("id")
            if mood_id and mood_id in self._moods:
                raise ValueError(
                    f"Plugin '{plugin_id}' conflicts: mood '{mood_id}' already defined "
                    f"by '{self._moods[mood_id].source}'"
                )

        # Check locations
        for loc_data in ab_data.get("locations", []):
            loc_id = loc_data.get("id")
            if loc_id and loc_id in self._locations:
                raise ValueError(
                    f"Plugin '{plugin_id}' conflicts: location '{loc_id}' already defined "
                    f"by '{self._locations[loc_id].source}'"
                )

    def _merge_pack_data(
        self,
        source: str,
        pack_data: Dict[str, Any],
        pack_info: OntologyPackInfo,
    ) -> None:
        """Merge a pack's data into the registry."""
        ab_data = pack_data.get("action_blocks", {})
        counts = {"poses": 0, "moods": 0, "locations": 0, "intimacy": 0, "ratings": 0, "branches": 0}

        # Merge poses
        poses_data = ab_data.get("poses", {})
        for cat in poses_data.get("categories", []):
            if cat not in self._pose_categories:
                self._pose_categories.append(cat)

        for pose_data in poses_data.get("definitions", []):
            pose = PoseDefinition(
                id=pose_data["id"],
                label=pose_data.get("label", ""),
                category=pose_data.get("category", ""),
                parent=pose_data.get("parent"),
                intimacy_min=pose_data.get("intimacy_min", 0),
                detector_labels=pose_data.get("detector_labels", []),
                tags=pose_data.get("tags", []),
                source=source,
            )
            self._poses[pose.id] = pose
            counts["poses"] += 1

            # Update indices
            cat = pose.category
            if cat not in self._poses_by_category:
                self._poses_by_category[cat] = []
            if pose.id not in self._poses_by_category[cat]:
                self._poses_by_category[cat].append(pose.id)

            for label in pose.detector_labels:
                self._detector_to_pose[label.lower()] = pose.id

        # Merge moods
        for mood_data in ab_data.get("moods", []):
            intensity_range = mood_data.get("intensity_range")
            mood = MoodDefinition(
                id=mood_data["id"],
                label=mood_data.get("label", ""),
                keywords=mood_data.get("keywords", []),
                intensity_range=tuple(intensity_range) if intensity_range else None,
                source=source,
            )
            self._moods[mood.id] = mood
            counts["moods"] += 1

        # Merge locations
        for loc_data in ab_data.get("locations", []):
            location = LocationDefinition(
                id=loc_data["id"],
                label=loc_data.get("label", ""),
                indoor=loc_data.get("indoor", True),
                romantic=loc_data.get("romantic", False),
                private=loc_data.get("private", False),
                keywords=loc_data.get("keywords", []),
                source=source,
            )
            self._locations[location.id] = location
            counts["locations"] += 1

        # Merge intimacy levels (unlikely from plugins, but supported)
        for level_data in ab_data.get("intimacy_levels", []):
            level = IntimacyLevel(
                id=level_data["id"],
                label=level_data.get("label", ""),
                level=level_data.get("level", 0),
                range=tuple(level_data.get("range", [0, 0])),
                source=source,
            )
            self._intimacy_levels[level.id] = level
            self._intimacy_by_level[level.level] = level.id
            counts["intimacy"] += 1

        # Merge ratings
        for rating_data in ab_data.get("content_ratings", []):
            rating = ContentRatingDef(
                id=rating_data["id"],
                label=rating_data.get("label", ""),
                level=rating_data.get("level", 0),
                description=rating_data.get("description", ""),
                requires_age_verification=rating_data.get("requires_age_verification", False),
                source=source,
            )
            self._ratings[rating.id] = rating
            self._rating_by_level[rating.level] = rating.id
            counts["ratings"] += 1

        # Merge branch intents
        for intent_data in ab_data.get("branch_intents", []):
            intent = BranchIntentDef(
                id=intent_data["id"],
                label=intent_data.get("label", ""),
                description=intent_data.get("description", ""),
                source=source,
            )
            self._branch_intents[intent.id] = intent
            counts["branches"] += 1

        # Store plugin scoring weights
        scoring_data = pack_data.get("scoring", {})
        if scoring_data and source != "core":
            self._plugin_scoring_weights[source] = scoring_data.get("weights", {})

        pack_info.concepts_added = counts

    # =========================================================================
    # Parsing helpers (called during initial load)
    # =========================================================================

    def _parse_poses(self) -> None:
        """Parse pose definitions from core and plugin data."""
        # Core poses
        ab_data = self._raw_core.get("action_blocks", {})
        poses_data = ab_data.get("poses", {})

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
                source="core",
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

        # Plugin poses
        for plugin_id, pack_data in self._raw_packs:
            pack_info = next((p for p in self._packs if p.plugin_id == plugin_id), None)
            if pack_info:
                self._merge_pack_data(plugin_id, pack_data, pack_info)

    def _parse_intimacy_levels(self) -> None:
        """Parse intimacy level definitions."""
        ab_data = self._raw_core.get("action_blocks", {})

        for level_data in ab_data.get("intimacy_levels", []):
            level = IntimacyLevel(
                id=level_data["id"],
                label=level_data.get("label", ""),
                level=level_data.get("level", 0),
                range=tuple(level_data.get("range", [0, 0])),
                source="core",
            )
            self._intimacy_levels[level.id] = level
            self._intimacy_by_level[level.level] = level.id

    def _parse_ratings(self) -> None:
        """Parse content rating definitions."""
        ab_data = self._raw_core.get("action_blocks", {})

        for rating_data in ab_data.get("content_ratings", []):
            rating = ContentRatingDef(
                id=rating_data["id"],
                label=rating_data.get("label", ""),
                level=rating_data.get("level", 0),
                description=rating_data.get("description", ""),
                requires_age_verification=rating_data.get("requires_age_verification", False),
                source="core",
            )
            self._ratings[rating.id] = rating
            self._rating_by_level[rating.level] = rating.id

    def _parse_moods(self) -> None:
        """Parse mood definitions."""
        ab_data = self._raw_core.get("action_blocks", {})

        for mood_data in ab_data.get("moods", []):
            intensity_range = mood_data.get("intensity_range")
            mood = MoodDefinition(
                id=mood_data["id"],
                label=mood_data.get("label", ""),
                keywords=mood_data.get("keywords", []),
                intensity_range=tuple(intensity_range) if intensity_range else None,
                source="core",
            )
            self._moods[mood.id] = mood

    def _parse_branch_intents(self) -> None:
        """Parse branch intent definitions."""
        ab_data = self._raw_core.get("action_blocks", {})

        for intent_data in ab_data.get("branch_intents", []):
            intent = BranchIntentDef(
                id=intent_data["id"],
                label=intent_data.get("label", ""),
                description=intent_data.get("description", ""),
                source="core",
            )
            self._branch_intents[intent.id] = intent

    def _parse_locations(self) -> None:
        """Parse location definitions."""
        ab_data = self._raw_core.get("action_blocks", {})

        for loc_data in ab_data.get("locations", []):
            location = LocationDefinition(
                id=loc_data["id"],
                label=loc_data.get("label", ""),
                indoor=loc_data.get("indoor", True),
                romantic=loc_data.get("romantic", False),
                private=loc_data.get("private", False),
                keywords=loc_data.get("keywords", []),
                source="core",
            )
            self._locations[location.id] = location

    def _parse_scoring(self) -> None:
        """Parse scoring configuration."""
        scoring_data = self._raw_core.get("scoring", {})

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

    # =========================================================================
    # Validation
    # =========================================================================

    def is_known_concept(self, kind: str, concept_id: str) -> bool:
        """
        Check if a concept ID is known for the given kind.

        Args:
            kind: Concept kind ('pose', 'mood', 'location', 'intimacy', 'rating', 'branch')
            concept_id: The ID to check (with or without kind prefix)

        Returns:
            True if the concept exists in the registry
        """
        self._ensure_loaded()

        canonical = self._canonicalize_id(concept_id, kind)

        if kind == "pose":
            return canonical in self._poses
        elif kind == "mood":
            return canonical in self._moods
        elif kind == "location":
            return canonical in self._locations
        elif kind == "intimacy":
            return canonical in self._intimacy_levels
        elif kind == "rating":
            return canonical in self._ratings
        elif kind == "branch":
            return canonical in self._branch_intents
        else:
            return False

    def validate_concept(self, kind: str, concept_id: str) -> None:
        """
        Validate that a concept ID exists.

        Args:
            kind: Concept kind
            concept_id: The ID to validate

        Raises:
            ValueError: If strict_mode is True and concept is unknown
        """
        if not self._strict_mode:
            return

        if not self.is_known_concept(kind, concept_id):
            raise ValueError(
                f"Unknown {kind} concept: '{concept_id}'. "
                f"Set strict_mode=False to allow unknown concepts."
            )

    def validate_concept_ref(self, kind: str, value: Any) -> None:
        """
        Validate a ConceptRef or canonical string.

        Args:
            kind: Expected concept kind
            value: ConceptRef, canonical string, or None

        Raises:
            ValueError: If strict_mode and concept is unknown
        """
        if value is None:
            return

        # Handle ConceptRef objects
        if hasattr(value, "id"):
            self.validate_concept(kind, value.id)
            return

        # Handle strings
        if isinstance(value, str):
            self.validate_concept(kind, value)

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

    def all_pose_ids(self) -> List[str]:
        """Get all pose IDs."""
        self._ensure_loaded()
        return list(self._poses.keys())

    def map_detector_to_pose(self, detector_label: str) -> Optional[str]:
        """Map a detector label to a pose ID."""
        self._ensure_loaded()
        return self._detector_to_pose.get(detector_label.lower())

    def are_poses_compatible(self, pose1: str, pose2: str) -> bool:
        """Check if two poses are compatible for chaining."""
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
        """Calculate similarity score between poses."""
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

    def get_plugin_scoring_weights(self, plugin_id: str) -> Dict[str, float]:
        """Get plugin-specific scoring weight overrides."""
        self._ensure_loaded()
        return self._plugin_scoring_weights.get(plugin_id, {})

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

    def canonicalize_branch_id(self, branch_id: str) -> str:
        """Ensure branch ID has 'branch:' prefix."""
        return self._canonicalize_id(branch_id, "branch")

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


# =============================================================================
# SINGLETON ACCESS
# =============================================================================

_registry_instance: Optional[OntologyRegistry] = None


def get_ontology_registry(
    reload: bool = False,
    strict_mode: Optional[bool] = None,
) -> OntologyRegistry:
    """
    Get the shared OntologyRegistry instance.

    Args:
        reload: Force reload from YAML files
        strict_mode: Override strict mode setting

    Returns:
        Shared OntologyRegistry instance
    """
    global _registry_instance

    if _registry_instance is None or reload:
        _registry_instance = OntologyRegistry(
            strict_mode=strict_mode if strict_mode is not None else True,
        ).load()
    elif strict_mode is not None:
        _registry_instance.strict_mode = strict_mode

    return _registry_instance


def reset_ontology_registry() -> None:
    """Reset the global registry instance. Useful for testing."""
    global _registry_instance
    _registry_instance = None


__all__ = [
    # Main class
    "OntologyRegistry",
    # Data classes
    "PoseDefinition",
    "IntimacyLevel",
    "ContentRatingDef",
    "MoodDefinition",
    "BranchIntentDef",
    "LocationDefinition",
    "ScoringConfig",
    "ScoringWeights",
    "PartialCredit",
    "ChainConstraints",
    "DurationConstraints",
    "OntologyPackInfo",
    # Singleton
    "get_ontology_registry",
    "reset_ontology_registry",
]
