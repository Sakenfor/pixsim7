"""
Asset relation type constants

Defines semantic relationships between parent and child assets in lineage tracking.
These are used in AssetLineage.relation_type to describe HOW a parent was used
to create a child asset.
"""

# ─────────────────────────────────────────────────────────────────────────────
# Image Sources
# ─────────────────────────────────────────────────────────────────────────────

SOURCE_IMAGE = "SOURCE_IMAGE"
"""Image used as primary source for image-to-video generation"""

REFERENCE_IMAGE = "REFERENCE_IMAGE"
"""Image used as style or composition reference"""

PAUSED_FRAME = "PAUSED_FRAME"
"""Image extracted from a paused video frame at specific timestamp"""

TRANSITION_INPUT = "TRANSITION_INPUT"
"""One of multiple images in a transition sequence"""

# ─────────────────────────────────────────────────────────────────────────────
# Video Sources
# ─────────────────────────────────────────────────────────────────────────────

SOURCE_VIDEO = "SOURCE_VIDEO"
"""Video used as source for extension or transformation"""

KEYFRAME = "KEYFRAME"
"""Video keyframe in timeline/storyboard operations (e.g., Sora)"""

VIDEO_CLIP = "VIDEO_CLIP"
"""Segment/clip extracted from a larger video"""

# ─────────────────────────────────────────────────────────────────────────────
# Composition & Multi-Image
# ─────────────────────────────────────────────────────────────────────────────

COMPOSITION_MAIN_CHARACTER = "COMPOSITION_MAIN_CHARACTER"
"""Main character asset for multi-image composition"""

COMPOSITION_COMPANION = "COMPOSITION_COMPANION"
"""Companion/secondary character asset for multi-image composition"""

COMPOSITION_ENVIRONMENT = "COMPOSITION_ENVIRONMENT"
"""Background/environment asset for multi-image composition"""

COMPOSITION_PROP = "COMPOSITION_PROP"
"""Prop/object asset for multi-image composition"""

COMPOSITION_STYLE_REFERENCE = "COMPOSITION_STYLE_REFERENCE"
"""Style reference asset for multi-image composition"""

COMPOSITION_EFFECT = "COMPOSITION_EFFECT"
"""Effect/overlay asset for multi-image composition"""

# ─────────────────────────────────────────────────────────────────────────────
# Generic
# ─────────────────────────────────────────────────────────────────────────────

SOURCE = "SOURCE"
"""Generic source asset"""

DERIVATION = "DERIVATION"
"""Generic derived relationship"""

REFERENCE = "REFERENCE"
"""Generic reference asset"""

# ─────────────────────────────────────────────────────────────────────────────
# Helper Sets
# ─────────────────────────────────────────────────────────────────────────────

IMAGE_RELATIONS = {
    SOURCE_IMAGE,
    REFERENCE_IMAGE,
    PAUSED_FRAME,
    TRANSITION_INPUT,
}

VIDEO_RELATIONS = {
    SOURCE_VIDEO,
    KEYFRAME,
    VIDEO_CLIP,
}

COMPOSITION_RELATIONS = {
    COMPOSITION_MAIN_CHARACTER,
    COMPOSITION_COMPANION,
    COMPOSITION_ENVIRONMENT,
    COMPOSITION_PROP,
    COMPOSITION_STYLE_REFERENCE,
    COMPOSITION_EFFECT,
}

ALL_RELATION_TYPES = (
    IMAGE_RELATIONS | VIDEO_RELATIONS | COMPOSITION_RELATIONS |
    {SOURCE, DERIVATION, REFERENCE}
)
