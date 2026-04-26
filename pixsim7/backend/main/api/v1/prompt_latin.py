"""Latin enhancer composition API.

Single endpoint that picks N tagged Latin variants from the block primitives
DB and joins them. Used by the Composition Preview tab in the prompt
library inspector and any future prompt-authoring surface that wants a
length-controlled Latin enhancer.
"""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field

from pixsim7.backend.main.infrastructure.database.session import get_async_blocks_session
from pixsim7.backend.main.services.prompt.latin_enhancer import (
    ComposeRequest,
    ComposedVariant,
    LENGTH_TIER_COUNTS,
    compose,
)

router = APIRouter(prefix="/prompts/latin-enhancer", tags=["prompts", "latin-enhancer"])


class ComposedVariantResponse(BaseModel):
    # `register` shadows BaseModel.register on the parent class; alias to keep
    # the wire format stable while the python attribute stays distinct.
    model_config = ConfigDict(populate_by_name=True)

    block_id: str
    text: str
    register_value: Optional[str] = Field(default=None, alias="register", serialization_alias="register")
    intensity: Optional[str] = None
    motion_type: Optional[str] = None
    applies_to: Optional[str] = None
    latin_form: Optional[str] = None
    domains: list[str] = Field(default_factory=list)


class ComposeResponseModel(BaseModel):
    text: str
    variants: list[ComposedVariantResponse]
    pool_size: int = Field(description="Total candidates available after register/domain filter")
    intensity_curve: list[str]


def _to_response(variant: ComposedVariant) -> ComposedVariantResponse:
    return ComposedVariantResponse(
        block_id=variant.block_id,
        text=variant.text,
        register_value=variant.register,
        intensity=variant.intensity,
        motion_type=variant.motion_type,
        applies_to=variant.applies_to,
        latin_form=variant.latin_form,
        domains=list(variant.domains),
    )


@router.get("/compose", response_model=ComposeResponseModel, response_model_by_alias=True)
async def compose_latin_enhancer(
    length: Literal["brief", "short", "medium", "long"] = Query(
        default="short",
        description=f"Number of variants to combine: {LENGTH_TIER_COUNTS}",
    ),
    register: Literal["technical", "poetic", "mixed"] = Query(
        default="mixed",
        description="Register filter; mixed includes both",
    ),
    intensity: Literal["subtle", "moderate", "firm", "absolute", "escalating"] = Query(
        default="moderate",
        description="Fixed tier or escalating curve across picks",
    ),
    domains: Optional[list[str]] = Query(
        default=None,
        description="Filter to variants whose tags.domain overlaps any of these (e.g. touch, oral)",
    ),
    seed: Optional[int] = Query(
        default=None,
        description="Deterministic re-roll seed; omit for fresh random pick",
    ),
) -> ComposeResponseModel:
    """Pick N Latin variants matching the criteria and return joined output."""
    req = ComposeRequest(
        length=length,
        register=register,
        intensity=intensity,
        domains=tuple(domains) if domains else None,
        seed=seed,
    )
    async with get_async_blocks_session() as blocks_db:
        result = await compose(blocks_db, req)
    return ComposeResponseModel(
        text=result.text,
        variants=[_to_response(v) for v in result.variants],
        pool_size=result.pool_size,
        intensity_curve=list(result.intensity_curve),
    )
