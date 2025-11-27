"""
Prompt Import Helper - PixSim7 Backend

Source-agnostic prompt import pipeline.
Prepares prompt data for import into PixSim7 from any source (manual UI,
file imports, external systems, etc.) without tying to any specific source.

Purpose:
- Provide a generic import specification (PromptImportSpec)
- Convert import specs into standard API request models
- Use prompt_dsl_adapter for analysis while keeping it isolated
- Work with existing PromptFamily/PromptVersion models

Design:
- No database access (pure payload preparation)
- No source-specific logic (works for any import source)
- Returns standard Pydantic request models
"""
from enum import Enum
from typing import Dict, Any, List, Optional, Tuple

from ..api.v1.prompts.schemas import (
    CreatePromptFamilyRequest,
    CreatePromptVersionRequest,
)
from .prompt_dsl_adapter import analyze_prompt


class PromptSource(str, Enum):
    """Source of prompt import."""
    MANUAL = "manual"
    FILE_IMPORT = "file_import"
    EXTERNAL = "external"
    OTHER = "other"


class PromptImportSpec:
    """
    Minimal, source-agnostic import specification.

    This does NOT touch the database; it only prepares
    CreatePromptFamilyRequest/CreatePromptVersionRequest payloads.
    """

    def __init__(
        self,
        family_title: str,
        prompt_text: str,
        source: PromptSource = PromptSource.MANUAL,
        family_slug: Optional[str] = None,
        prompt_type: str = "visual",
        category: Optional[str] = None,
        family_tags: Optional[List[str]] = None,
        version_tags: Optional[List[str]] = None,
        family_metadata: Optional[Dict[str, Any]] = None,
        version_metadata: Optional[Dict[str, Any]] = None,
        source_reference: Optional[str] = None,
    ) -> None:
        self.family_title = family_title
        self.family_slug = family_slug
        self.prompt_text = prompt_text
        self.prompt_type = prompt_type
        self.category = category

        self.source = source
        self.source_reference = source_reference

        self.family_tags = family_tags or []
        self.version_tags = version_tags or []
        self.family_metadata = family_metadata or {}
        self.version_metadata = version_metadata or {}


async def prepare_import_payloads(
    spec: PromptImportSpec,
) -> Tuple[CreatePromptFamilyRequest, CreatePromptVersionRequest]:
    """
    Pure helper: takes an import spec, runs prompt analysis, and returns
    ready-to-use Pydantic request models for the existing prompts API.

    No DB writes happen here.
    """
    analysis = await analyze_prompt(spec.prompt_text)
    auto_tags: List[str] = analysis.get("tags", [])

    # Family tags: explicit + auto tags (deduplicated)
    family_tags = sorted(set(spec.family_tags + auto_tags))

    # Version tags: explicit + auto tags (deduplicated)
    version_tags = sorted(set(spec.version_tags + auto_tags))

    family = CreatePromptFamilyRequest(
        title=spec.family_title,
        prompt_type=spec.prompt_type,
        slug=spec.family_slug,
        description=None,
        category=spec.category,
        tags=family_tags,
        game_world_id=None,
        npc_id=None,
        scene_id=None,
        action_concept_id=None,
    )

    provider_hints: Dict[str, Any] = dict(spec.version_metadata)
    provider_hints.setdefault("prompt_analysis", analysis)
    provider_hints.setdefault("source", spec.source.value)
    if spec.source_reference:
        provider_hints.setdefault("source_reference", spec.source_reference)

    version = CreatePromptVersionRequest(
        prompt_text=spec.prompt_text,
        commit_message=None,
        author=None,
        parent_version_id=None,
        variables={},
        provider_hints=provider_hints,
        tags=version_tags,
    )

    return family, version
