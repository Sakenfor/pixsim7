"""
PromptAnalysisService

Orchestrates prompt analysis and persistence.
Keeps adapters pure (no DB), handles storage decisions here.
"""

import hashlib
import logging
from typing import Optional, Dict, Any, Tuple, List
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain.prompt import PromptVersion
from pixsim7.backend.main.services.analysis.analyzer_defaults import (
    DEFAULT_PROMPT_ANALYZER_ID,
    normalize_analyzer_id_for_target,
    resolve_prompt_default_analyzer_ids,
)
from pixsim7.backend.main.services.analysis.analyzer_pipeline import (
    AnalyzerExecutionRequest,
    AnalyzerPipelineError,
    resolve_analyzer_execution,
)
from pixsim7.backend.main.services.analysis.chain_executor import execute_first_success
from pixsim7.backend.main.services.analysis.observability import log_analyzer_run
from pixsim7.backend.main.services.analysis.result_envelope import build_provenance
from pixsim7.backend.main.services.prompt.parser import (
    analyzer_registry,
    AnalyzerKind,
    AnalyzerTarget,
)
from pixsim7.backend.main.services.prompt.role_registry import PromptRoleRegistry
from pixsim7.backend.main.services.prompt.semantic_context import (
    PromptSemanticContext,
    build_prompt_semantic_context,
)

logger = logging.getLogger(__name__)

_SEQUENCE_ROLES = {"initial", "continuation", "transition"}


class PromptAnalysisService:
    """
    Prompt analysis service.

    Two main operations:
    - analyze(): Pure analysis, no storage (for preview/dev tools)
    - analyze_and_attach_version(): Find-or-create PromptVersion with analysis

    Analyzer selection:
    - Uses analyzer_registry to dispatch to appropriate analyzer
    - Supports prompt:simple, prompt:claude, prompt:openai, prompt:local (extensible)
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
        candidates = await self._resolve_prompt_analyzer_candidates(
            analyzer_id=analyzer_id,
            user_id=user_id,
        )
        normalized = text.strip()

        logger.debug(f"Analyzing prompt with candidates=%s, len={len(normalized)}", candidates)

        # Dispatch to appropriate analyzer
        role_registry = await self._resolve_role_registry(
            pack_ids=pack_ids,
            semantic_context=semantic_context,
        )

        analysis, selected_id, provenance = await self._run_analyzer(
            normalized,
            candidates,
            role_registry=role_registry,
            preset_id=preset_id,
            provider_id=provider_id,
            model_id=model_id,
            instance_config=instance_config,
            user_id=user_id,
        )

        # Ensure analyzer_id is in result
        analysis["analyzer_id"] = selected_id
        analysis["provenance"] = provenance.to_dict()
        _attach_sequence_context(analysis)

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
            candidates = await self._resolve_prompt_analyzer_candidates(
                analyzer_id=analyzer_id,
                user_id=user_id,
            )
            effective_analyzer = candidates[0]

        normalized = text.strip()
        prompt_hash = self._compute_hash(normalized)

        # Try to find existing by hash (dedup on text only, not analysis).
        # Use .first() instead of .scalar_one_or_none() because duplicate
        # hashes can exist (no unique constraint on prompt_hash).
        result = await self.db.execute(
            select(PromptVersion).where(PromptVersion.prompt_hash == prompt_hash)
        )
        existing = result.scalars().first()

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
                    analysis = dict(precomputed_analysis)
                    _attach_sequence_context(analysis)
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
                await self.db.flush()

            return existing, False

        # Create new PromptVersion with analysis
        if precomputed_analysis:
            logger.info(f"Creating new PromptVersion for hash {prompt_hash[:16]}... (precomputed from {effective_analyzer})")
            analysis = dict(precomputed_analysis)
            _attach_sequence_context(analysis)
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
            author=author,
            created_at=datetime.now(timezone.utc),
        )

        self.db.add(new_version)
        if family_hint is not None:
            # Reuse shared versioning write path to prevent family/version drift.
            from pixsim7.backend.main.services.prompt.git.versioning_adapter import (
                PromptVersioningService,
            )

            await PromptVersioningService(self.db).assign_version_metadata(
                new_version=new_version,
                family_id=family_hint,
                commit_message=None,
                parent_version=None,
            )
        else:
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

        candidates = await self._resolve_prompt_analyzer_candidates(
            analyzer_id=analyzer_id,
            user_id=user_id,
        )

        result = await self.db.execute(
            select(PromptVersion).where(PromptVersion.id == version_id)
        )
        version = result.scalar_one_or_none()

        if not version:
            logger.warning(f"PromptVersion {version_id} not found for re-analysis")
            return None

        effective_analyzer = candidates[0]
        logger.info(f"Re-analyzing PromptVersion {version_id} with {effective_analyzer}")

        analysis = await self.analyze(
            version.prompt_text,
            effective_analyzer,
            pack_ids=pack_ids,
            semantic_context=semantic_context,
            user_id=user_id,
        )
        version.prompt_analysis = analysis

        await self.db.flush()

        return version

    async def _resolve_prompt_analyzer_candidates(
        self,
        *,
        analyzer_id: Optional[str],
        user_id: Optional[int],
    ) -> List[str]:
        """Resolve ordered list of prompt analyzer candidates.

        When an explicit analyzer_id is given, it is placed first.
        The full user-preference list and hardcoded fallback are always
        appended so the chain executor can try them if the explicit
        pick fails.
        """
        candidates: List[str] = []

        if analyzer_id:
            resolved = normalize_analyzer_id_for_target(
                analyzer_id,
                AnalyzerTarget.PROMPT,
                require_enabled=False,
            )
            if resolved:
                candidates.append(resolved)

        user_preferences = await self._load_user_preferences(user_id)
        candidates.extend(resolve_prompt_default_analyzer_ids(user_preferences))

        return candidates

    async def _load_user_preferences(self, user_id: Optional[int]) -> Optional[Dict[str, Any]]:
        """Load users.preferences dict for analyzer-default resolution."""
        if not user_id or not self.db:
            return None

        try:
            from pixsim7.backend.main.domain import User

            user = await self.db.get(User, user_id)
            if not user or not isinstance(user.preferences, dict):
                return None
            return user.preferences
        except Exception as e:
            logger.warning(f"Failed to load preferences for user {user_id}: {e}")
            return None

    async def _run_analyzer(
        self,
        text: str,
        candidates: List[str],
        *,
        role_registry: Optional[PromptRoleRegistry] = None,
        preset_id: Optional[str] = None,
        provider_id: Optional[str] = None,
        model_id: Optional[str] = None,
        instance_config: Optional[Dict[str, Any]] = None,
        user_id: Optional[int] = None,
    ) -> Tuple[Dict[str, Any], str, "AnalyzerProvenance"]:
        """
        Run the first resolvable analyzer from *candidates* on text.

        Returns ``(analysis_result, selected_analyzer_id, provenance)``.
        """
        from pixsim7.backend.main.services.llm.ai_hub_service import AiHubService
        from pixsim7.backend.main.services.analysis.result_envelope import AnalyzerProvenance

        ai_hub = AiHubService(self.db)
        user_provider_id, user_model_id = await ai_hub.get_user_llm_preferences(user_id)

        async def _resolve_candidate(candidate_id: str):
            return resolve_analyzer_execution(
                AnalyzerExecutionRequest(
                    analyzer_id=candidate_id,
                    target=AnalyzerTarget.PROMPT,
                    require_enabled=False,
                    explicit_provider_id=provider_id,
                    explicit_model_id=model_id,
                    user_llm_provider_id=user_provider_id,
                    user_llm_model_id=user_model_id,
                    require_provider=False,
                )
            )

        chain_result = await execute_first_success(
            candidates=candidates,
            step_fn=_resolve_candidate,
        )

        if chain_result.success:
            resolved_execution = chain_result.result
            analyzer_id = resolved_execution.analyzer_id
            analyzer_info = resolved_execution.analyzer
        else:
            logger.warning(
                "All prompt analyzer candidates failed, using prompt:simple. %s",
                chain_result.error_summary,
            )
            analyzer_id = DEFAULT_PROMPT_ANALYZER_ID
            analyzer_info = analyzer_registry.get(analyzer_id)
            resolved_execution = resolve_analyzer_execution(
                AnalyzerExecutionRequest(
                    analyzer_id=analyzer_id,
                    target=AnalyzerTarget.PROMPT,
                    require_enabled=False,
                    require_provider=False,
                )
            )

        # Build provenance from chain result
        provenance = build_provenance(
            chain_result,
            provider_id=resolved_execution.provider_id,
            model_id=resolved_execution.model_id,
        )

        merged_config = _resolve_analyzer_config(
            analyzer_info.config if analyzer_info else None,
            instance_config,
            preset_id,
        )

        # Dispatch based on analyzer kind
        if analyzer_info and analyzer_info.kind == AnalyzerKind.PARSER:
            from pixsim7.backend.main.services.prompt.parser import analyze_prompt
            result = await analyze_prompt(
                text,
                role_registry=role_registry,
                parser_config=merged_config,
            )
        elif analyzer_info and analyzer_info.kind == AnalyzerKind.LLM:
            from pixsim7.backend.main.services.prompt.parser import analyze_prompt_with_llm

            result = await analyze_prompt_with_llm(
                text=text,
                provider_id=resolved_execution.provider_id,
                model_id=resolved_execution.model_id,
                role_registry=role_registry,
                instance_config=merged_config,
                db=self.db,
                user_id=user_id,
            )
        else:
            logger.warning(f"No handler for analyzer {analyzer_id}, using simple parser")
            from pixsim7.backend.main.services.prompt.parser import analyze_prompt
            result = await analyze_prompt(
                text,
                role_registry=role_registry,
            )

        # Emit structured log
        log_analyzer_run(
            provenance,
            path="prompt",
            success=True,
            candidate_count=len(candidates),
            empty_result=not result.get("candidates"),
        )

        return result, analyzer_id, provenance

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


def _attach_sequence_context(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """Attach normalized sequence context to analysis payload."""
    if not isinstance(analysis, dict):
        return analysis
    analysis["sequence_context"] = _derive_sequence_context(analysis)
    return analysis


def _derive_sequence_context(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """Derive role-in-sequence metadata from analysis candidates/tags."""
    existing = analysis.get("sequence_context")
    if isinstance(existing, dict):
        normalized_existing = _normalize_sequence_context_dict(existing)
        if normalized_existing.get("role_in_sequence") != "unspecified":
            return normalized_existing

    best_match: Optional[Dict[str, Any]] = None
    for candidate in analysis.get("candidates") or []:
        if not isinstance(candidate, dict):
            continue
        metadata = candidate.get("metadata")
        if not isinstance(metadata, dict):
            continue
        primitive_match = metadata.get("primitive_match")
        if not isinstance(primitive_match, dict):
            continue
        role_in_sequence = _normalize_sequence_role(primitive_match.get("role_in_sequence"))
        if role_in_sequence == "unspecified":
            continue

        confidence = _coerce_optional_float(
            primitive_match.get("score", primitive_match.get("confidence"))
        )
        candidate_match = {
            "role_in_sequence": role_in_sequence,
            "source": "analysis.candidates[].metadata.primitive_match",
            "confidence": confidence,
            "matched_block_id": _coerce_optional_str(primitive_match.get("block_id")),
        }

        if best_match is None:
            best_match = candidate_match
            continue
        if (candidate_match.get("confidence") or 0.0) > (best_match.get("confidence") or 0.0):
            best_match = candidate_match

    if best_match is not None:
        return best_match

    tags_role = _extract_sequence_role_from_tags(analysis.get("tags"))
    if tags_role != "unspecified":
        return {
            "role_in_sequence": tags_role,
            "source": "analysis.tags",
            "confidence": None,
            "matched_block_id": None,
        }

    return {
        "role_in_sequence": "unspecified",
        "source": "none",
        "confidence": None,
        "matched_block_id": None,
    }


def _normalize_sequence_context_dict(raw: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "role_in_sequence": _normalize_sequence_role(raw.get("role_in_sequence")),
        "source": _coerce_optional_str(raw.get("source")) or "analysis.sequence_context",
        "confidence": _coerce_optional_float(raw.get("confidence")),
        "matched_block_id": _coerce_optional_str(raw.get("matched_block_id")),
    }


def _normalize_sequence_role(value: Any) -> str:
    if not isinstance(value, str):
        return "unspecified"
    normalized = value.strip().lower()
    if normalized in _SEQUENCE_ROLES:
        return normalized
    return "unspecified"


def _extract_sequence_role_from_tags(raw_tags: Any) -> str:
    if not isinstance(raw_tags, list):
        return "unspecified"
    for item in raw_tags:
        tag = None
        if isinstance(item, str):
            tag = item
        elif isinstance(item, dict):
            raw_tag = item.get("tag")
            if isinstance(raw_tag, str):
                tag = raw_tag
        if not tag:
            continue

        normalized_tag = tag.strip().lower()
        if normalized_tag.startswith("sequence:"):
            return _normalize_sequence_role(normalized_tag.split(":", 1)[1])
        if normalized_tag.startswith("role_in_sequence:"):
            return _normalize_sequence_role(normalized_tag.split(":", 1)[1])
    return "unspecified"


def _coerce_optional_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_optional_str(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None
