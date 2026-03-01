"""Action block domain package.

The legacy selector stack has been retired from runtime paths. Keep package
exports minimal to avoid import-time side effects when loading submodules.
"""

from .ontology import (
    OntologyService,
    get_ontology,
    PoseDefinition,
    IntimacyLevel,
    ContentRatingDef,
    MoodDefinition,
    BranchIntentDef,
    LocationDefinition,
)
from .types_unified import (
    BranchIntent,
    CameraMovementType,
    CameraSpeed,
    CameraPath,
    ContentRating,
    IntensityPattern,
    ReferenceImage,
    TransitionEndpoint,
    CameraMovement,
    ConsistencyFlags,
    IntensityProgression,
    ActionBlockTags,
    ActionBlock,
    ActionSelectionContext,
    ActionSelectionResult,
)

__all__ = [
    "OntologyService",
    "get_ontology",
    "PoseDefinition",
    "IntimacyLevel",
    "ContentRatingDef",
    "MoodDefinition",
    "BranchIntentDef",
    "LocationDefinition",
    "BranchIntent",
    "CameraMovementType",
    "CameraSpeed",
    "CameraPath",
    "ContentRating",
    "IntensityPattern",
    "ReferenceImage",
    "TransitionEndpoint",
    "CameraMovement",
    "ConsistencyFlags",
    "IntensityProgression",
    "ActionBlockTags",
    "ActionBlock",
    "ActionSelectionContext",
    "ActionSelectionResult",
]
