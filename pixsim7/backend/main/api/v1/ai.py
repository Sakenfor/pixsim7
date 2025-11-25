"""
AI Hub API - LLM-powered operations for prompt editing and AI assistance
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
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


class PromptEditResponse(BaseModel):
    """Response from prompt edit operation"""
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
    providers: list[dict] = Field(
        ...,
        description="List of available LLM providers"
    )


# ===== DEPENDENCIES =====

def get_ai_hub_service(db: AsyncSession = Depends(get_database)) -> AiHubService:
    """Get AiHubService instance"""
    return AiHubService(db)


# ===== ENDPOINTS =====

@router.post("/prompt-edit", response_model=PromptEditResponse)
async def edit_prompt(
    request: PromptEditRequest,
    current_user: CurrentUser,
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
            generation_id=request.generation_id
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
    current_user: CurrentUser,
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
