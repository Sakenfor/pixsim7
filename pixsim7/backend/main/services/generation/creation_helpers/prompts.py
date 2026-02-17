"""
Prompt resolution, variable substitution, and find-or-create logic.

Handles resolving prompts from version IDs, family IDs, and inline text,
plus template variable substitution.
"""
import logging
from typing import Dict, Any, Optional, Tuple
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

logger = logging.getLogger(__name__)


def substitute_variables(prompt_text: str, variables: Dict[str, Any]) -> str:
    """
    Substitute template variables in prompt text

    Replaces {{variable_name}} with values from variables dict.
    Supports simple substitution and basic formatting.

    Args:
        prompt_text: Prompt text with {{variable}} placeholders
        variables: Dict of variable values

    Returns:
        Prompt text with variables substituted
    """
    final_prompt = prompt_text

    # Replace {{variable}} with values from variables dict
    for key, value in variables.items():
        placeholder = f"{{{{{key}}}}}"
        if placeholder in final_prompt:
            final_prompt = final_prompt.replace(placeholder, str(value))

    return final_prompt


async def resolve_prompt(
    db: AsyncSession,
    prompt_version_id: UUID,
    params: Dict[str, Any],
) -> Optional[str]:
    """
    LEGACY: Resolve prompt from prompt version with variable substitution

    This is kept for backward compatibility. New code should use
    resolve_prompt_config with structured prompt_config.

    Args:
        db: Database session
        prompt_version_id: Prompt version to use
        params: Parameters for variable substitution

    Returns:
        Final prompt after substitution, or None if version not found
    """
    from pixsim7.backend.main.domain.prompt import PromptVersion

    result = await db.execute(
        select(PromptVersion).where(PromptVersion.id == prompt_version_id)
    )
    prompt_version = result.scalar_one_or_none()

    if not prompt_version:
        logger.warning(f"Prompt version {prompt_version_id} not found")
        return None

    # Simple variable substitution
    final_prompt = prompt_version.prompt_text

    # Replace {{variable}} with values from params
    for key, value in params.items():
        placeholder = f"{{{{{key}}}}}"
        if placeholder in final_prompt:
            final_prompt = final_prompt.replace(placeholder, str(value))

    return final_prompt


async def resolve_prompt_config(
    db: AsyncSession,
    prompt_config: Dict[str, Any],
) -> Tuple[Optional[str], Optional[UUID], str]:
    """
    Resolve prompt from structured prompt_config

    This is the new canonical way to resolve prompts, supporting:
    - Direct version ID reference
    - Family ID with auto-select latest
    - Variable substitution
    - Inline prompts (deprecated, for testing only)

    Args:
        db: Database session
        prompt_config: Structured configuration:
            {
                "versionId": "uuid",         // Specific version
                "familyId": "uuid",          // Family with auto-select
                "autoSelectLatest": true,    // Use latest version
                "variables": {...},          // Template variables
                "inlinePrompt": "..."        // DEPRECATED: inline prompt
            }

    Returns:
        Tuple of (final_prompt, prompt_version_id, source_type)
        source_type is one of: "versioned", "inline", "unknown"
    """
    from pixsim7.backend.main.domain.prompt import PromptVersion, PromptFamily

    # Check for inline prompt (deprecated path)
    if "inlinePrompt" in prompt_config and prompt_config["inlinePrompt"]:
        logger.warning("Using deprecated inline prompt - use versioned prompts instead")
        return prompt_config["inlinePrompt"], None, "inline"

    # Get variables for substitution
    variables = prompt_config.get("variables", {})

    # Path 1: Direct version ID
    if "versionId" in prompt_config and prompt_config["versionId"]:
        version_id = UUID(prompt_config["versionId"]) if isinstance(prompt_config["versionId"], str) else prompt_config["versionId"]

        result = await db.execute(
            select(PromptVersion).where(PromptVersion.id == version_id)
        )
        prompt_version = result.scalar_one_or_none()

        if not prompt_version:
            logger.error(f"Prompt version {version_id} not found")
            return None, None, "unknown"

        final_prompt = substitute_variables(prompt_version.prompt_text, variables)
        return final_prompt, prompt_version.id, "versioned"

    # Path 2: Family ID with auto-select latest
    if "familyId" in prompt_config and prompt_config["familyId"]:
        family_id = UUID(prompt_config["familyId"]) if isinstance(prompt_config["familyId"], str) else prompt_config["familyId"]
        auto_select = prompt_config.get("autoSelectLatest", True)

        if not auto_select:
            logger.warning(f"familyId provided but autoSelectLatest=false - no version specified")
            return None, None, "unknown"

        # Get latest version from family (highest version_number)
        result = await db.execute(
            select(PromptVersion)
            .where(PromptVersion.family_id == family_id)
            .order_by(PromptVersion.version_number.desc())
            .limit(1)
        )
        prompt_version = result.scalar_one_or_none()

        if not prompt_version:
            logger.error(f"No versions found for prompt family {family_id}")
            return None, None, "unknown"

        logger.info(f"Auto-selected prompt version {prompt_version.id} (v{prompt_version.version_number}) from family {family_id}")

        final_prompt = substitute_variables(prompt_version.prompt_text, variables)
        return final_prompt, prompt_version.id, "versioned"

    # No valid prompt source
    logger.warning("prompt_config has no versionId, familyId, or inlinePrompt")
    return None, None, "unknown"
