"""
Species Meta API — CRUD endpoints for the species vocabulary registry.

Endpoints: GET/POST/PATCH /meta/species
Mounted via RegistryCrudSpec (same pattern as authoring-modes).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from pixsim7.backend.main.services.prompt.species_registry import species_registry
from pixsim7.backend.main.shared.ontology.vocabularies.factories import (
    _validate_species_schema,
    make_species,
)
from pixsim7.backend.main.shared.ontology.vocabularies.types import (
    DEFAULT_MODIFIER_ROLE_MAPPING,
    SpeciesDef,
)

router = APIRouter(tags=["species"])


# ---------------------------------------------------------------------------
# Response model (API contract)
# ---------------------------------------------------------------------------


class SpeciesContract(BaseModel):
    """Species vocabulary entry as returned by the API."""

    id: str
    label: str
    category: str = ""
    anatomy_map: Dict[str, str] = Field(default_factory=dict)
    movement_verbs: List[str] = Field(default_factory=list)
    pronoun_set: Dict[str, str] = Field(default_factory=dict)
    default_stance: str = "standing"
    keywords: List[str] = Field(default_factory=list)
    visual_priority: List[str] = Field(default_factory=list)
    render_template: str = ""
    modifier_roles: Dict[str, str] = Field(default_factory=dict)
    word_lists: Dict[str, List[str]] = Field(default_factory=dict)
    source: str = "system"


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class CreateSpeciesRequest(BaseModel):
    """Create a new species vocabulary entry."""

    id: str = Field(description="Namespaced species ID (e.g. 'species:reptilian')")
    label: str
    category: str = ""
    anatomy_map: Dict[str, str]
    movement_verbs: List[str] = Field(default_factory=list)
    pronoun_set: Dict[str, str] = Field(default_factory=dict)
    default_stance: str = "standing"
    keywords: List[str] = Field(default_factory=list)
    visual_priority: List[str] = Field(default_factory=list)
    render_template: str = ""
    modifier_roles: Optional[Dict[str, str]] = Field(
        default=None,
        description="Abstract role -> word_list key mapping. Defaults auto-inferred if omitted.",
    )
    word_lists: Dict[str, List[str]] = Field(default_factory=dict)


class UpdateSpeciesRequest(BaseModel):
    """Update an existing species vocabulary entry (all fields optional)."""

    label: Optional[str] = None
    category: Optional[str] = None
    anatomy_map: Optional[Dict[str, str]] = None
    movement_verbs: Optional[List[str]] = None
    pronoun_set: Optional[Dict[str, str]] = None
    default_stance: Optional[str] = None
    keywords: Optional[List[str]] = None
    visual_priority: Optional[List[str]] = None
    render_template: Optional[str] = None
    modifier_roles: Optional[Dict[str, str]] = None
    word_lists: Optional[Dict[str, List[str]]] = None


# ---------------------------------------------------------------------------
# Converters
# ---------------------------------------------------------------------------


def _species_to_contract(species: SpeciesDef) -> SpeciesContract:
    """Convert in-memory SpeciesDef to API response."""
    from pixsim7.backend.main.shared.ontology.vocabularies.modifiers import (
        FixedValue,
        GradedList,
        PronounSet,
    )

    # Extract raw word_lists from hydrated modifiers
    non_word_list_keys = set(species.anatomy_map.keys()) | {"movement", "stance", "pronoun"}
    word_lists: Dict[str, Any] = {}
    for key, mod in species.modifiers.items():
        if key in non_word_list_keys:
            continue
        if isinstance(mod, GradedList):
            word_lists[key] = mod.values
        elif isinstance(mod, FixedValue):
            word_lists[key] = [mod.value]
        elif isinstance(mod, PronounSet):
            pass  # pronoun_set is a separate field

    return SpeciesContract(
        id=species.id,
        label=species.label,
        category=species.category,
        anatomy_map=species.anatomy_map,
        movement_verbs=species.movement_verbs,
        pronoun_set=species.pronoun_set,
        default_stance=species.default_stance,
        keywords=species.keywords,
        visual_priority=species.visual_priority,
        render_template=species.render_template,
        modifier_roles=species.modifier_roles,
        word_lists=word_lists,
        source=species.source,
    )


def _create_request_to_species(request: CreateSpeciesRequest) -> SpeciesDef:
    """Convert API create request to SpeciesDef (with validation)."""
    data = {
        "label": request.label,
        "category": request.category,
        "anatomy_map": request.anatomy_map,
        "movement_verbs": request.movement_verbs,
        "pronoun_set": request.pronoun_set,
        "default_stance": request.default_stance,
        "keywords": request.keywords,
        "visual_priority": request.visual_priority,
        "render_template": request.render_template,
        "word_lists": request.word_lists,
    }
    if request.modifier_roles is not None:
        data["modifier_roles"] = request.modifier_roles

    # make_species runs _validate_species_schema internally (raises ValueError)
    return make_species(request.id, data, "api")


def _apply_update_to_species(
    existing: SpeciesDef, request: UpdateSpeciesRequest
) -> SpeciesDef:
    """Merge update request onto existing species, re-validate, return new."""
    data = {
        "label": request.label if request.label is not None else existing.label,
        "category": request.category if request.category is not None else existing.category,
        "anatomy_map": request.anatomy_map if request.anatomy_map is not None else existing.anatomy_map,
        "movement_verbs": request.movement_verbs if request.movement_verbs is not None else existing.movement_verbs,
        "pronoun_set": request.pronoun_set if request.pronoun_set is not None else existing.pronoun_set,
        "default_stance": request.default_stance if request.default_stance is not None else existing.default_stance,
        "keywords": request.keywords if request.keywords is not None else existing.keywords,
        "visual_priority": request.visual_priority if request.visual_priority is not None else existing.visual_priority,
        "render_template": request.render_template if request.render_template is not None else existing.render_template,
        "modifier_roles": request.modifier_roles if request.modifier_roles is not None else existing.modifier_roles,
    }

    # word_lists: need to extract from existing modifiers if not provided
    if request.word_lists is not None:
        data["word_lists"] = request.word_lists
    else:
        from pixsim7.backend.main.shared.ontology.vocabularies.modifiers import (
            GradedList,
            FixedValue,
        )
        non_word_list_keys = set(existing.anatomy_map.keys()) | {"movement", "stance", "pronoun"}
        wl: Dict[str, Any] = {}
        for key, mod in existing.modifiers.items():
            if key in non_word_list_keys:
                continue
            if isinstance(mod, GradedList):
                wl[key] = mod.values
            elif isinstance(mod, FixedValue):
                wl[key] = mod.value
        data["word_lists"] = wl

    # Re-validate full species after merge (raises ValueError on failure)
    return make_species(existing.id, data, existing.source)


# ---------------------------------------------------------------------------
# Mount CRUD via generic factory
# ---------------------------------------------------------------------------

from pixsim7.backend.main.services.crud.registry import (  # noqa: E402
    RegistryCrudSpec,
    mount_registry_crud,
)

species_crud_spec = RegistryCrudSpec(
    prefix="/meta/species",
    tag="species",
    summary_noun="species",
    registry=species_registry,
    response_model=SpeciesContract,
    create_request_model=CreateSpeciesRequest,
    update_request_model=UpdateSpeciesRequest,
    to_response=_species_to_contract,
    from_create_request=_create_request_to_species,
    apply_update_request=_apply_update_to_species,
)

mount_registry_crud(router, species_crud_spec)
