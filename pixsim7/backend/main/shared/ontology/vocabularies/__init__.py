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

        # Role-specific extras (only from core)
        self._role_priority: List[str] = []
        self._role_slug_mappings: Dict[str, str] = {}
        self._role_namespace_mappings: Dict[str, str] = {}

        # Plugin tracking
        self._packs: List[VocabPackInfo] = []
        self._loaded = False

    def _ensure_loaded(self) -> None:
        """Load all vocabularies if not already loaded."""
        if self._loaded:
            return

        # Load core vocabularies
        counts = self._load_all_vocabs("core", self._vocab_dir)

        # Load role-specific extras from core
        self._load_role_extras(self._vocab_dir)

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
        items = data.get(config.yaml_key, {})
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

    def _load_role_extras(self, directory: Path) -> None:
        """Load role-specific extras (priority, mappings) from core only."""
        data = self._load_yaml("roles.yaml", directory)
        self._role_priority = data.get("priority", [])
        self._role_slug_mappings = data.get("slug_mappings", {})
        self._role_namespace_mappings = data.get("namespace_mappings", {})

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

    @property
    def role_priority(self) -> List[str]:
        self._ensure_loaded()
        return self._role_priority

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
    "Progression",
    "VocabPackInfo",
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
    "check_pose_compatibility",
]
