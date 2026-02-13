"""
PromptAnalysisService

Orchestrates prompt analysis and persistence.
Keeps adapters pure (no DB), handles storage decisions here.

Credential resolution for LLM analyzers:
  When an LLM-kind analyzer runs (e.g. prompt:claude), the service looks up
  UserAISettings for the requesting user's API keys, so credentials configured
  in the Providers panel are automatically available — no need to duplicate
  them in a separate AnalyzerInstance config.
"""

import hashlib
import logging
from typing import Optional, Dict, Any, Tuple, List
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain.prompt import PromptVersion
from pixsim7.backend.main.services.prompt.parser import analyzer_registry, AnalyzerKind
from pixsim7.backend.main.services.prompt.role_registry import PromptRoleRegistry
from pixsim7.backend.main.services.prompt.semantic_context import (
    PromptSemanticContext,
    build_prompt_semantic_context,
)

# Maps LLM provider IDs to the corresponding UserAISettings field name
_PROVIDER_TO_AI_SETTINGS_KEY: Dict[str, str] = {
    "anthropic-llm": "anthropic_api_key",
    "openai-llm": "openai_api_key",
}

logger = logging.getLogger(__name__)


class PromptAnalysisService:
    """
    Prompt analysis service.

    Two main operations:
    - analyze(): Pure analysis, no storage (for preview/dev tools)
    - analyze_and_attach_version(): Find-or-create PromptVersion with analysis

    Analyzer selection:
    - Uses analyzer_registry to dispatch to appropriate analyzer
    - Supports prompt:simple, prompt:claude, prompt:openai (extensible)
    """

    def __init__(self, db: Optional[AsyncSession] = None):
        """
        Initialize service.

        Args:
            db: Database session (optional - only needed for storage operations)
        """
        self.db = db

    async def analyze(
        self,
        text: str,
        analyzer_id: Optional[str] = None,
        *,
        preset_id: Optional[str] = None,
        provider_id: Optional[str] = None,
        model_id: Optional[str] = None,
        instance_config: Optional[Dict[str, Any]] = None,
        pack_ids: Optional[List[str]] = None,
        semantic_context: Optional[PromptSemanticContext] = None,
        user_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Analyze prompt text without storage.

        Pure analysis - no database access, returns JSON result.
        Use for preview, dev tools, Quick Generate preview.

        Args:
            text: Prompt text to analyze
            analyzer_id: Analyzer to use (default: prompt:simple)
            preset_id: Optional analyzer preset to apply
            pack_ids: Optional semantic pack IDs to extend role registry/hints
            semantic_context: Pre-built semantic context (overrides pack_ids)
            user_id: Optional user ID — when provided, LLM analyzers will
                use the user's AI provider credentials from UserAISettings

        Returns:
            Analysis result dict:
            {
                "prompt": "original text",
                "candidates": [...],
                "tags": [...],
                "analyzer_id": "prompt:simple"
            }
        """
        analyzer_id = analyzer_id or "prompt:simple"
        normalized = text.strip()

        logger.debug(f"Analyzing prompt with {analyzer_id}, len={len(normalized)}")

        # Dispatch to appropriate analyzer
        role_registry = await self._resolve_role_registry(
            pack_ids=pack_ids,
            semantic_context=semantic_context,
        )

        analysis = await self._run_analyzer(
            normalized,
            analyzer_id,
            role_registry=role_registry,
            preset_id=preset_id,
            provider_id=provider_id,
            model_id=model_id,
            instance_config=instance_config,
            user_id=user_id,
        )

        # Ensure analyzer_id is in result
        analysis["analyzer_id"] = analyzer_id

        return analysis

    async def analyze_and_attach_version(
        self,
        text: str,
        analyzer_id: Optional[str] = None,
        author: Optional[str] = None,
        family_hint: Optional[UUID] = None,
        force_reanalyze: bool = False,
        *,
        pack_ids: Optional[List[str]] = None,
        semantic_context: Optional[PromptSemanticContext] = None,
        precomputed_analysis: Optional[Dict[str, Any]] = None,
        user_id: Optional[int] = None,
    ) -> Tuple[PromptVersion, bool]:
        """
        Find or create PromptVersion with analysis.

        - Same prompt text → same PromptVersion (by hash)
        - If existing version has no analysis or different analyzer, recomputes
        - One-off prompts have family_id = NULL

        Args:
            text: Prompt text
            analyzer_id: Analyzer to use (default: prompt:simple). Set to None
                if providing precomputed_analysis to skip re-analysis.
            author: Optional author identifier
            family_hint: Optional family UUID (for versioned prompts)
            force_reanalyze: Force re-analysis even if already analyzed
            pack_ids: Optional semantic pack IDs to extend role registry/hints
            semantic_context: Pre-built semantic context (overrides pack_ids)
            precomputed_analysis: Pre-computed analysis from block composition.
                If provided, skips analyzer call. Must match analyzer output shape:
                {"prompt": "...", "candidates": [...], "tags": [...], "source": "composition"}

        Returns:
            Tuple of (PromptVersion, created) where created is True if new

        Raises:
            RuntimeError: If db session not provided
        """
        if not self.db:
            raise RuntimeError("Database session required for analyze_and_attach_version")

        # Determine effective analyzer ID
        # If precomputed_analysis provided, use its source; otherwise default to prompt:simple
        if precomputed_analysis:
            effective_analyzer = precomputed_analysis.get("source", "composition")
        else:
            effective_analyzer = analyzer_id or "prompt:simple"

        normalized = text.strip()
        prompt_hash = self._compute_hash(normalized)

        # Try to find existing by hash (dedup on text only, not analysis)
        result = await self.db.execute(
            select(PromptVersion).where(PromptVersion.prompt_hash == prompt_hash)
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Check if we need to (re)analyze
            # Skip if we have precomputed analysis and existing has any analysis
            if precomputed_analysis and existing.prompt_analysis and not force_reanalyze:
                # Existing version already has analysis, reuse it
                return existing, False

            needs_analysis = (
                force_reanalyze
                or not existing.prompt_analysis
                or (
                    not precomputed_analysis
                    and existing.prompt_analysis.get("analyzer_id") != effective_analyzer
                )
            )

            if needs_analysis:
                if precomputed_analysis:
                    logger.info(f"Attaching precomputed analysis to PromptVersion {existing.id}")
                    analysis = precomputed_analysis
                else:
                    logger.info(f"Re-analyzing PromptVersion {existing.id} with {effective_analyzer}")
                    analysis = await self.analyze(
                        normalized,
                        effective_analyzer,
                        pack_ids=pack_ids,
                        semantic_context=semantic_context,
                        user_id=user_id,
                    )
                existing.prompt_analysis = analysis
                existing.updated_at = datetime.now(timezone.utc)
                await self.db.flush()

            return existing, False

        # Create new PromptVersion with analysis
        if precomputed_analysis:
            logger.info(f"Creating new PromptVersion for hash {prompt_hash[:16]}... (precomputed from {effective_analyzer})")
            analysis = precomputed_analysis
        else:
            logger.info(f"Creating new PromptVersion for hash {prompt_hash[:16]}... (analyzer={effective_analyzer})")
            analysis = await self.analyze(
                normalized,
                effective_analyzer,
                pack_ids=pack_ids,
                semantic_context=semantic_context,
                user_id=user_id,
            )

        new_version = PromptVersion(
            prompt_text=normalized,
            prompt_hash=prompt_hash,
            prompt_analysis=analysis,
            family_id=family_hint,
            version_number=None if family_hint is None else 1,
            author=author,
            created_at=datetime.now(timezone.utc),
        )

        self.db.add(new_version)
        await self.db.flush()

        logger.info(f"Created PromptVersion {new_version.id} with {len(analysis.get('candidates', []))} candidates")
        return new_version, True

    async def reanalyze_version(
        self,
        version_id: UUID,
        analyzer_id: Optional[str] = None,
        *,
        pack_ids: Optional[List[str]] = None,
        semantic_context: Optional[PromptSemanticContext] = None,
        user_id: Optional[int] = None,
    ) -> Optional[PromptVersion]:
        """
        Re-analyze an existing PromptVersion.

        Useful when:
        - Analyzer or ontology updated
        - Switching from simple to LLM analyzer
        - Batch re-processing

        Args:
            version_id: PromptVersion UUID
            analyzer_id: Analyzer to use (default: prompt:simple)

        Returns:
            Updated PromptVersion, or None if not found

        Raises:
            RuntimeError: If db session not provided
        """
        if not self.db:
            raise RuntimeError("Database session required for reanalyze_version")

        analyzer_id = analyzer_id or "prompt:simple"

        result = await self.db.execute(
            select(PromptVersion).where(PromptVersion.id == version_id)
        )
        version = result.scalar_one_or_none()

        if not version:
            logger.warning(f"PromptVersion {version_id} not found for re-analysis")
            return None

        logger.info(f"Re-analyzing PromptVersion {version_id} with {analyzer_id}")

        analysis = await self.analyze(
            version.prompt_text,
            analyzer_id,
            pack_ids=pack_ids,
            semantic_context=semantic_context,
            user_id=user_id,
        )
        version.prompt_analysis = analysis
        version.updated_at = datetime.now(timezone.utc)

        await self.db.flush()

        return version

    async def _run_analyzer(
        self,
        text: str,
        analyzer_id: str,
        *,
        role_registry: Optional[PromptRoleRegistry] = None,
        preset_id: Optional[str] = None,
        provider_id: Optional[str] = None,
        model_id: Optional[str] = None,
        instance_config: Optional[Dict[str, Any]] = None,
        user_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Run the specified analyzer on text.

        Dispatches to appropriate adapter based on analyzer_id.
        For LLM analyzers, injects user AI credentials from UserAISettings
        when available (so users don't need to duplicate API keys in
        analyzer instance configs).
        """
        # Check if analyzer exists
        analyzer_id = analyzer_registry.resolve_legacy(analyzer_id)
        analyzer_info = analyzer_registry.get(analyzer_id)
        if not analyzer_info:
            logger.warning(f"Unknown analyzer {analyzer_id}, falling back to prompt:simple")
            analyzer_id = "prompt:simple"
            analyzer_info = analyzer_registry.get(analyzer_id)

        merged_config = _resolve_analyzer_config(
            analyzer_info.config if analyzer_info else None,
            instance_config,
            preset_id,
        )

        # Dispatch based on analyzer kind
        if analyzer_info and analyzer_info.kind == AnalyzerKind.PARSER:
            # Use simple parser adapter
            from pixsim7.backend.main.services.prompt.parser import analyze_prompt
            return await analyze_prompt(
                text,
                analyzer_id=None,
                role_registry=role_registry,
            )  # adapter handles internally

        elif analyzer_info and analyzer_info.kind == AnalyzerKind.LLM:
            # Use LLM analyzer
            from pixsim7.backend.main.services.prompt.parser import analyze_prompt_with_llm

            # Map to provider
            provider_map = {
                "prompt:claude": "anthropic-llm",
                "prompt:openai": "openai-llm",
                "llm:claude": "anthropic-llm",
                "llm:openai": "openai-llm",
            }
            resolved_provider = (
                provider_id
                or analyzer_info.provider_id
                or provider_map.get(analyzer_id, "anthropic-llm")
            )
            resolved_model = model_id or analyzer_info.model_id

            # Inject user AI credentials if not already in config
            merged_config = await self._inject_user_ai_credentials(
                merged_config, resolved_provider, user_id,
            )

            return await analyze_prompt_with_llm(
                text=text,
                provider_id=resolved_provider,
                model_id=resolved_model,
                role_registry=role_registry,
                instance_config=merged_config,
            )

        else:
            # Unknown - fall back to simple
            logger.warning(f"No handler for analyzer {analyzer_id}, using simple parser")
            from pixsim7.backend.main.services.prompt.parser import analyze_prompt
            return await analyze_prompt(
                text,
                analyzer_id=None,
                role_registry=role_registry,
            )

    async def _inject_user_ai_credentials(
        self,
        config: Optional[Dict[str, Any]],
        provider_id: str,
        user_id: Optional[int],
    ) -> Optional[Dict[str, Any]]:
        """
        Inject the user's AI provider API key into analyzer config.

        Looks up UserAISettings for the user and maps the resolved provider_id
        to the appropriate API key field.  Only injects if:
        - user_id and db session are available
        - the config doesn't already contain an api_key
        - UserAISettings has a key for this provider

        This bridges the Providers panel (where users store API keys) with the
        analyzer system (which previously required separate AnalyzerInstance
        configs with duplicated keys).
        """
        # Skip if config already has an api_key or no user context
        if not user_id or not self.db:
            return config

        settings_field = _PROVIDER_TO_AI_SETTINGS_KEY.get(provider_id)
        if not settings_field:
            return config

        # Don't overwrite an explicitly-provided api_key
        if config and config.get("api_key"):
            return config

        try:
            from pixsim7.backend.main.domain.core.user_ai_settings import UserAISettings

            result = await self.db.execute(
                select(UserAISettings).where(UserAISettings.user_id == user_id)
            )
            user_settings = result.scalar_one_or_none()

            if not user_settings:
                return config

            api_key = getattr(user_settings, settings_field, None)
            if not api_key:
                return config

            logger.debug(
                f"Injecting {settings_field} from UserAISettings into "
                f"analyzer config for provider {provider_id}"
            )

            merged = dict(config) if config else {}
            merged["api_key"] = api_key
            return merged

        except Exception as e:
            logger.warning(f"Failed to load UserAISettings for user {user_id}: {e}")
            return config

    async def _resolve_role_registry(
        self,
        *,
        pack_ids: Optional[List[str]] = None,
        semantic_context: Optional[PromptSemanticContext] = None,
    ) -> Optional[PromptRoleRegistry]:
        if semantic_context:
            return semantic_context.role_registry
        if not pack_ids:
            return None
        if not self.db:
            raise RuntimeError("Database session required to load semantic packs for analysis")
        context = await build_prompt_semantic_context(self.db, pack_ids=pack_ids)
        return context.role_registry

    def _compute_hash(self, text: str) -> str:
        """Compute SHA256 hash of normalized prompt text."""
        return hashlib.sha256(text.encode('utf-8')).hexdigest()


def _resolve_analyzer_config(
    base_config: Optional[Dict[str, Any]],
    instance_config: Optional[Dict[str, Any]],
    request_preset_id: Optional[str],
) -> Optional[Dict[str, Any]]:
    if not base_config and not instance_config and not request_preset_id:
        return None

    base_config = base_config if isinstance(base_config, dict) else {}
    instance_config = instance_config if isinstance(instance_config, dict) else {}

    presets = base_config.get("presets")
    presets_map = presets if isinstance(presets, dict) else {}

    instance_preset_id = instance_config.get("preset_id")
    base_preset_id = base_config.get("preset_id")
    default_preset_id = base_config.get("default_preset")

    effective_preset_id = (
        request_preset_id
        or instance_preset_id
        or base_preset_id
        or default_preset_id
    )

    preset_config: Dict[str, Any] = {}
    if effective_preset_id and presets_map:
        preset_value = presets_map.get(effective_preset_id)
        if isinstance(preset_value, dict):
            preset_config = preset_value
        else:
            logger.warning(
                "analyzer_preset_missing",
                preset_id=effective_preset_id,
            )

    merged = {}
    merged.update(_strip_config_meta(base_config))
    merged.update(preset_config)
    merged.update(_strip_config_meta(instance_config))

    return merged or None


def _strip_config_meta(config: Dict[str, Any]) -> Dict[str, Any]:
    stripped = {}
    for key, value in config.items():
        if key in {"presets", "default_preset", "preset_id"}:
            continue
        stripped[key] = value
    return stripped
