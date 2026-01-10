"""
VocabularyRegistry - Central registry for all vocabularies.

Handles loading, plugin discovery, and query operations.
"""
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import yaml

from pixsim7.backend.main.shared.ontology.vocabularies.types import (
    SlotDef,
    RoleDef,
    PoseDef,
    MoodDef,
    RatingDef,
    LocationDef,
    PartDef,
    InfluenceRegionDef,
    SpatialDef,
    ProgressionDef,
    ScoringConfig,
    ScoringWeights,
    PartialCredit,
    ChainConstraints,
    DurationConstraints,
    VocabPackInfo,
)


class VocabularyRegistry:
    """
    Central registry for all vocabularies.

    Loads vocabulary items from YAML files and provides query methods.
    Supports plugin discovery for extensibility.
    """

    def __init__(self, vocab_dir: Optional[Path] = None, plugins_dir: Optional[Path] = None):
        """
        Initialize the vocabulary registry.

        Args:
            vocab_dir: Path to core vocabulary YAML files. Defaults to this package's directory.
            plugins_dir: Path to plugins directory. Defaults to backend/main/plugins.
        """
        if vocab_dir is None:
            vocab_dir = Path(__file__).parent
        if plugins_dir is None:
            plugins_dir = Path(__file__).parent.parent.parent / "plugins"

        self._vocab_dir = vocab_dir
        self._plugins_dir = plugins_dir

        # Storage for each vocab type
        self._vocabs: Dict[str, Dict[str, Any]] = {
            "slots": {},
            "roles": {},
            "poses": {},
            "moods": {},
            "ratings": {},
            "locations": {},
            "parts": {},
            "influence_regions": {},
            "spatial": {},
            "progression": {},
        }

        # Role-specific extras
        self._role_priority: List[str] = []
        self._role_slug_mappings: Dict[str, str] = {}
        self._role_namespace_mappings: Dict[str, str] = {}
        self._spatial_compatibility: Dict[str, List[List[str]]] = {}
        self._progression_tension: Dict[str, Any] = {}
        self._progression_constraints: Dict[str, Any] = {}

        # Scoring configuration
        self._scoring: ScoringConfig = ScoringConfig()

        # Pose indices for fast lookup
        self._poses_by_category: Dict[str, List[str]] = {}
        self._detector_to_pose: Dict[str, str] = {}

        # Plugin tracking
        self._packs: List[VocabPackInfo] = []
        self._loaded = False

    # =========================================================================
    # Loading
    # =========================================================================

    def _ensure_loaded(self) -> None:
        """Ensure vocabularies are loaded (lazy loading)."""
        if self._loaded:
            return

        # Import here to avoid circular imports
        from pixsim7.backend.main.shared.ontology.vocabularies.config import VOCAB_CONFIGS

        # Load core vocabularies
        counts = self._load_all_vocabs("core", self._vocab_dir, VOCAB_CONFIGS)

        # Load role-specific extras from core
        self._load_role_extras(self._vocab_dir, source="core")

        # Load scoring config from core
        self._load_scoring(self._vocab_dir)

        # Discover and load plugin vocabularies
        self._discover_plugins(VOCAB_CONFIGS)

        # Build pose indices
        self._build_pose_indices()

        self._loaded = True

    def _load_yaml(self, filename: str, directory: Path) -> Dict[str, Any]:
        """Load a YAML file, returning empty dict if not found."""
        filepath = directory / filename
        if not filepath.exists():
            return {}
        with open(filepath, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}

    def _load_all_vocabs(
        self,
        source: str,
        directory: Path,
        configs: Dict[str, Any],
    ) -> Dict[str, int]:
        """Load all vocab types from a directory."""
        counts = {}
        for vocab_name, config in configs.items():
            count = self._load_vocab_type(config, source, directory)
            counts[vocab_name] = count
        return counts

    def _load_vocab_type(self, config: Any, source: str, directory: Path) -> int:
        """Load a single vocab type from a directory."""
        data = self._load_yaml(config.yaml_file, directory)
        items = data.get(config.yaml_key, {})

        if not isinstance(items, dict):
            return 0

        store = self._vocabs[config.name]
        count = 0

        for item_id, item_data in items.items():
            if item_id in store:
                raise ValueError(
                    f"Duplicate {config.name} ID '{item_id}' from {source}"
                )
            store[item_id] = config.factory(item_id, item_data, source)
            count += 1

        return count

    def _load_role_extras(self, directory: Path, source: str) -> None:
        """Load role-specific extras (priority, mappings) from roles.yaml."""
        data = self._load_yaml("roles.yaml", directory)

        # Priority list
        priority = data.get("priority", [])
        if priority:
            self._role_priority = priority

        # Slug mappings
        slug_mappings = data.get("slug_mappings", {})
        if slug_mappings:
            self._role_slug_mappings.update(slug_mappings)

        # Namespace mappings
        namespace_mappings = data.get("namespace_mappings", {})
        if namespace_mappings:
            self._role_namespace_mappings.update(namespace_mappings)

    def _load_scoring(self, directory: Path) -> None:
        """Load scoring configuration from scoring.yaml."""
        data = self._load_yaml("scoring.yaml", directory)
        if not data:
            return

        weights_data = data.get("weights", {})
        partial_data = data.get("partial_credit", {})
        chain_data = data.get("chain", {})
        duration_data = data.get("duration", {})

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

    def _build_pose_indices(self) -> None:
        """Build pose category and detector label indices."""
        self._poses_by_category.clear()
        self._detector_to_pose.clear()

        for pose_id, pose in self._vocabs["poses"].items():
            # Category index
            cat = pose.category
            if cat:
                if cat not in self._poses_by_category:
                    self._poses_by_category[cat] = []
                self._poses_by_category[cat].append(pose_id)

            # Detector label index
            for label in pose.detector_labels:
                self._detector_to_pose[label.lower()] = pose_id

    # =========================================================================
    # Plugin Discovery
    # =========================================================================

    def _discover_plugins(self, configs: Dict[str, Any]) -> None:
        """Discover and load plugin vocabularies."""
        if not self._plugins_dir.exists():
            return

        for plugin_dir in self._plugins_dir.iterdir():
            if not plugin_dir.is_dir():
                continue

            vocab_dir = plugin_dir / "vocabularies"
            if vocab_dir.exists():
                self._load_plugin_vocabs(plugin_dir.name, vocab_dir, configs)

    def _load_plugin_vocabs(
        self,
        plugin_id: str,
        vocab_dir: Path,
        configs: Dict[str, Any],
    ) -> None:
        """Load all vocabulary files from a plugin's vocabularies folder."""
        source = f"plugin:{plugin_id}"

        try:
            counts = self._load_all_vocabs(source, vocab_dir, configs)

            # Load role extras from plugin
            self._load_role_extras(vocab_dir, source=source)

            # Load scoring config from plugin (overrides previous)
            self._load_scoring(vocab_dir)

            # Only register pack if something was loaded
            if sum(counts.values()) > 0:
                self._packs.append(VocabPackInfo(
                    id=f"plugin_{plugin_id}",
                    source_path=str(vocab_dir),
                    plugin_id=plugin_id,
                    label=f"Plugin: {plugin_id}",
                    concepts_added=counts,
                ))
        except ValueError as e:
            raise ValueError(f"Error loading plugin '{plugin_id}' vocabularies: {e}") from e

    # =========================================================================
    # Generic Accessors
    # =========================================================================

    def get(self, vocab_type: str, item_id: str) -> Optional[Any]:
        """Get an item by type and ID."""
        self._ensure_loaded()
        return self._vocabs.get(vocab_type, {}).get(item_id)

    def all_of(self, vocab_type: str) -> List[Any]:
        """Get all items of a vocab type."""
        self._ensure_loaded()
        return list(self._vocabs.get(vocab_type, {}).values())

    def ids_of(self, vocab_type: str) -> List[str]:
        """Get all IDs of a vocab type."""
        self._ensure_loaded()
        return list(self._vocabs.get(vocab_type, {}).keys())

    # =========================================================================
    # Typed Getters
    # =========================================================================

    def get_slot(self, slot_id: str) -> Optional[SlotDef]:
        return self.get("slots", slot_id)

    def get_role(self, role_id: str) -> Optional[RoleDef]:
        return self.get("roles", role_id)

    def get_pose(self, pose_id: str) -> Optional[PoseDef]:
        return self.get("poses", pose_id)

    def get_mood(self, mood_id: str) -> Optional[MoodDef]:
        return self.get("moods", mood_id)

    def get_rating(self, rating_id: str) -> Optional[RatingDef]:
        return self.get("ratings", rating_id)

    def get_location(self, location_id: str) -> Optional[LocationDef]:
        return self.get("locations", location_id)

    def get_part(self, part_id: str) -> Optional[PartDef]:
        return self.get("parts", part_id)

    def get_influence_region(self, region_id: str) -> Optional[InfluenceRegionDef]:
        return self.get("influence_regions", region_id)

    def get_spatial(self, spatial_id: str) -> Optional[SpatialDef]:
        return self.get("spatial", spatial_id)

    def get_progression(self, progression_id: str) -> Optional[ProgressionDef]:
        return self.get("progression", progression_id)

    # =========================================================================
    # Typed List Getters
    # =========================================================================

    def all_slots(self) -> List[SlotDef]:
        return self.all_of("slots")

    def all_roles(self) -> List[RoleDef]:
        return self.all_of("roles")

    def all_poses(self) -> List[PoseDef]:
        return self.all_of("poses")

    def all_moods(self) -> List[MoodDef]:
        return self.all_of("moods")

    def all_ratings(self) -> List[RatingDef]:
        return self.all_of("ratings")

    def all_locations(self) -> List[LocationDef]:
        return self.all_of("locations")

    def all_parts(self) -> List[PartDef]:
        return self.all_of("parts")

    def all_influence_regions(self) -> List[InfluenceRegionDef]:
        return self.all_of("influence_regions")

    def all_spatial(self) -> List[SpatialDef]:
        return self.all_of("spatial")

    def all_progression(self) -> List[ProgressionDef]:
        return self.all_of("progression")

    # =========================================================================
    # Properties
    # =========================================================================

    @property
    def role_priority(self) -> List[str]:
        self._ensure_loaded()
        return self._role_priority

    @property
    def role_slug_mappings(self) -> Dict[str, str]:
        self._ensure_loaded()
        return self._role_slug_mappings

    @property
    def role_namespace_mappings(self) -> Dict[str, str]:
        self._ensure_loaded()
        return self._role_namespace_mappings

    @property
    def scoring(self) -> ScoringConfig:
        self._ensure_loaded()
        return self._scoring

    @property
    def weights(self) -> ScoringWeights:
        return self.scoring.weights

    @property
    def partial_credit(self) -> PartialCredit:
        return self.scoring.partial_credit

    @property
    def chain_constraints(self) -> ChainConstraints:
        return self.scoring.chain

    @property
    def duration_constraints(self) -> DurationConstraints:
        return self.scoring.duration

    @property
    def packs(self) -> List[VocabPackInfo]:
        self._ensure_loaded()
        return self._packs

    # =========================================================================
    # Pose Helpers
    # =========================================================================

    def all_pose_ids(self) -> List[str]:
        """Get all pose IDs."""
        return self.ids_of("poses")

    def poses_in_category(self, category: str) -> List[str]:
        """Get all pose IDs in a category."""
        self._ensure_loaded()
        return self._poses_by_category.get(category, [])

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
        if p1.parent == pose2 or p2.parent == pose1:
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

        # Parent-child
        if p1.parent == pose2 or p2.parent == pose1:
            return self._scoring.partial_credit.parent_pose

        # Same category
        if p1.category == p2.category:
            return self._scoring.partial_credit.same_category

        return 0.0

    # =========================================================================
    # Rating Helpers
    # =========================================================================

    def get_rating_level(self, rating_id: str) -> int:
        """Get numeric level for a rating (0-3)."""
        rating = self.get_rating(rating_id)
        return rating.level if rating else 0

    def is_rating_allowed(self, block_rating: str, max_rating: str) -> bool:
        """Check if a block's rating is within the allowed max."""
        return self.get_rating_level(block_rating) <= self.get_rating_level(max_rating)

    # =========================================================================
    # Intimacy Helpers
    # =========================================================================

    def get_intimacy_level(self, level_id: str) -> Optional[ProgressionDef]:
        """Get an intimacy level by ID."""
        prog = self.get_progression(level_id)
        if prog and prog.kind == "intimacy_level":
            return prog
        return None

    def get_intimacy_order(self, level_id: str) -> int:
        """Get numeric order for an intimacy level (0-5)."""
        level = self.get_intimacy_level(level_id)
        if level:
            return level.data.get("level", 0)
        return 0

    def intimacy_distance(self, level1: str, level2: str) -> int:
        """Get distance between two intimacy levels."""
        return abs(self.get_intimacy_order(level1) - self.get_intimacy_order(level2))

    def are_intimacy_adjacent(self, level1: str, level2: str) -> bool:
        """Check if two intimacy levels are adjacent."""
        return self.intimacy_distance(level1, level2) <= 1

    # =========================================================================
    # Slot Operations
    # =========================================================================

    def expand_slot_provides(self, slot_ids: List[str]) -> Set[str]:
        """
        Expand slot IDs to include parents and implied slots.

        Example: ["slot:kiss_initiator"]
            -> {"slot:kiss_initiator", "slot:initiator", "slot:facing_partner", ...}
        """
        self._ensure_loaded()
        result: Set[str] = set()
        to_process = list(slot_ids)

        while to_process:
            slot_id = to_process.pop()
            if slot_id in result:
                continue
            result.add(slot_id)

            slot = self.get_slot(slot_id)
            if slot:
                if slot.parent and slot.parent not in result:
                    to_process.append(slot.parent)
                for implied in slot.implies:
                    if implied not in result:
                        to_process.append(implied)

        return result

    def slot_satisfies(self, provided: str, required: str) -> bool:
        """Check if a provided slot satisfies a required slot."""
        self._ensure_loaded()
        if provided == required:
            return True

        current = provided
        while current:
            slot = self.get_slot(current)
            if not slot or not slot.parent:
                break
            if slot.parent == required:
                return True
            current = slot.parent

        return False

    def check_slot_compatibility(
        self,
        provides_a: List[str],
        requires_a: List[str],
        provides_b: List[str],
        requires_b: List[str],
    ) -> bool:
        """Check if two entities with given slots are compatible."""
        self._ensure_loaded()

        expanded_a = self.expand_slot_provides(provides_a)
        expanded_b = self.expand_slot_provides(provides_b)

        for req in requires_b:
            if not any(self.slot_satisfies(prov, req) for prov in expanded_a):
                return False

        for req in requires_a:
            if not any(self.slot_satisfies(prov, req) for prov in expanded_b):
                return False

        return True

    def check_pose_compatibility(self, pose_a_id: str, pose_b_id: str) -> bool:
        """Check if two poses are compatible for composition."""
        pose_a = self.get_pose(pose_a_id)
        pose_b = self.get_pose(pose_b_id)

        if not pose_a or not pose_b:
            return False

        return self.check_slot_compatibility(
            pose_a.slots.provides,
            pose_a.slots.requires,
            pose_b.slots.provides,
            pose_b.slots.requires,
        )

    # =========================================================================
    # Role Resolution
    # =========================================================================

    def resolve_role_from_tag(self, tag: str) -> Optional[str]:
        """Resolve a tag to a role ID using slug or namespace mappings."""
        self._ensure_loaded()
        normalized = tag.lower().strip()

        if normalized in self._role_slug_mappings:
            return self._role_slug_mappings[normalized]

        if ":" in normalized:
            namespace = normalized.split(":")[0]
            if namespace in self._role_namespace_mappings:
                return self._role_namespace_mappings[namespace]

        return None

    def resolve_role_from_alias(self, alias: str) -> Optional[str]:
        """Resolve an alias to a role ID."""
        self._ensure_loaded()
        normalized = alias.lower().strip()

        for role in self.all_roles():
            if normalized in role.aliases:
                return role.id

        return None

    # =========================================================================
    # Keyword Matching (dynamic, config-driven)
    # =========================================================================

    def match_keywords(self, text: str) -> List[str]:
        """
        Match keywords in text to vocabulary IDs.

        Uses keywords_attr from VocabTypeConfig to dynamically check
        each vocab type that supports keyword matching.

        Args:
            text: Text to match (case-insensitive)

        Returns:
            List of vocab IDs (e.g., ["pose:standing_neutral", "mood:playful"])
        """
        self._ensure_loaded()

        # Import here to avoid circular imports
        from pixsim7.backend.main.shared.ontology.vocabularies.config import VOCAB_CONFIGS

        text_lower = text.lower()
        matched_ids: List[str] = []

        for config in VOCAB_CONFIGS.values():
            if not config.keywords_attr:
                continue

            for item in self.all_of(config.name):
                keywords = getattr(item, config.keywords_attr, [])
                if not keywords:
                    continue

                for keyword in keywords:
                    if keyword.lower() in text_lower:
                        if item.id not in matched_ids:
                            matched_ids.append(item.id)
                        break

        return matched_ids


# =============================================================================
# Module-level singleton
# =============================================================================

_registry: Optional[VocabularyRegistry] = None


def get_registry() -> VocabularyRegistry:
    """Get the singleton vocabulary registry."""
    global _registry
    if _registry is None:
        _registry = VocabularyRegistry()
    return _registry


def reset_registry() -> None:
    """Reset the registry (for testing)."""
    global _registry
    _registry = None


__all__ = [
    "VocabularyRegistry",
    "get_registry",
    "reset_registry",
]
