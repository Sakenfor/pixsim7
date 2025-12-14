"""
Dev AI Models API

Dev-only endpoint for inspecting AI models and managing default model selections.

Purpose:
- List all available AI models and their capabilities
- View current default models per capability
- Update default models per capability (prompt_edit, prompt_parse, etc.)
- Support the Prompt Lab Models tab

Design:
- Dev-only endpoint (no production use)
- Global scope only (user/workspace scope in future)
- Validates model selections against registry
"""
from fastapi import APIRouter, HTTPException
from typing import List, Dict
from pydantic import BaseModel

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.services.ai_model import (
    ai_model_registry,
    get_all_defaults,
    set_all_defaults,
)
from pixsim7.backend.main.shared.schemas.ai_model_schemas import (
    AiModel,
    AiModelCapability,
)
from pixsim_logging import get_logger

logger = get_logger()

router = APIRouter(prefix="/dev/ai-models", tags=["dev", "ai", "models"])


# ===== Request/Response Models =====

class SetDefaultsRequest(BaseModel):
    """Request to update default model selections."""
    defaults: Dict[str, str]  # capability -> model_id

    class Config:
        schema_extra = {
            "example": {
                "defaults": {
                    "prompt_edit": "openai:gpt-4o-mini",
                    "prompt_parse": "prompt-dsl:simple"
                }
            }
        }


# ===== Endpoints =====

@router.get("", response_model=List[AiModel])
async def list_ai_models(
    user: CurrentUser = None,
) -> List[AiModel]:
    """
    List all available AI models and parsing engines.

    Returns:
        List of AI models with their capabilities and metadata
    """
    try:
        models = ai_model_registry.list_all()

        logger.info(
            f"Listed {len(models)} AI models",
            extra={"user_id": user.id if user else None}
        )

        return models

    except Exception as e:
        logger.error(
            f"Failed to list AI models: {e}",
            extra={"user_id": user.id if user else None},
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list AI models: {str(e)}"
        )


@router.get("/defaults", response_model=Dict[str, str])
async def get_defaults(
    db: DatabaseSession = None,
    user: CurrentUser = None,
) -> Dict[str, str]:
    """
    Get current default model selections per capability.

    Returns:
        Dict mapping capability to model_id
        Example: {"prompt_edit": "openai:gpt-4o-mini", "prompt_parse": "prompt-dsl:simple"}
    """
    try:
        defaults = await get_all_defaults(db, scope_type="global", scope_id=None)

        logger.info(
            "Retrieved AI model defaults",
            extra={
                "user_id": user.id if user else None,
                "defaults": defaults
            }
        )

        return defaults

    except Exception as e:
        logger.error(
            f"Failed to get AI model defaults: {e}",
            extra={"user_id": user.id if user else None},
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get defaults: {str(e)}"
        )


@router.post("/defaults", response_model=Dict[str, str])
async def update_defaults(
    request: SetDefaultsRequest,
    db: DatabaseSession = None,
    user: CurrentUser = None,
) -> Dict[str, str]:
    """
    Update default model selections.

    Request body:
        {
            "defaults": {
                "prompt_edit": "anthropic:claude-3.5",
                "prompt_parse": "prompt-dsl:simple"
            }
        }

    Returns:
        Updated defaults dict

    Raises:
        400: If model doesn't exist or doesn't support the capability
    """
    try:
        # Validate and set defaults
        await set_all_defaults(
            db,
            request.defaults,
            scope_type="global",
            scope_id=None
        )

        # Fetch updated defaults to return
        updated = await get_all_defaults(db, scope_type="global", scope_id=None)

        logger.info(
            "Updated AI model defaults",
            extra={
                "user_id": user.id if user else None,
                "updated_defaults": updated
            }
        )

        return updated

    except (KeyError, ValueError) as e:
        # Validation errors (model not found or doesn't support capability)
        logger.warning(
            f"Invalid default model selection: {e}",
            extra={
                "user_id": user.id if user else None,
                "request": request.defaults
            }
        )
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        logger.error(
            f"Failed to update AI model defaults: {e}",
            extra={
                "user_id": user.id if user else None,
                "request": request.defaults
            },
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update defaults: {str(e)}"
        )


@router.get("/capabilities/{capability}", response_model=List[AiModel])
async def list_models_by_capability(
    capability: str,
    user: CurrentUser = None,
) -> List[AiModel]:
    """
    List all models that support a specific capability.

    Path params:
        capability: "prompt_edit", "prompt_parse", or "tag_suggest"

    Returns:
        List of AI models that support the capability
    """
    try:
        # Validate capability
        try:
            cap_enum = AiModelCapability(capability)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid capability: {capability}. Valid: {[c.value for c in AiModelCapability]}"
            )

        # Get models with this capability
        models = ai_model_registry.list_by_capability(cap_enum)

        logger.info(
            f"Listed {len(models)} models for capability {capability}",
            extra={
                "user_id": user.id if user else None,
                "capability": capability
            }
        )

        return models

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Failed to list models by capability: {e}",
            extra={
                "user_id": user.id if user else None,
                "capability": capability
            },
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list models: {str(e)}"
        )
