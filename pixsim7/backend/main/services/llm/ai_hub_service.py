"""
AI Hub Service - orchestrates LLM operations for prompt editing

This service manages AI-assisted prompt editing using configured LLM providers.
"""
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain import User, ProviderAccount, AiInteraction
from pixsim7.backend.main.services.llm.registry import llm_registry
from pixsim7.backend.main.services.ai_model import ai_model_registry, get_default_model
from pixsim7.backend.main.shared.schemas.ai_model_schemas import AiModelCapability
from pixsim7.backend.main.shared.errors import (
    ProviderNotFoundError,
    ProviderAuthenticationError,
    ProviderError,
)
import time

logger = logging.getLogger(__name__)


class AiHubService:
    """
    AI Hub service for LLM operations

    Handles:
    - LLM provider selection
    - Account management for LLM providers
    - Prompt editing operations
    - Interaction logging
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def edit_prompt(
        self,
        user: User,
        provider_id: str | None,
        model_id: str,
        prompt_before: str,
        context: dict | None = None,
        generation_id: int | None = None,
    ) -> dict:
        """
        Edit/refine a prompt using an LLM

        Args:
            user: User making the request
            provider_id: LLM provider ID (e.g., "openai-llm"), None = use default
            model_id: Model to use (e.g., "gpt-4", "claude-sonnet-4")
            prompt_before: Original prompt to edit
            context: Optional context (generation metadata, user preferences)
            generation_id: Optional generation ID to link interaction to

        Returns:
            Dict with:
                - prompt_after: Edited prompt
                - model_id: Model used
                - provider_id: Provider used
                - interaction_id: AiInteraction record ID (once we create the model)

        Raises:
            ProviderNotFoundError: Provider not found
            ProviderAuthenticationError: Authentication failed
            ProviderError: LLM API error
        """
        # Resolve provider_id from AI model catalog if not specified
        if not provider_id:
            try:
                # Get default model for prompt_edit capability
                default_model_id = await get_default_model(
                    self.db,
                    AiModelCapability.PROMPT_EDIT,
                    scope_type="global",
                    scope_id=None
                )
                # Look up the model in the registry to get its provider_id
                model = ai_model_registry.get(default_model_id)
                if model:
                    provider_id = model.provider_id
                    logger.info(
                        f"Using default model '{default_model_id}' with provider '{provider_id}' "
                        f"for prompt editing"
                    )
                else:
                    # Fallback to hardcoded default if model not found
                    provider_id = "openai-llm"
                    logger.warning(
                        f"Default model '{default_model_id}' not found in registry, "
                        f"falling back to '{provider_id}'"
                    )
            except Exception as e:
                # Fallback to hardcoded default if lookup fails
                provider_id = "openai-llm"
                logger.warning(
                    f"Failed to lookup default model for prompt editing: {e}, "
                    f"falling back to '{provider_id}'"
                )

        logger.info(
            f"AI Hub edit_prompt: user={user.id}, provider={provider_id}, "
            f"model={model_id}, gen_id={generation_id}"
        )

        # Simple per-user rate limiting (in-process)
        # Prevents accidental hammering from dev tools
        now = time.time()
        if not hasattr(self, "_last_edit_ts"):
            self._last_edit_ts: dict[int, float] = {}
        last = self._last_edit_ts.get(user.id)
        # Require at least 1 second between edits per user/process
        if last and (now - last) < 1.0:
            raise ProviderError(
                provider_id,
                "Too many prompt edits; please wait a moment and try again.",
            )
        self._last_edit_ts[user.id] = now

        # Get LLM provider from registry
        try:
            llm_provider = llm_registry.get(provider_id)
        except ProviderNotFoundError:
            logger.error(f"LLM provider not found: {provider_id}")
            raise

        # Get account for this provider (if configured)
        # For now, we'll use API keys from environment
        # Later, users can configure LLM accounts in the database
        account = await self._get_llm_account(user, provider_id)

        # Call LLM provider to edit prompt
        try:
            prompt_after = await llm_provider.edit_prompt(
                model_id=model_id,
                prompt_before=prompt_before,
                context=context,
                account=account
            )
        except Exception as e:
            logger.error(f"LLM provider edit failed: {e}")
            raise

        # Log interaction to database
        interaction = AiInteraction(
            user_id=user.id,
            generation_id=generation_id,
            provider_id=provider_id,
            model_id=model_id,
            prompt_before=prompt_before,
            prompt_after=prompt_after,
        )

        self.db.add(interaction)
        await self.db.commit()
        await self.db.refresh(interaction)

        logger.info(
            f"Prompt edited successfully: {len(prompt_before)} -> {len(prompt_after)} chars "
            f"(interaction_id={interaction.id})"
        )

        return {
            "prompt_after": prompt_after,
            "model_id": model_id,
            "provider_id": provider_id,
            "interaction_id": interaction.id,
        }

    async def _get_llm_account(
        self,
        user: User,
        provider_id: str
    ) -> Optional[ProviderAccount]:
        """
        Get LLM provider account for user

        Args:
            user: User
            provider_id: LLM provider ID

        Returns:
            ProviderAccount if configured, None otherwise
            (falls back to environment API keys)
        """
        # Query for user's account for this LLM provider
        stmt = (
            select(ProviderAccount)
            .where(
                ProviderAccount.user_id == user.id,
                ProviderAccount.provider_id == provider_id,
            )
        )
        result = await self.db.execute(stmt)
        account = result.scalar_one_or_none()

        if account:
            logger.debug("Using configured LLM account for %s", provider_id)
            return account

        # No account configured - will use environment API keys
        logger.debug(f"No account for {provider_id}, using environment API keys")
        return None

    def get_available_providers(self) -> list[dict]:
        """
        Get list of available LLM providers

        Returns:
            List of provider info dicts
        """
        providers = []
        for provider_id in llm_registry.list_provider_ids():
            providers.append({
                "provider_id": provider_id,
                "name": provider_id.replace("-llm", "").title(),
            })
        return providers

    async def list_interactions(
        self,
        user: User,
        generation_id: int | None = None,
    ) -> list[AiInteraction]:
        """
        List AI interactions for a user, optionally filtered by generation_id.
        Newest-first order.
        """
        stmt = select(AiInteraction).where(AiInteraction.user_id == user.id)
        if generation_id is not None:
            stmt = stmt.where(AiInteraction.generation_id == generation_id)
        stmt = stmt.order_by(AiInteraction.created_at.desc())

        result = await self.db.execute(stmt)
        return list(result.scalars().all())
