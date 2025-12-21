"""
AI Hub Service - orchestrates LLM operations for prompt editing

This service manages AI-assisted prompt editing using configured LLM providers.
"""
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain import User, AiInteraction
from pixsim7.backend.main.domain.providers import ProviderAccount
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

    async def suggest_prompt_categories(
        self,
        user: User,
        model_id: Optional[str],
        prompt_text: str,
        analysis_context: dict,
    ) -> dict:
        """
        Call an LLM model to suggest ontology IDs, semantic pack entries,
        and candidate ActionBlocks for a given prompt and context.

        This is used by the Category Discovery feature in Prompt Lab to help
        identify gaps in parser/ontology coverage and suggest new semantic elements.

        Args:
            user: User making the request
            model_id: Model to use (None = use default prompt_edit model)
            prompt_text: The prompt to analyze
            analysis_context: Dict with:
                - blocks: List of parsed blocks from SimplePromptParser
                - tags: List of auto-generated tags
                - existing_ontology_ids: List of ontology IDs already found
                - world_id: Optional world context
                - pack_ids: Optional semantic pack IDs for context
                - use_case: Optional hint about prompt usage

        Returns:
            Dict with:
                - suggested_ontology_ids: List of SuggestedOntologyId dicts
                - suggested_packs: List of SuggestedPackEntry dicts
                - suggested_action_blocks: List of SuggestedActionBlock dicts

        Raises:
            ProviderError: If LLM call fails
        """
        # Build the analysis prompt for the LLM
        system_prompt = self._build_category_discovery_system_prompt()
        user_prompt = self._build_category_discovery_user_prompt(
            prompt_text=prompt_text,
            analysis_context=analysis_context,
        )

        # Resolve provider_id and model_id
        if not model_id:
            try:
                # Get default model for prompt_edit capability
                model_id = await get_default_model(
                    self.db,
                    AiModelCapability.PROMPT_EDIT,
                    scope_type="global",
                    scope_id=None
                )
            except Exception as e:
                # Fallback to a reasonable default
                model_id = "gpt-4"
                logger.warning(
                    f"Failed to lookup default model for category discovery: {e}, "
                    f"falling back to '{model_id}'"
                )

        # Get provider from model
        provider_id: Optional[str] = None
        try:
            model = ai_model_registry.get(model_id)
            if model:
                provider_id = model.provider_id
            else:
                provider_id = "openai-llm"
                logger.warning(
                    f"Model '{model_id}' not found in registry, "
                    f"falling back to '{provider_id}'"
                )
        except Exception:
            provider_id = "openai-llm"

        logger.info(
            f"AI Hub category discovery: user={user.id}, provider={provider_id}, "
            f"model={model_id}, prompt_len={len(prompt_text)}"
        )

        # Get LLM provider
        try:
            llm_provider = llm_registry.get(provider_id)
        except ProviderNotFoundError:
            logger.error(f"LLM provider not found: {provider_id}")
            raise

        # Get account
        account = await self._get_llm_account(user, provider_id)

        # Build the full prompt with system + user instructions
        full_prompt = f"{system_prompt}\n\n{user_prompt}"

        # Call LLM provider
        # Note: We use edit_prompt's infrastructure but with our own prompt
        try:
            # Call the provider directly with the analysis prompt
            # Since edit_prompt expects prompt_before, we'll use a lower-level call
            # For now, we'll use edit_prompt with a special context flag
            context = {
                "mode": "category_analysis",
                "analysis_context": analysis_context,
            }

            response_text = await llm_provider.edit_prompt(
                model_id=model_id,
                prompt_before=full_prompt,
                context=context,
                account=account
            )
        except Exception as e:
            logger.error(f"LLM provider category suggestion failed: {e}")
            raise ProviderError(provider_id, f"Category suggestion failed: {str(e)}")

        # Parse the JSON response
        import json
        try:
            # The response should be pure JSON
            # Clean any markdown code fences if present
            cleaned_response = response_text.strip()
            if cleaned_response.startswith("```json"):
                cleaned_response = cleaned_response[7:]
            if cleaned_response.startswith("```"):
                cleaned_response = cleaned_response[3:]
            if cleaned_response.endswith("```"):
                cleaned_response = cleaned_response[:-3]
            cleaned_response = cleaned_response.strip()

            suggestions = json.loads(cleaned_response)
        except json.JSONDecodeError as e:
            logger.error(
                f"Failed to parse LLM response as JSON: {e}\n"
                f"Raw response: {response_text[:500]}"
            )
            # Return empty suggestions rather than failing
            suggestions = {
                "suggested_ontology_ids": [],
                "suggested_packs": [],
                "suggested_action_blocks": [],
            }

        # Ensure all required fields are present
        if "suggested_ontology_ids" not in suggestions:
            suggestions["suggested_ontology_ids"] = []
        if "suggested_packs" not in suggestions:
            suggestions["suggested_packs"] = []
        if "suggested_action_blocks" not in suggestions:
            suggestions["suggested_action_blocks"] = []

        logger.info(
            f"Category discovery suggestions generated: "
            f"{len(suggestions['suggested_ontology_ids'])} ontology IDs, "
            f"{len(suggestions['suggested_packs'])} packs, "
            f"{len(suggestions['suggested_action_blocks'])} action blocks"
        )

        return suggestions

    def _build_category_discovery_system_prompt(self) -> str:
        """Build the system prompt for category discovery."""
        return """You are a semantic ontology and prompt category expert for an adult visual novel generation system.

Your task is to analyze prompts and suggest:
1. Ontology IDs: Semantic categories that describe actions, states, anatomy parts, camera angles, etc.
2. Semantic Pack entries: Collections of related parser hints that help classify similar prompts
3. ActionBlocks: Reusable prompt building blocks with semantic tags

Guidelines:
- PREFER reusing existing ontology IDs when possible
- Only suggest NEW ontology IDs when existing ones don't capture the semantics
- Ontology ID format: "category:name" (e.g., "act:movement", "state:aroused", "part:shaft", "cam:pov")
- Ontology categories: action, state, part (anatomy), manner, agency, camera
- Be conservative: suggest only high-confidence additions
- Consider adult/NSFW content as valid and appropriate for this system

Response format: Valid JSON object with these exact keys:
{
  "suggested_ontology_ids": [
    {
      "id": "act:example",
      "label": "Human-readable label",
      "description": "What this represents",
      "kind": "action|state|part|manner|agency|camera",
      "confidence": 0.0-1.0
    }
  ],
  "suggested_packs": [
    {
      "pack_id": "suggested_pack_slug",
      "pack_label": "Human-readable pack name",
      "parser_hints": {
        "role:action": ["verb1", "verb2"],
        "role:character": ["noun1", "noun2"]
      },
      "notes": "Why this pack is useful"
    }
  ],
  "suggested_action_blocks": [
    {
      "block_id": "suggested_block_slug",
      "prompt": "The actual prompt text for this block",
      "tags": {
        "ontology_ids": ["act:example"],
        "intensity": "medium",
        "category": "example"
      },
      "notes": "When to use this block"
    }
  ]
}

CRITICAL: Return ONLY the JSON object, no other text."""

    def _build_category_discovery_user_prompt(
        self,
        prompt_text: str,
        analysis_context: dict,
    ) -> str:
        """Build the user prompt for category discovery."""
        blocks = analysis_context.get("blocks", [])
        tags = analysis_context.get("tags", [])
        existing_ids = analysis_context.get("existing_ontology_ids", [])
        world_id = analysis_context.get("world_id")
        pack_ids = analysis_context.get("pack_ids", [])
        use_case = analysis_context.get("use_case")

        # Build context summary
        context_parts = []
        if world_id:
            context_parts.append(f"World: {world_id}")
        if pack_ids:
            context_parts.append(f"Active packs: {', '.join(pack_ids)}")
        if use_case:
            context_parts.append(f"Use case: {use_case}")

        context_str = "\n".join(context_parts) if context_parts else "No additional context"

        # Build blocks summary
        blocks_str = "\n".join([
            f"  - {b.get('role', 'other')}: {b.get('text', '')}"
            for b in blocks
        ]) if blocks else "  (no blocks parsed)"

        # Build tags summary
        tags_str = ", ".join(tags) if tags else "(no tags)"

        # Build existing ontology IDs summary
        existing_str = ", ".join(existing_ids) if existing_ids else "(none found)"

        return f"""Analyze this prompt and suggest semantic categories:

PROMPT:
{prompt_text}

CURRENT ANALYSIS:
{context_str}

Parser detected these blocks:
{blocks_str}

Auto-generated tags: {tags_str}
Existing ontology IDs: {existing_str}

Based on this analysis:
1. What ontology IDs are missing or would better describe this prompt's semantics?
2. What semantic pack entries would help the parser classify similar prompts?
3. What reusable ActionBlocks could be extracted from this prompt?

Return your suggestions as a JSON object following the specified schema."""

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
        Get list of available LLM providers with metadata

        Returns:
            List of provider info dicts with:
            - provider_id: Unique identifier
            - name: Display name
            - description: Provider description
            - requires_credentials: Whether API keys are needed
        """
        providers = []
        for provider_id in llm_registry.list_provider_ids():
            provider = llm_registry.get(provider_id)

            # Try to get metadata from manifest
            manifest = getattr(provider, '_manifest', None)
            if manifest:
                providers.append({
                    "provider_id": provider_id,
                    "name": manifest.name,
                    "description": manifest.description,
                    "requires_credentials": manifest.requires_credentials,
                })
            else:
                # Fallback for providers without manifest
                providers.append({
                    "provider_id": provider_id,
                    "name": provider_id.replace("-llm", "").title(),
                    "description": "",
                    "requires_credentials": True,
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
