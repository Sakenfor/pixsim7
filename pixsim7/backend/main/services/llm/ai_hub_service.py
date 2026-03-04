"""
AI Hub Service - orchestrates LLM operations for prompt editing

This service manages AI-assisted prompt editing using configured LLM providers.
"""
import logging
from typing import Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain import User, AiInteraction
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.services.llm.registry import llm_registry
from pixsim7.backend.main.services.ai_model import ai_model_registry, get_default_model
from pixsim7.backend.main.services.prompt.llm_resolution import normalize_llm_provider_id
from pixsim7.backend.main.shared.schemas.ai_model_schemas import AiModelCapability
from pixsim7.backend.main.shared.errors import (
    ProviderNotFoundError,
    ProviderAuthenticationError,
    ProviderError,
)
import time

logger = logging.getLogger(__name__)

_PROVIDER_TO_AI_SETTINGS_KEY = {
    "anthropic-llm": "anthropic_api_key",
    "openai-llm": "openai_api_key",
}

_DEFAULT_MODEL_BY_PROVIDER = {
    "anthropic-llm": "claude-sonnet-4-20250514",
    "openai-llm": "gpt-4",
    "local-llm": "smollm2-1.7b",
}


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

    async def execute_prompt(
        self,
        *,
        provider_id: str | None,
        model_id: str | None,
        prompt_before: str,
        context: dict | None = None,
        user: User | None = None,
        user_id: int | None = None,
        instance_id: int | None = None,
        instance_config: dict | None = None,
        enforce_rate_limit: bool = False,
    ) -> dict:
        """
        Execute an LLM prompt call with centralized provider/model/account resolution.

        This is the shared runtime path used by AI Hub and prompt analyzers.
        """
        resolved_user_id = user.id if user is not None else user_id
        resolved_provider_id, resolved_model_id = await self._resolve_provider_and_model(
            provider_id=provider_id,
            model_id=model_id,
        )

        if enforce_rate_limit and resolved_user_id is not None:
            self._apply_rate_limit(
                user_id=resolved_user_id,
                provider_id=resolved_provider_id,
            )

        try:
            llm_provider = llm_registry.get(resolved_provider_id)
        except ProviderNotFoundError:
            logger.error(f"LLM provider not found: {resolved_provider_id}")
            raise

        resolved_user = user
        if resolved_user is None and resolved_user_id is not None:
            resolved_user = await self._get_user(resolved_user_id)

        account = None
        if resolved_user is not None:
            account = await self._get_llm_account(resolved_user, resolved_provider_id)

        resolved_instance_config: dict | None = None
        if instance_id:
            resolved_instance_config = await self._get_instance_config(
                instance_id,
                resolved_provider_id,
            )

        merged_config = {}
        if isinstance(resolved_instance_config, dict):
            merged_config.update(resolved_instance_config)
        if isinstance(instance_config, dict):
            merged_config.update(instance_config)

        user_settings = await self._load_user_ai_settings(resolved_user_id)
        effective_instance_config = self._inject_api_key_from_settings(
            merged_config or None,
            resolved_provider_id,
            user_settings,
        )

        try:
            prompt_after = await llm_provider.edit_prompt(
                model_id=resolved_model_id,
                prompt_before=prompt_before,
                context=context,
                account=account,
                instance_config=effective_instance_config,
            )
        except Exception as e:
            logger.error(f"LLM provider edit failed: {e}")
            raise

        return {
            "prompt_after": prompt_after,
            "provider_id": resolved_provider_id,
            "model_id": resolved_model_id,
        }

    async def get_user_llm_preferences(
        self,
        user_id: int | None,
    ) -> tuple[Optional[str], Optional[str]]:
        """
        Return normalized provider/model preferences from UserAISettings.
        """
        user_settings = await self._load_user_ai_settings(user_id)
        if not user_settings:
            return None, None
        return (
            normalize_llm_provider_id(getattr(user_settings, "llm_provider", None)),
            getattr(user_settings, "llm_default_model", None),
        )

    async def resolve_provider_and_model(
        self,
        *,
        provider_id: str | None,
        model_id: str | None,
    ) -> tuple[str, str]:
        """
        Public wrapper for centralized provider/model resolution policy.
        """
        return await self._resolve_provider_and_model(
            provider_id=provider_id,
            model_id=model_id,
        )

    async def _resolve_provider_and_model(
        self,
        *,
        provider_id: str | None,
        model_id: str | None,
    ) -> tuple[str, str]:
        """
        Resolve effective provider/model for execution.

        Policy:
        - provider-bound calls stay provider-bound
        - AI-model capability defaults apply only when both provider/model are missing
        """
        resolved_model_id = model_id
        resolved_provider_id = normalize_llm_provider_id(provider_id) or provider_id
        model_provider_id: Optional[str] = None

        # If model is known in AI model catalog, infer provider from model.
        if resolved_model_id:
            try:
                model = ai_model_registry.get(resolved_model_id)
                if model:
                    model_provider_id = (
                        normalize_llm_provider_id(model.provider_id) or model.provider_id
                    )
            except Exception:
                model_provider_id = None

        if not resolved_provider_id and model_provider_id:
            resolved_provider_id = model_provider_id

        # If provider/model conflict, keep provider and drop model so we can
        # deterministically resolve a provider-compatible default model.
        if (
            resolved_provider_id
            and model_provider_id
            and model_provider_id != resolved_provider_id
        ):
            logger.warning(
                "llm_provider_model_mismatch provider=%s model=%s model_provider=%s",
                resolved_provider_id,
                resolved_model_id,
                model_provider_id,
            )
            resolved_model_id = None

        # Provider-known calls should stay provider-bound; resolve model from
        # provider defaults rather than cross-provider global capability defaults.
        if resolved_provider_id and not resolved_model_id:
            resolved_model_id = _DEFAULT_MODEL_BY_PROVIDER.get(resolved_provider_id)

        # Only fully-unspecified calls use AI model capability defaults.
        if not resolved_provider_id and not resolved_model_id:
            try:
                default_model_id = await get_default_model(
                    self.db,
                    AiModelCapability.PROMPT_EDIT,
                    scope_type="global",
                    scope_id=None,
                )
                default_model = ai_model_registry.get(default_model_id)
                if default_model:
                    resolved_provider_id = (
                        normalize_llm_provider_id(default_model.provider_id)
                        or default_model.provider_id
                    )
                    resolved_model_id = default_model_id
            except Exception as e:
                logger.warning(
                    f"Failed to lookup prompt-edit defaults: {e}"
                )

        if not resolved_provider_id:
            resolved_provider_id = "openai-llm"

        if not resolved_model_id:
            resolved_model_id = _DEFAULT_MODEL_BY_PROVIDER.get(
                resolved_provider_id,
                "gpt-4",
            )

        return resolved_provider_id, resolved_model_id

    def _apply_rate_limit(
        self,
        *,
        user_id: int,
        provider_id: str,
    ) -> None:
        """
        Simple in-process per-user rate limiting for edit flows.
        """
        now = time.time()
        if not hasattr(self, "_last_edit_ts"):
            self._last_edit_ts: dict[int, float] = {}
        last = self._last_edit_ts.get(user_id)
        if last and (now - last) < 1.0:
            raise ProviderError(
                provider_id,
                "Too many prompt edits; please wait a moment and try again.",
            )
        self._last_edit_ts[user_id] = now

    async def _get_user(self, user_id: int) -> Optional[User]:
        if not self.db:
            return None
        try:
            return await self.db.get(User, user_id)
        except Exception as e:
            logger.warning(f"Failed to load user {user_id}: {e}")
            return None

    async def edit_prompt(
        self,
        user: User,
        provider_id: str | None,
        model_id: str,
        prompt_before: str,
        context: dict | None = None,
        generation_id: int | None = None,
        instance_id: int | None = None,
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
            instance_id: Optional LLM instance ID for provider-specific config

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
        logger.info(
            f"AI Hub edit_prompt: user={user.id}, provider={provider_id}, "
            f"model={model_id}, gen_id={generation_id}"
        )

        execution = await self.execute_prompt(
            provider_id=provider_id,
            model_id=model_id,
            prompt_before=prompt_before,
            context=context,
            user=user,
            instance_id=instance_id,
            enforce_rate_limit=True,
        )
        prompt_after = execution["prompt_after"]
        resolved_provider_id = execution["provider_id"]
        resolved_model_id = execution["model_id"]

        # Log interaction to database
        interaction = AiInteraction(
            user_id=user.id,
            generation_id=generation_id,
            provider_id=resolved_provider_id,
            model_id=resolved_model_id,
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
            "model_id": resolved_model_id,
            "provider_id": resolved_provider_id,
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
        and prompt block candidates for a given prompt and context.

        This is used by the Category Discovery feature in Prompt Lab to help
        identify gaps in parser/ontology coverage and suggest new semantic elements.

        Args:
            user: User making the request
            model_id: Model to use (None = use default prompt_edit model)
            prompt_text: The prompt to analyze
            analysis_context: Dict with:
                - candidates: List of parsed candidates from prompt analysis
                - tags: List of auto-generated tags
                - existing_ontology_ids: List of ontology IDs already found
                - world_id: Optional world context
                - pack_ids: Optional semantic pack IDs for context
                - use_case: Optional hint about prompt usage

        Returns:
            Dict with:
                - suggested_ontology_ids: List of SuggestedOntologyId dicts
                - suggested_packs: List of SuggestedPackEntry dicts
                - suggested_candidates: List of PromptBlockCandidate dicts

        Raises:
            ProviderError: If LLM call fails
        """
        # Build the analysis prompt for the LLM
        system_prompt = self._build_category_discovery_system_prompt()
        user_prompt = self._build_category_discovery_user_prompt(
            prompt_text=prompt_text,
            analysis_context=analysis_context,
        )

        # Build the full prompt with system + user instructions
        full_prompt = f"{system_prompt}\n\n{user_prompt}"

        # Call LLM provider
        try:
            context = {
                "mode": "category_analysis",
                "analysis_context": analysis_context,
            }
            execution = await self.execute_prompt(
                provider_id=None,
                model_id=model_id,
                prompt_before=full_prompt,
                context=context,
                user=user,
            )
            response_text = execution["prompt_after"]
            resolved_provider_id = execution["provider_id"]
            resolved_model_id = execution["model_id"]
            logger.info(
                f"AI Hub category discovery: user={user.id}, provider={resolved_provider_id}, "
                f"model={resolved_model_id}, prompt_len={len(prompt_text)}"
            )
        except Exception as e:
            logger.error(f"LLM provider category suggestion failed: {e}")
            provider_hint = "openai-llm"
            if model_id:
                try:
                    model = ai_model_registry.get(model_id)
                    if model:
                        provider_hint = (
                            normalize_llm_provider_id(model.provider_id) or model.provider_id
                        )
                except Exception:
                    pass
            raise ProviderError(provider_hint, f"Category suggestion failed: {str(e)}")

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
                "suggested_candidates": [],
            }

        # Ensure all required fields are present
        if "suggested_ontology_ids" not in suggestions:
            suggestions["suggested_ontology_ids"] = []
        if "suggested_packs" not in suggestions:
            suggestions["suggested_packs"] = []
        if "suggested_candidates" not in suggestions:
            suggestions["suggested_candidates"] = []

        logger.info(
            f"Category discovery suggestions generated: "
            f"{len(suggestions['suggested_ontology_ids'])} ontology IDs, "
            f"{len(suggestions['suggested_packs'])} packs, "
            f"{len(suggestions['suggested_candidates'])} candidates"
        )

        return suggestions

    def _build_category_discovery_system_prompt(self) -> str:
        """Build the system prompt for category discovery."""
        return """You are a semantic ontology and prompt category expert for an adult visual novel generation system.

Your task is to analyze prompts and suggest:
1. Ontology IDs: Semantic categories that describe actions, states, anatomy parts, camera angles, etc.
2. Semantic Pack entries: Collections of related parser hints that help classify similar prompts
3. Prompt candidates: Reusable prompt building blocks with semantic tags

Guidelines:
- PREFER reusing existing ontology IDs when possible
- Only suggest NEW ontology IDs when existing ones don't capture the semantics
- Ontology ID format: "prefix:name" (e.g., "mood:tender", "camera:angle_pov", "spatial:orient_profile", "part:face")
- Canonical prefixes: mood, camera, spatial, location, pose, rating, part
- Be conservative: suggest only high-confidence additions
- Consider adult/NSFW content as valid and appropriate for this system

Response format: Valid JSON object with these exact keys:
{
  "suggested_ontology_ids": [
    {
      "id": "mood:example",
      "label": "Human-readable label",
      "description": "What this represents",
      "kind": "mood|camera|spatial|location|pose|rating|part|other",
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
  "suggested_candidates": [
    {
      "block_id": "suggested_block_slug",
      "text": "The actual prompt text for this block",
      "tags": {
        "ontology_ids": ["mood:example"],
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
        candidates = analysis_context.get("candidates", [])
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

        # Build candidates summary
        candidates_str = "\n".join([
            f"  - {b.get('role', 'other')}: {b.get('text', '')}"
            for b in candidates
        ]) if candidates else "  (no candidates parsed)"

        # Build tags summary
        tags_str = ", ".join(tags) if tags else "(no tags)"

        # Build existing ontology IDs summary
        existing_str = ", ".join(existing_ids) if existing_ids else "(none found)"

        return f"""Analyze this prompt and suggest semantic categories:

PROMPT:
{prompt_text}

CURRENT ANALYSIS:
{context_str}

Parser detected these candidates:
{candidates_str}

Auto-generated tags: {tags_str}
Existing ontology IDs: {existing_str}

Based on this analysis:
1. What ontology IDs are missing or would better describe this prompt's semantics?
2. What semantic pack entries would help the parser classify similar prompts?
3. What reusable prompt candidates could be extracted from this prompt?

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
        if not self.db:
            return None

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

    async def _get_instance_config(
        self,
        instance_id: int,
        provider_id: str,
    ) -> Optional[dict]:
        """
        Get instance config for a specific LLM instance.

        Args:
            instance_id: LLM instance ID
            provider_id: Expected provider ID (for validation)

        Returns:
            Instance config dict if found and enabled, None otherwise
        """
        if not self.db:
            return None

        from pixsim7.backend.main.services.llm.instance_service import LlmInstanceService

        service = LlmInstanceService(self.db)
        instance_config = await service.resolve_instance_config(
            provider_id=provider_id,
            instance_id=instance_id,
        )
        if instance_config is None:
            return None

        logger.debug(f"Using LLM instance {instance_id} config for {provider_id}")
        return instance_config

    async def _load_user_ai_settings(self, user_id: int | None) -> Optional[Any]:
        """
        Load UserAISettings for a user if available.
        """
        if not user_id or not self.db:
            return None

        try:
            from pixsim7.backend.main.domain.core.user_ai_settings import UserAISettings

            result = await self.db.execute(
                select(UserAISettings).where(UserAISettings.user_id == user_id)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.warning(f"Failed to load UserAISettings for user {user_id}: {e}")
            return None

    @staticmethod
    def _inject_api_key_from_settings(
        config: Optional[dict],
        provider_id: str,
        user_settings: Optional[Any],
    ) -> Optional[dict]:
        """
        Inject provider API key from UserAISettings when config has no explicit key.
        """
        if config and config.get("api_key"):
            return config

        if not user_settings:
            return config

        settings_field = _PROVIDER_TO_AI_SETTINGS_KEY.get(provider_id)
        if not settings_field:
            return config

        api_key = getattr(user_settings, settings_field, None)
        if not api_key:
            return config

        merged = dict(config) if config else {}
        merged["api_key"] = api_key
        return merged

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
