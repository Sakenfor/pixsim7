"""
Pose taxonomy and mapping from detector labels.

This provides a consistent, editor-facing pose vocabulary that maps
to the various labels produced by pose detection systems.
"""

from typing import Dict, List, Set, Optional
from pydantic import BaseModel


class PoseDefinition(BaseModel):
    """
    Definition of a pose in our taxonomy.
    """
    id: str                              # Canonical pose ID
    label: str                           # Human-readable label
    description: Optional[str] = None    # Detailed description
    category: str                        # Category: standing, sitting, lying, etc.
    detector_labels: List[str] = []      # Maps from detector labels
    parent_pose: Optional[str] = None    # More general pose this specializes
    intimacy_min: Optional[int] = None   # Minimum intimacy level (1-10)
    tags: List[str] = []                 # Additional tags


class PoseTaxonomy:
    """
    The canonical pose taxonomy for action blocks.
    """

    def __init__(self):
        self.poses: Dict[str, PoseDefinition] = {}
        self.detector_mapping: Dict[str, str] = {}  # detector_label -> pose_id
        self.category_index: Dict[str, List[str]] = {}  # category -> [pose_ids]
        self._initialize_taxonomy()

    def _initialize_taxonomy(self):
        """Initialize the standard pose taxonomy."""

        # Standing poses
        self._add_pose(PoseDefinition(
            id="standing_neutral",
            label="Standing Neutral",
            category="standing",
            detector_labels=["standing", "stand", "upright"],
            tags=["full_body", "neutral"]
        ))

        self._add_pose(PoseDefinition(
            id="standing_near",
            label="Standing Near Object/Person",
            category="standing",
            detector_labels=["standing_near", "standing_by", "beside"],
            parent_pose="standing_neutral",
            tags=["full_body", "proximity"]
        ))

        self._add_pose(PoseDefinition(
            id="standing_facing",
            label="Standing Facing Partner",
            category="standing",
            detector_labels=["facing", "standing_facing", "face_to_face"],
            parent_pose="standing_neutral",
            intimacy_min=2,
            tags=["full_body", "interaction"]
        ))

        self._add_pose(PoseDefinition(
            id="standing_embrace",
            label="Standing Embrace",
            category="standing",
            detector_labels=["embracing", "hugging", "holding"],
            parent_pose="standing_facing",
            intimacy_min=5,
            tags=["full_body", "intimate", "contact"]
        ))

        # Sitting poses
        self._add_pose(PoseDefinition(
            id="sitting_neutral",
            label="Sitting Neutral",
            category="sitting",
            detector_labels=["sitting", "seated", "sit"],
            tags=["seated", "neutral"]
        ))

        self._add_pose(PoseDefinition(
            id="sitting_close",
            label="Sitting Close Together",
            category="sitting",
            detector_labels=["sitting_close", "seated_together", "side_by_side"],
            parent_pose="sitting_neutral",
            intimacy_min=3,
            tags=["seated", "proximity", "intimate"]
        ))

        self._add_pose(PoseDefinition(
            id="sitting_turned",
            label="Sitting Turned Toward",
            category="sitting",
            detector_labels=["turned_toward", "facing_seated", "angled_toward"],
            parent_pose="sitting_neutral",
            intimacy_min=4,
            tags=["seated", "interaction", "engaged"]
        ))

        self._add_pose(PoseDefinition(
            id="sitting_leaning",
            label="Sitting Leaning Together",
            category="sitting",
            detector_labels=["leaning_together", "leaning_in", "seated_lean"],
            parent_pose="sitting_close",
            intimacy_min=6,
            tags=["seated", "intimate", "contact"]
        ))

        # Lying poses
        self._add_pose(PoseDefinition(
            id="lying_neutral",
            label="Lying Down",
            category="lying",
            detector_labels=["lying", "lying_down", "reclined", "reclining"],
            tags=["horizontal", "relaxed"]
        ))

        self._add_pose(PoseDefinition(
            id="lying_side",
            label="Lying on Side",
            category="lying",
            detector_labels=["lying_side", "side_lying", "lateral"],
            parent_pose="lying_neutral",
            tags=["horizontal", "turned"]
        ))

        self._add_pose(PoseDefinition(
            id="lying_facing",
            label="Lying Facing Partner",
            category="lying",
            detector_labels=["lying_facing", "facing_horizontal", "bed_facing"],
            parent_pose="lying_neutral",
            intimacy_min=7,
            tags=["horizontal", "intimate", "interaction"]
        ))

        self._add_pose(PoseDefinition(
            id="lying_embrace",
            label="Lying Embracing",
            category="lying",
            detector_labels=["lying_embrace", "horizontal_embrace", "cuddling"],
            parent_pose="lying_facing",
            intimacy_min=8,
            tags=["horizontal", "intimate", "contact", "close"]
        ))

        # Leaning poses
        self._add_pose(PoseDefinition(
            id="leaning_wall",
            label="Leaning Against Wall",
            category="leaning",
            detector_labels=["leaning_wall", "against_wall", "wall_lean"],
            tags=["partial_support", "casual"]
        ))

        self._add_pose(PoseDefinition(
            id="leaning_rail",
            label="Leaning on Railing/Bar",
            category="leaning",
            detector_labels=["leaning_rail", "leaning_bar", "rail_lean"],
            tags=["partial_support", "casual"]
        ))

        self._add_pose(PoseDefinition(
            id="leaning_forward",
            label="Leaning Forward",
            category="leaning",
            detector_labels=["leaning_forward", "lean_in", "forward_lean"],
            intimacy_min=4,
            tags=["engaged", "interested"]
        ))

        # Walking/movement poses
        self._add_pose(PoseDefinition(
            id="walking_neutral",
            label="Walking",
            category="movement",
            detector_labels=["walking", "walk", "moving", "stride"],
            tags=["motion", "locomotion"]
        ))

        self._add_pose(PoseDefinition(
            id="walking_together",
            label="Walking Together",
            category="movement",
            detector_labels=["walking_together", "strolling", "side_walk"],
            parent_pose="walking_neutral",
            intimacy_min=2,
            tags=["motion", "proximity", "synchronized"]
        ))

        self._add_pose(PoseDefinition(
            id="walking_holding_hands",
            label="Walking Holding Hands",
            category="movement",
            detector_labels=["holding_hands", "hand_in_hand", "linked_walking"],
            parent_pose="walking_together",
            intimacy_min=5,
            tags=["motion", "intimate", "contact"]
        ))

        # Transitional poses
        self._add_pose(PoseDefinition(
            id="rising",
            label="Rising/Getting Up",
            category="transition",
            detector_labels=["rising", "getting_up", "standing_up"],
            tags=["motion", "transition"]
        ))

        self._add_pose(PoseDefinition(
            id="sitting_down",
            label="Sitting Down",
            category="transition",
            detector_labels=["sitting_down", "taking_seat", "descending"],
            tags=["motion", "transition"]
        ))

        self._add_pose(PoseDefinition(
            id="turning",
            label="Turning",
            category="transition",
            detector_labels=["turning", "rotating", "pivoting"],
            tags=["motion", "rotation"]
        ))

        # Intimate contact poses
        self._add_pose(PoseDefinition(
            id="kissing",
            label="Kissing",
            category="intimate",
            detector_labels=["kissing", "kiss", "lips_touching"],
            intimacy_min=7,
            tags=["intimate", "contact", "romantic"]
        ))

        self._add_pose(PoseDefinition(
            id="almost_kiss",
            label="Almost Kissing",
            category="intimate",
            detector_labels=["almost_kiss", "near_kiss", "faces_close"],
            intimacy_min=6,
            tags=["intimate", "tension", "proximity"]
        ))

        self._add_pose(PoseDefinition(
            id="forehead_touch",
            label="Forehead Touch",
            category="intimate",
            detector_labels=["forehead_touch", "heads_together", "forehead_kiss"],
            intimacy_min=7,
            tags=["intimate", "tender", "contact"]
        ))

        self._add_pose(PoseDefinition(
            id="hand_holding",
            label="Holding Hands",
            category="intimate",
            detector_labels=["holding_hands", "hand_hold", "hands_clasped"],
            intimacy_min=4,
            tags=["intimate", "contact", "connection"]
        ))

    def _add_pose(self, pose: PoseDefinition):
        """Add a pose to the taxonomy."""
        self.poses[pose.id] = pose

        # Update detector mapping
        for label in pose.detector_labels:
            self.detector_mapping[label.lower()] = pose.id

        # Update category index
        if pose.category not in self.category_index:
            self.category_index[pose.category] = []
        self.category_index[pose.category].append(pose.id)

    def get_pose(self, pose_id: str) -> Optional[PoseDefinition]:
        """Get a pose definition by ID."""
        return self.poses.get(pose_id)

    def map_from_detector(self, detector_label: str) -> Optional[str]:
        """Map a detector label to a pose ID."""
        return self.detector_mapping.get(detector_label.lower())

    def get_poses_by_category(self, category: str) -> List[PoseDefinition]:
        """Get all poses in a category."""
        pose_ids = self.category_index.get(category, [])
        return [self.poses[pid] for pid in pose_ids]

    def get_compatible_transitions(self, from_pose: str, to_pose: str) -> List[str]:
        """
        Get intermediate poses that could transition between two poses.
        """
        transitions = []

        from_def = self.get_pose(from_pose)
        to_def = self.get_pose(to_pose)

        if not from_def or not to_def:
            return transitions

        # If transitioning between categories, suggest transitional poses
        if from_def.category != to_def.category:
            if from_def.category == "sitting" and to_def.category == "standing":
                transitions.append("rising")
            elif from_def.category == "standing" and to_def.category == "sitting":
                transitions.append("sitting_down")
            elif "turning" not in [from_pose, to_pose]:
                transitions.append("turning")

        return transitions

    def is_pose_compatible(self, pose_id: str, intimacy_level: int) -> bool:
        """Check if a pose is compatible with an intimacy level."""
        pose = self.get_pose(pose_id)
        if not pose:
            return False
        if pose.intimacy_min is None:
            return True
        return intimacy_level >= pose.intimacy_min

    def find_similar_poses(self, pose_id: str, max_results: int = 5) -> List[str]:
        """Find poses similar to the given pose."""
        similar = []
        pose = self.get_pose(pose_id)

        if not pose:
            return similar

        # First, add parent or children
        if pose.parent_pose:
            similar.append(pose.parent_pose)

        # Find children (poses that have this as parent)
        for other_id, other_pose in self.poses.items():
            if other_pose.parent_pose == pose_id and other_id not in similar:
                similar.append(other_id)

        # Add poses from same category
        for other_id in self.category_index.get(pose.category, []):
            if other_id != pose_id and other_id not in similar:
                similar.append(other_id)
                if len(similar) >= max_results:
                    break

        return similar[:max_results]


# Global singleton instance
POSE_TAXONOMY = PoseTaxonomy()


# Versioned mapping for migration
DETECTOR_MAPPING_VERSION = "1.0.0"


def migrate_detector_labels(old_version: str, labels: List[str]) -> List[str]:
    """
    Migrate detector labels from an old version to current.
    This allows us to handle changes in detector output over time.
    """
    if old_version == DETECTOR_MAPPING_VERSION:
        return labels

    # Add migration logic here as detector versions change
    # For now, just return as-is
    return labels