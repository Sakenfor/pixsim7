"""
Unified Vocabulary System

Loads and provides access to all vocabulary files (slots, roles, poses, moods, etc.).
Everything speaks the same languages: slots (provides/requires), tension, mood, rating.

Plugin Support:
    Plugins can extend vocabularies by placing YAML files in:
        plugins/<plugin_id>/vocabularies/<vocab_name>.yaml

    Plugin vocabs are merged with core vocabs. Conflicts (same ID) raise errors.

Usage:
    from pixsim7.backend.main.shared.ontology.vocabularies import get_vocab, get_slot, get_pose

    # Get a slot definition
    slot = get_slot("slot:kiss_initiator")

    # Get a pose with all its cross-cutting properties
    pose = get_pose("pose:kissing")
    print(pose.slots.provides)  # ['slot:kiss_initiator', 'slot:intimate_contact']
    print(pose.tension)  # 7
    print(pose.mood)  # ['romantic', 'passionate']
    print(pose.source)  # 'core' or 'plugin:vampire_pack'

    # Check if two poses are compatible
    compatible = check_compatibility(pose_a, pose_b)

    # Runtime plugin registration
    registry = get_registry()
    registry.register_plugin("my_plugin", {
        "poses": {
            "pose:custom_pose": {"label": "Custom", ...}
        }
    })
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Generic, List, Optional, Set, Type, TypeVar
import glob as glob_module
import yaml


# =============================================================================
# Data Classes
# =============================================================================

T = TypeVar("T")


@dataclass
class SlotBinding:
    """Slots provided/required by an entity."""
    provides: List[str] = field(default_factory=list)
    requires: List[str] = field(default_factory=list)


@dataclass
class Progression:
    """Progression rules for an entity."""
    from_: List[str] = field(default_factory=list)
    to: List[str] = field(default_factory=list)


@dataclass
class SlotDef:
    """A slot definition from slots.yaml."""
    id: str
    label: str
    category: str = ""
    description: str = ""
    abstract: bool = False
    parent: Optional[str] = None
    inverse: Optional[str] = None
    implies: List[str] = field(default_factory=list)
    incompatible: List[str] = field(default_factory=list)
    tension_modifier: int = 0
    source: str = "core"


@dataclass
class RoleDef:
    """A composition role definition."""
    id: str
    label: str
    description: str = ""
    color: str = "gray"
    default_layer: int = 0
    slots: SlotBinding = field(default_factory=SlotBinding)
    tags: List[str] = field(default_factory=list)
    aliases: List[str] = field(default_factory=list)
    source: str = "core"


@dataclass
class PoseDef:
    """A pose definition with all cross-cutting properties."""
    id: str
    label: str
    category: str = ""
    tension: int = 0
    parent: Optional[str] = None
    slots: SlotBinding = field(default_factory=SlotBinding)
    mood: List[str] = field(default_factory=list)
    rating: Optional[str] = None
    progression: Progression = field(default_factory=Progression)
    detector_labels: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    special: Optional[str] = None
    source: str = "core"


@dataclass
class MoodDef:
    """A mood definition."""
    id: str
    label: str
    category: str = ""
    tension_range: tuple = (0, 10)
    parent: Optional[str] = None
    keywords: List[str] = field(default_factory=list)
    compatible_ratings: List[str] = field(default_factory=list)
    source: str = "core"


@dataclass
class RatingDef:
    """A content rating definition."""
    id: str
    label: str
    level: int = 0
    description: str = ""
    keywords: List[str] = field(default_factory=list)
    min_intimacy: int = 0
    requires_age_verification: bool = False
    source: str = "core"


@dataclass
class LocationDef:
    """A location definition for scene context."""
    id: str
    label: str
    category: str = ""
    indoor: bool = True
    private: bool = False
    romantic: bool = False
    keywords: List[str] = field(default_factory=list)
    source: str = "core"


@dataclass
class PartDef:
    """An anatomy part definition (body parts and regions)."""
    id: str
    label: str
    category: str = ""
    keywords: List[str] = field(default_factory=list)
    source: str = "core"


@dataclass
class InfluenceRegionDef:
    """An influence region definition (areas for applying effects)."""
    id: str
    label: str
    description: str = ""
    color: str = "gray"
    source: str = "core"


@dataclass
class SpatialDef:
    """A spatial definition (camera, framing, orientation, depth)."""
    id: str
    label: str
    category: str = ""
    keywords: List[str] = field(default_factory=list)
    source: str = "core"


@dataclass
class ProgressionDef:
    """A progression definition (tension label, intimacy level, path, branch intent)."""
    id: str
    label: str
    kind: str
    data: Dict[str, Any] = field(default_factory=dict)
    source: str = "core"


@dataclass
class ScoringWeights:
    """Scoring weights for action block selection."""
    chain_compatibility: float = 0.30
    location_match: float = 0.20
    pose_match: float = 0.15
    intimacy_match: float = 0.15
    mood_match: float = 0.10
    branch_intent: float = 0.10


@dataclass
class PartialCredit:
    """Partial credit rules for scoring."""
    generic_block: float = 0.5
    parent_pose: float = 0.8
    same_category: float = 0.6
    adjacent_intimacy: float = 0.7


@dataclass
class ChainConstraints:
    """Chain building constraints."""
    max_blocks: int = 3
    min_remaining_budget: float = 3.0


@dataclass
class DurationConstraints:
    """Duration constraints for blocks."""
    min_block: float = 3.0
    max_block: float = 12.0
    default_single: float = 6.0
    default_transition: float = 7.0


@dataclass
class ScoringConfig:
    """Complete scoring configuration."""
    weights: ScoringWeights = field(default_factory=ScoringWeights)
    partial_credit: PartialCredit = field(default_factory=PartialCredit)
    chain: ChainConstraints = field(default_factory=ChainConstraints)
    duration: DurationConstraints = field(default_factory=DurationConstraints)


@dataclass
class VocabPackInfo:
    """Metadata about a loaded vocabulary pack."""
    id: str
    source_path: Optional[str]
    plugin_id: Optional[str]
    version: Optional[str] = None
    label: str = ""
    concepts_added: Dict[str, int] = field(default_factory=dict)


# =============================================================================
# Factory Functions - Convert dict data to dataclasses
# =============================================================================


def _make_slot(id: str, data: Dict[str, Any], source: str) -> SlotDef:
    return SlotDef(
        id=id,
        label=data.get("label", ""),
        category=data.get("category", ""),
        description=data.get("description", ""),
        abstract=data.get("abstract", False),
        parent=data.get("parent"),
        inverse=data.get("inverse"),
        implies=data.get("implies", []),
        incompatible=data.get("incompatible", []),
        tension_modifier=data.get("tension_modifier", 0),
        source=source,
    )


def _make_role(id: str, data: Dict[str, Any], source: str) -> RoleDef:
    slots_data = data.get("slots", {})
    return RoleDef(
        id=id,
        label=data.get("label", ""),
        description=data.get("description", ""),
        color=data.get("color", "gray"),
        default_layer=data.get("default_layer", 0),
        slots=SlotBinding(
            provides=slots_data.get("provides", []),
            requires=slots_data.get("requires", []),
        ),
        tags=data.get("tags", []),
        aliases=data.get("aliases", []),
        source=source,
    )


def _make_pose(id: str, data: Dict[str, Any], source: str) -> PoseDef:
    slots_data = data.get("slots", {})
    prog_data = data.get("progression", {})
    return PoseDef(
        id=id,
        label=data.get("label", ""),
        category=data.get("category", ""),
        tension=data.get("tension", 0),
        parent=data.get("parent"),
        slots=SlotBinding(
            provides=slots_data.get("provides", []),
            requires=slots_data.get("requires", []),
        ),
        mood=data.get("mood", []),
        rating=data.get("rating"),
        progression=Progression(
            from_=prog_data.get("from", []),
            to=prog_data.get("to", []),
        ),
        detector_labels=data.get("detector_labels", []),
        tags=data.get("tags", []),
        special=data.get("special"),
        source=source,
    )


def _make_mood(id: str, data: Dict[str, Any], source: str) -> MoodDef:
    tension_range = data.get("tension_range", [0, 10])
    return MoodDef(
        id=id,
        label=data.get("label", ""),
        category=data.get("category", ""),
        tension_range=tuple(tension_range),
        parent=data.get("parent"),
        keywords=data.get("keywords", []),
        compatible_ratings=data.get("compatible_ratings", []),
        source=source,
    )


def _make_rating(id: str, data: Dict[str, Any], source: str) -> RatingDef:
    return RatingDef(
        id=id,
        label=data.get("label", ""),
        level=data.get("level", 0),
        description=data.get("description", ""),
        keywords=data.get("keywords", []),
        min_intimacy=data.get("min_intimacy", 0),
        requires_age_verification=data.get("requires_age_verification", False),
        source=source,
    )


def _make_location(id: str, data: Dict[str, Any], source: str) -> LocationDef:
    return LocationDef(
        id=id,
        label=data.get("label", ""),
        category=data.get("category", ""),
        indoor=data.get("indoor", True),
        private=data.get("private", False),
        romantic=data.get("romantic", False),
        keywords=data.get("keywords", []),
        source=source,
    )


def _make_part(id: str, data: Dict[str, Any], source: str) -> PartDef:
    return PartDef(
        id=id,
        label=data.get("label", ""),
        category=data.get("category", ""),
        keywords=data.get("keywords", []),
        source=source,
    )


def _make_influence_region(id: str, data: Dict[str, Any], source: str) -> InfluenceRegionDef:
    return InfluenceRegionDef(
        id=id,
        label=data.get("label", ""),
        description=data.get("description", ""),
        color=data.get("color", "gray"),
        source=source,
    )


def _make_spatial(id: str, data: Dict[str, Any], source: str) -> SpatialDef:
    return SpatialDef(
        id=id,
        label=data.get("label", ""),
        category=data.get("category", ""),
        keywords=data.get("keywords", []),
        source=source,
    )


def _make_progression(id: str, data: Dict[str, Any], source: str) -> ProgressionDef:
    return ProgressionDef(
        id=id,
        label=data.get("label", ""),
        kind=data.get("kind", ""),
        data=data.get("data", {}) or {},
        source=source,
    )


# =============================================================================
# Vocab Type Configuration
# =============================================================================


@dataclass
class VocabTypeConfig(Generic[T]):
    """Configuration for a vocabulary type."""
    name: str                          # e.g., "slots"
    yaml_file: str                     # e.g., "slots.yaml"
    yaml_key: str                      # e.g., "slots" (key in YAML)
    factory: Callable[[str, Dict[str, Any], str], T]  # Creates dataclass from dict


# All vocab types with their configs
VOCAB_CONFIGS: Dict[str, VocabTypeConfig] = {
    "slots": VocabTypeConfig("slots", "slots.yaml", "slots", _make_slot),
    "roles": VocabTypeConfig("roles", "roles.yaml", "roles", _make_role),
    "poses": VocabTypeConfig("poses", "poses.yaml", "poses", _make_pose),
    "moods": VocabTypeConfig("moods", "moods.yaml", "moods", _make_mood),
    "ratings": VocabTypeConfig("ratings", "ratings.yaml", "ratings", _make_rating),
    "locations": VocabTypeConfig("locations", "locations.yaml", "locations", _make_location),
    "parts": VocabTypeConfig("parts", "anatomy.yaml", "parts", _make_part),
    "influence_regions": VocabTypeConfig("influence_regions", "influence_regions.yaml", "regions", _make_influence_region),
    "spatial": VocabTypeConfig("spatial", "spatial.yaml", "spatial", _make_spatial),
    "progression": VocabTypeConfig("progression", "progression.yaml", "progression", _make_progression),
}


# =============================================================================
# Vocabulary Registry
# =============================================================================


class VocabularyRegistry:
    """
    Central registry for all vocabularies.

    Loads YAML files from the vocabularies folder and provides:
    - Lookup by ID (prefixed: "slot:kiss_initiator", "pose:kissing")
    - Hierarchy resolution (child satisfies parent)
    - Implication expansion (slot:kiss_initiator implies slot:facing_partner)
    - Compatibility checking
    - Plugin vocabulary discovery and registration
    """

    def __init__(
        self,
        vocab_dir: Optional[Path] = None,
        plugins_dir: Optional[Path] = None,
    ):
        self._vocab_dir = vocab_dir or Path(__file__).parent
        self._plugins_dir = plugins_dir or Path(__file__).parent.parent.parent.parent / "plugins"

        # Generic storage: vocab_name -> {id -> dataclass}
        self._vocabs: Dict[str, Dict[str, Any]] = {name: {} for name in VOCAB_CONFIGS}

        # Role-specific extras (loaded from first/last vocab pack that provides them)
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

    def _ensure_loaded(self) -> None:
        """Load all vocabularies if not already loaded."""
        if self._loaded:
            return

        # Load core vocabularies
        counts = self._load_all_vocabs("core", self._vocab_dir)

        # Load role-specific extras from core (if present)
        self._load_role_extras(self._vocab_dir, source="core")

        # Load scoring config from core (if present)
        self._load_scoring(self._vocab_dir)

        # Register core pack
        self._packs.append(VocabPackInfo(
            id="core",
            source_path=str(self._vocab_dir),
            plugin_id=None,
            label="Core Vocabularies",
            concepts_added=counts,
        ))

        # Discover and load plugin vocabularies
        self._discover_plugins()

        # Build pose indices after all loading is complete
        self._build_pose_indices()

        self._loaded = True

    def _load_yaml(self, filename: str, directory: Path) -> Dict[str, Any]:
        """Load a YAML file from the specified directory."""
        path = directory / filename
        if not path.exists():
            return {}
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}

    def _load_all_vocabs(self, source: str, directory: Path) -> Dict[str, int]:
        """Load all vocab types from a directory. Returns counts."""
        counts: Dict[str, int] = {}
        for name, config in VOCAB_CONFIGS.items():
            counts[name] = self._load_vocab_type(config, source, directory)
        return counts

    def _load_vocab_type(
        self,
        config: VocabTypeConfig,
        source: str,
        directory: Path,
    ) -> int:
        """Load a single vocab type. Returns count of items loaded."""
        data = self._load_yaml(config.yaml_file, directory)
        if config.name == "spatial":
            self._apply_spatial_compatibility(data)
            items: Dict[str, Any] = {}
            for key in ("camera_views", "camera_framing", "body_orientation", "depth"):
                group = data.get(key, {})
                if not isinstance(group, dict):
                    continue
                for item_id, item_data in group.items():
                    items[item_id] = item_data
        elif config.name == "progression":
            self._apply_progression_meta(data)
            items = self._build_progression_items(data)
        else:
            items = data.get(config.yaml_key, {})
        if config.name == "roles":
            self._apply_role_extras(data, source)
        store = self._vocabs[config.name]
        count = 0

        for item_id, item_data in items.items():
            if item_id in store:
                existing = store[item_id]
                raise ValueError(
                    f"Duplicate {config.name} ID '{item_id}': already defined by "
                    f"{existing.source}, cannot add from {source}"
                )
            store[item_id] = config.factory(item_id, item_data, source)
            count += 1

        return count

    def _apply_spatial_compatibility(self, data: Dict[str, Any]) -> None:
        """Merge spatial compatibility rules if present."""
        compatibility = data.get("compatibility")
        if not isinstance(compatibility, dict):
            return
        for key, pairs in compatibility.items():
            if not isinstance(pairs, list):
                continue
            merged = self._spatial_compatibility.setdefault(key, [])
            merged.extend(pairs)

    def _apply_progression_meta(self, data: Dict[str, Any]) -> None:
        """Store progression meta fields (tension scale, constraints) if present."""
        tension = data.get("tension")
        if isinstance(tension, dict) and tension:
            self._progression_tension = tension
        constraints = data.get("constraints")
        if isinstance(constraints, dict) and constraints:
            self._progression_constraints = constraints

    def _build_progression_items(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize progression vocab sections into item dictionaries."""
        items: Dict[str, Any] = {}

        tension = data.get("tension", {})
        labels = tension.get("labels", []) if isinstance(tension, dict) else []
        if isinstance(labels, list):
            for label_data in labels:
                if not isinstance(label_data, dict):
                    continue
                label_id = label_data.get("id")
                if not label_id:
                    continue
                items[label_id] = {
                    "label": label_data.get("label", ""),
                    "kind": "tension_label",
                    "data": {"range": label_data.get("range", [])},
                }

        intimacy_levels = data.get("intimacy_levels", [])
        if isinstance(intimacy_levels, list):
            for level_data in intimacy_levels:
                if not isinstance(level_data, dict):
                    continue
                level_id = level_data.get("id")
                if not level_id:
                    continue
                items[level_id] = {
                    "label": level_data.get("label", ""),
                    "kind": "intimacy_level",
                    "data": {
                        "level": level_data.get("level", 0),
                        "tension_range": level_data.get("tension_range", []),
                    },
                }

        paths = data.get("paths", {})
        if isinstance(paths, dict):
            for path_id, path_data in paths.items():
                if not isinstance(path_data, dict):
                    continue
                items[path_id] = {
                    "label": path_data.get("label", ""),
                    "kind": "path",
                    "data": {
                        "description": path_data.get("description", ""),
                        "stages": path_data.get("stages", []),
                    },
                }

        branch_intents = data.get("branch_intents", [])
        if isinstance(branch_intents, list):
            for intent_data in branch_intents:
                if not isinstance(intent_data, dict):
                    continue
                intent_id = intent_data.get("id")
                if not intent_id:
                    continue
                items[intent_id] = {
                    "label": intent_data.get("label", ""),
                    "kind": "branch_intent",
                    "data": {
                        "description": intent_data.get("description", ""),
                        "tension_delta": intent_data.get("tension_delta", []),
                    },
                }

        return items

    def _apply_role_extras(self, data: Dict[str, Any], source: str) -> None:
        """Apply role-specific extras if present (priority, mappings)."""
        if not data:
            return
        if "priority" in data:
            self._role_priority = data.get("priority") or []
        if "slug_mappings" in data:
            self._role_slug_mappings = data.get("slug_mappings") or {}
        if "namespace_mappings" in data:
            self._role_namespace_mappings = data.get("namespace_mappings") or {}

    def _load_role_extras(self, directory: Path, source: str) -> None:
        """Load role-specific extras from a directory if present."""
        data = self._load_yaml("roles.yaml", directory)
        self._apply_role_extras(data, source)

    def _load_scoring(self, directory: Path) -> None:
        """Load scoring configuration from a directory."""
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

    def _discover_plugins(self) -> None:
        """Discover and load vocabulary files from plugins directory."""
        if not self._plugins_dir.exists():
            return

        pattern = str(self._plugins_dir / "*" / "vocabularies")
        vocab_dirs = sorted(glob_module.glob(pattern))

        for vocab_dir_str in vocab_dirs:
            vocab_dir = Path(vocab_dir_str)
            if vocab_dir.is_dir():
                plugin_id = vocab_dir.parent.name
                self._load_plugin_vocabs(plugin_id, vocab_dir)

    def _load_plugin_vocabs(self, plugin_id: str, vocab_dir: Path) -> None:
        """Load all vocabulary files from a plugin's vocabularies folder."""
        source = f"plugin:{plugin_id}"

        try:
            counts = self._load_all_vocabs(source, vocab_dir)

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

    def register_plugin(
        self,
        plugin_id: str,
        vocab_data: Dict[str, Dict[str, Any]],
    ) -> VocabPackInfo:
        """
        Register vocabulary data programmatically (runtime registration).

        Args:
            plugin_id: Unique plugin identifier
            vocab_data: Dict with keys like 'slots', 'poses', etc.
                       Each maps item_id -> item_data.

        Returns:
            VocabPackInfo with counts of added concepts.

        Raises:
            ValueError: If any concept ID conflicts with existing ones.
        """
        self._ensure_loaded()
        source = f"plugin:{plugin_id}"
        counts: Dict[str, int] = {}

        for vocab_name, items in vocab_data.items():
            if vocab_name not in VOCAB_CONFIGS:
                continue
            config = VOCAB_CONFIGS[vocab_name]
            store = self._vocabs[vocab_name]

            for item_id, item_data in items.items():
                if item_id in store:
                    raise ValueError(
                        f"Duplicate {vocab_name} ID '{item_id}': already defined by "
                        f"{store[item_id].source}"
                    )
                store[item_id] = config.factory(item_id, item_data, source)

            counts[vocab_name] = len(items)

        pack_info = VocabPackInfo(
            id=f"runtime_{plugin_id}",
            source_path=None,
            plugin_id=plugin_id,
            label=f"Runtime: {plugin_id}",
            concepts_added=counts,
        )
        self._packs.append(pack_info)

        return pack_info

    @property
    def loaded_packs(self) -> List[VocabPackInfo]:
        """Get list of loaded vocabulary packs."""
        self._ensure_loaded()
        return self._packs.copy()

    # =========================================================================
    # Public API - Generic Getters
    # =========================================================================

    def get(self, vocab_name: str, item_id: str) -> Optional[Any]:
        """Get any vocab item by type and ID."""
        self._ensure_loaded()
        return self._vocabs.get(vocab_name, {}).get(item_id)

    def all_of(self, vocab_name: str) -> List[Any]:
        """Get all items of a vocab type."""
        self._ensure_loaded()
        return list(self._vocabs.get(vocab_name, {}).values())

    # =========================================================================
    # Public API - Typed Getters (convenience)
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

    @property
    def role_priority(self) -> List[str]:
        self._ensure_loaded()
        return self._role_priority

    @property
    def spatial_compatibility(self) -> Dict[str, List[List[str]]]:
        self._ensure_loaded()
        return self._spatial_compatibility

    @property
    def progression_tension(self) -> Dict[str, Any]:
        self._ensure_loaded()
        return self._progression_tension

    @property
    def progression_constraints(self) -> Dict[str, Any]:
        self._ensure_loaded()
        return self._progression_constraints

    # =========================================================================
    # Public API - Scoring Config
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
    # Public API - Pose Helpers
    # =========================================================================

    def all_pose_ids(self) -> List[str]:
        """Get all pose IDs."""
        self._ensure_loaded()
        return list(self._vocabs["poses"].keys())

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
    # Public API - Rating Helpers
    # =========================================================================

    def get_rating_level(self, rating_id: str) -> int:
        """Get numeric level for a rating (0-3)."""
        rating = self.get_rating(rating_id)
        return rating.level if rating else 0

    def is_rating_allowed(self, block_rating: str, max_rating: str) -> bool:
        """Check if a block's rating is within the allowed max."""
        return self.get_rating_level(block_rating) <= self.get_rating_level(max_rating)

    # =========================================================================
    # Public API - Intimacy Helpers
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
    # Public API - Hierarchy & Implication
    # =========================================================================

    def expand_slot_provides(self, slot_ids: List[str]) -> Set[str]:
        """
        Expand a list of slot IDs to include all implied and parent slots.

        Example:
            expand_slot_provides(["slot:kiss_initiator"])
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
        """
        Check if a provided slot satisfies a required slot.

        Returns True if they're the same or provided is a child of required.
        """
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
        """
        Check if two entities with given slots are compatible.

        Compatible if A's provides satisfy B's requires and vice versa.
        """
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
    # Public API - Role Resolution
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


# Convenience functions
def get_slot(slot_id: str) -> Optional[SlotDef]:
    return get_registry().get_slot(slot_id)


def get_role(role_id: str) -> Optional[RoleDef]:
    return get_registry().get_role(role_id)


def get_pose(pose_id: str) -> Optional[PoseDef]:
    return get_registry().get_pose(pose_id)


def get_mood(mood_id: str) -> Optional[MoodDef]:
    return get_registry().get_mood(mood_id)


def get_rating(rating_id: str) -> Optional[RatingDef]:
    return get_registry().get_rating(rating_id)


def get_location(location_id: str) -> Optional[LocationDef]:
    return get_registry().get_location(location_id)


def get_part(part_id: str) -> Optional[PartDef]:
    return get_registry().get_part(part_id)


def get_influence_region(region_id: str) -> Optional[InfluenceRegionDef]:
    return get_registry().get_influence_region(region_id)


def get_spatial(spatial_id: str) -> Optional[SpatialDef]:
    return get_registry().get_spatial(spatial_id)


def get_progression(progression_id: str) -> Optional[ProgressionDef]:
    return get_registry().get_progression(progression_id)


def check_pose_compatibility(pose_a_id: str, pose_b_id: str) -> bool:
    return get_registry().check_pose_compatibility(pose_a_id, pose_b_id)


__all__ = [
    # Data classes
    "SlotDef",
    "SlotBinding",
    "RoleDef",
    "PoseDef",
    "MoodDef",
    "RatingDef",
    "LocationDef",
    "PartDef",
    "InfluenceRegionDef",
    "SpatialDef",
    "ProgressionDef",
    "Progression",
    "VocabPackInfo",
    # Scoring config
    "ScoringConfig",
    "ScoringWeights",
    "PartialCredit",
    "ChainConstraints",
    "DurationConstraints",
    # Config
    "VocabTypeConfig",
    "VOCAB_CONFIGS",
    # Registry
    "VocabularyRegistry",
    "get_registry",
    "reset_registry",
    # Convenience functions
    "get_slot",
    "get_role",
    "get_pose",
    "get_mood",
    "get_rating",
    "get_location",
    "get_part",
    "get_influence_region",
    "get_spatial",
    "get_progression",
    "check_pose_compatibility",
]
