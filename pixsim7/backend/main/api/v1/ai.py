"""
AI Hub API - LLM-powered operations for prompt editing and AI assistance
"""
from typing import Optional, List
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from pixsim7.backend.main.api.dependencies import get_current_user, get_database
from pixsim7.backend.main.domain import User
from pixsim7.backend.main.services.llm.ai_hub_service import AiHubService
from pixsim7.backend.main.shared.errors import (
    ProviderNotFoundError,
    ProviderAuthenticationError,
    ProviderError,
)

router = APIRouter()


# ===== REQUEST/RESPONSE SCHEMAS =====

class PromptEditRequest(BaseModel):
    """Request to edit a prompt using AI"""
    model_config = ConfigDict(protected_namespaces=())

    provider_id: Optional[str] = Field(
        None,
        description="LLM provider ID (e.g., 'openai-llm', 'anthropic-llm'). Defaults to 'openai-llm'"
    )
    model_id: str = Field(
        ...,
        description="Model to use (e.g., 'gpt-4', 'claude-sonnet-4')",
        examples=["gpt-4", "claude-sonnet-4"]
    )
    prompt_before: str = Field(
        ...,
        description="Original prompt to edit",
        min_length=1
    )
    context: Optional[dict] = Field(
        None,
        description="Optional context (generation metadata, user preferences, etc.)"
    )
    generation_id: Optional[int] = Field(
        None,
        description="Optional generation ID to link this interaction to"
    )
    instance_id: Optional[int] = Field(
        None,
        description="Optional LLM instance ID for provider-specific configuration (e.g., cmd-llm instances)"
    )


class PromptEditResponse(BaseModel):
    """Response from prompt edit operation"""
    model_config = ConfigDict(protected_namespaces=())

    prompt_after: str = Field(
        ...,
        description="AI-edited prompt"
    )
    model_id: str = Field(
        ...,
        description="Model used for editing"
    )
    provider_id: str = Field(
        ...,
        description="Provider used for editing"
    )
    interaction_id: Optional[int] = Field(
        None,
        description="AI interaction record ID (for tracking)"
    )


class AvailableProvidersResponse(BaseModel):
    """Response with available LLM providers"""
    model_config = ConfigDict(protected_namespaces=())

    providers: list[dict] = Field(
        ...,
        description="List of available LLM providers"
    )


class AiInteractionItem(BaseModel):
  """Single AI interaction record (for debugging/inspection)"""
  model_config = ConfigDict(protected_namespaces=())

  id: int
  generation_id: Optional[int]
  provider_id: str
  model_id: str
  prompt_before: str
  prompt_after: str
  created_at: datetime


class AiInteractionsResponse(BaseModel):
    """Response with AI interactions"""
    model_config = ConfigDict(protected_namespaces=())

    interactions: List[AiInteractionItem] = Field(
        ...,
        description="List of AI interactions for the user (optionally filtered by generation)"
    )


# ===== DEPENDENCIES =====

def get_ai_hub_service(db: AsyncSession = Depends(get_database)) -> AiHubService:
    """Get AiHubService instance"""
    return AiHubService(db)


# ===== ENDPOINTS =====

@router.post("/prompt-edit", response_model=PromptEditResponse)
async def edit_prompt(
    request: PromptEditRequest,
    current_user: User = Depends(get_current_user),
    ai_hub: AiHubService = Depends(get_ai_hub_service)
):
    """
    Edit/refine a prompt using an LLM

    This endpoint uses AI to improve video generation prompts by:
    - Adding specific visual details
    - Improving clarity and structure
    - Optimizing for video generation models

    **Example:**
    ```json
    {
      "model_id": "gpt-4",
      "prompt_before": "A sunset",
      "context": {
        "style": "cinematic",
        "duration": 5
      }
    }
    ```

    **Returns:**
    - `prompt_after`: AI-refined prompt
    - `model_id`: Model used
    - `provider_id`: Provider used
    - `interaction_id`: Interaction record ID
    """
    try:
        result = await ai_hub.edit_prompt(
            user=current_user,
            provider_id=request.provider_id,
            model_id=request.model_id,
            prompt_before=request.prompt_before,
            context=request.context,
            generation_id=request.generation_id,
            instance_id=request.instance_id,
        )

        return PromptEditResponse(**result)

    except ProviderNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"LLM provider not found: {e.provider_id}"
        )
    except ProviderAuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed for {e.provider_id}: {e.message}"
        )
    except ProviderError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"LLM provider error: {e.message}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error: {str(e)}"
        )


@router.get("/providers", response_model=AvailableProvidersResponse)
async def get_available_providers(
    current_user: User = Depends(get_current_user),
    ai_hub: AiHubService = Depends(get_ai_hub_service)
):
    """
    Get list of available LLM providers

    Returns all registered LLM providers that can be used for prompt editing.

    **Example response:**
    ```json
    {
      "providers": [
        {"provider_id": "openai-llm", "name": "OpenAI"},
        {"provider_id": "anthropic-llm", "name": "Anthropic"}
      ]
    }
    ```
    """
    providers = ai_hub.get_available_providers()
    return AvailableProvidersResponse(providers=providers)


@router.get("/interactions", response_model=AiInteractionsResponse)
async def get_ai_interactions(
    generation_id: Optional[int] = Query(
        None,
        description="Optional generation ID to filter interactions"
    ),
    current_user: User = Depends(get_current_user),
    ai_hub: AiHubService = Depends(get_ai_hub_service),
):
    """
    Get AI interactions for the current user.

    Optional `generation_id` filter limits results to interactions linked to a specific generation.
    Intended for dev/debug tooling and audit.
    """
    interactions = await ai_hub.list_interactions(current_user, generation_id=generation_id)
    items = [
        AiInteractionItem(
            id=i.id,
            generation_id=i.generation_id,
            provider_id=i.provider_id,
            model_id=i.model_id,
            prompt_before=i.prompt_before,
            prompt_after=i.prompt_after,
            created_at=i.created_at,
        )
        for i in interactions
    ]
    return AiInteractionsResponse(interactions=items)


# ===== MODEL CATALOG & CAPABILITY DEFAULTS =====


class AiModelResponse(BaseModel):
    id: str
    label: str
    provider_id: Optional[str] = None
    capabilities: List[str] = Field(default_factory=list)
    supported_methods: List[str] = Field(default_factory=list)
    description: Optional[str] = None


class AiModelsListResponse(BaseModel):
    models: List[AiModelResponse]


class CapabilityDefaultEntry(BaseModel):
    model_id: str
    method: Optional[str] = None


@router.get("/models", response_model=AiModelsListResponse)
async def list_ai_models() -> AiModelsListResponse:
    """List all registered AI models with their capabilities and supported methods."""
    from pixsim7.backend.main.services.ai_model.registry import ai_model_registry

    items = []
    for m in ai_model_registry.values():
        kind = m.kind.value if hasattr(m.kind, 'value') else str(m.kind)
        if kind in ("llm", "both"):
            items.append(AiModelResponse(
                id=m.id,
                label=m.label,
                provider_id=m.provider_id,
                capabilities=list(m.capabilities),
                supported_methods=list(m.supported_methods),
                description=m.description,
            ))
    return AiModelsListResponse(models=items)


@router.get("/defaults")
async def get_capability_defaults(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_database),
) -> dict[str, CapabilityDefaultEntry]:
    """Get per-capability model+method defaults for the current user."""
    from pixsim7.backend.main.shared.schemas.ai_model_schemas import AiModelCapability
    from pixsim7.backend.main.services.ai_model.defaults import get_default_model

    result = {}
    for cap in AiModelCapability:
        # Skip non-LLM capabilities
        if cap.value in ("prompt_parse", "embedding"):
            continue
        model_id, method = await get_default_model(db, cap, "user", str(user.id))
        result[cap.value] = CapabilityDefaultEntry(model_id=model_id, method=method)

    return result


@router.patch("/defaults")
async def update_capability_defaults(
    payload: dict[str, CapabilityDefaultEntry],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_database),
) -> dict[str, str]:
    """Update per-capability model+method defaults for the current user."""
    from pixsim7.backend.main.shared.schemas.ai_model_schemas import AiModelCapability
    from pixsim7.backend.main.services.ai_model.defaults import set_default_model, AiModelDefault
    from sqlalchemy.dialects.postgresql import insert
    from sqlalchemy.sql import func

    updated = []
    for cap_str, entry in payload.items():
        try:
            cap = AiModelCapability(cap_str)
        except ValueError:
            continue

        # Upsert
        stmt = insert(AiModelDefault).values(
            scope_type="user",
            scope_id=str(user.id),
            capability=cap.value,
            model_id=entry.model_id,
            method=entry.method,
        )
        stmt = stmt.on_conflict_do_update(
            constraint='uq_ai_model_defaults_scope_capability',
            set_={'model_id': entry.model_id, 'method': entry.method, 'updated_at': func.now()}
        )
        await db.execute(stmt)
        updated.append(cap_str)

    await db.commit()
    return {"updated": updated}
