"""
PromptAnalysisService

Orchestrates prompt analysis and persistence.
Keeps adapters pure (no DB), handles storage decisions here.
"""

import hashlib
import logging
from typing import Optional, Dict, Any, Tuple
from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain.prompt import PromptVersion
from pixsim7.backend.main.services.prompt_parser import analyzer_registry

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
    ) -> Dict[str, Any]:
        """
        Analyze prompt text without storage.

        Pure analysis - no database access, returns JSON result.
        Use for preview, dev tools, Quick Generate preview.

        Args:
            text: Prompt text to analyze
            analyzer_id: Analyzer to use (default: prompt:simple)

        Returns:
            Analysis result dict:
            {
                "prompt": "original text",
                "blocks": [...],
                "tags": [...],
                "analyzer_id": "prompt:simple"
            }
        """
        analyzer_id = analyzer_id or "prompt:simple"
        normalized = text.strip()

        logger.debug(f"Analyzing prompt with {analyzer_id}, len={len(normalized)}")

        # Dispatch to appropriate analyzer
        analysis = await self._run_analyzer(normalized, analyzer_id)

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
    ) -> Tuple[PromptVersion, bool]:
        """
        Find or create PromptVersion with analysis.

        - Same prompt text → same PromptVersion (by hash)
        - If existing version has no analysis or different analyzer, recomputes
        - One-off prompts have family_id = NULL

        Args:
            text: Prompt text
            analyzer_id: Analyzer to use (default: prompt:simple)
            author: Optional author identifier
            family_hint: Optional family UUID (for versioned prompts)
            force_reanalyze: Force re-analysis even if already analyzed

        Returns:
            Tuple of (PromptVersion, created) where created is True if new

        Raises:
            RuntimeError: If db session not provided
        """
        if not self.db:
            raise RuntimeError("Database session required for analyze_and_attach_version")

        analyzer_id = analyzer_id or "prompt:simple"
        normalized = text.strip()
        prompt_hash = self._compute_hash(normalized)

        # Try to find existing by hash
        result = await self.db.execute(
            select(PromptVersion).where(PromptVersion.prompt_hash == prompt_hash)
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Check if we need to (re)analyze
            needs_analysis = (
                force_reanalyze
                or not existing.prompt_analysis
                or existing.prompt_analysis.get("analyzer_id") != analyzer_id
            )

            if needs_analysis:
                logger.info(f"Re-analyzing PromptVersion {existing.id} with {analyzer_id}")
                analysis = await self.analyze(normalized, analyzer_id)
                existing.prompt_analysis = analysis
                existing.updated_at = datetime.utcnow()
                await self.db.flush()

            return existing, False

        # Create new PromptVersion with analysis
        logger.info(f"Creating new PromptVersion for hash {prompt_hash[:16]}... (analyzer={analyzer_id})")

        analysis = await self.analyze(normalized, analyzer_id)

        new_version = PromptVersion(
            prompt_text=normalized,
            prompt_hash=prompt_hash,
            prompt_analysis=analysis,
            family_id=family_hint,
            version_number=None if family_hint is None else 1,
            author=author,
            created_at=datetime.utcnow(),
        )

        self.db.add(new_version)
        await self.db.flush()

        logger.info(f"Created PromptVersion {new_version.id} with {len(analysis.get('blocks', []))} blocks")
        return new_version, True

    async def reanalyze_version(
        self,
        version_id: UUID,
        analyzer_id: Optional[str] = None,
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

        analysis = await self.analyze(version.prompt_text, analyzer_id)
        version.prompt_analysis = analysis
        version.updated_at = datetime.utcnow()

        await self.db.flush()

        return version

    async def _run_analyzer(
        self,
        text: str,
        analyzer_id: str,
    ) -> Dict[str, Any]:
        """
        Run the specified analyzer on text.

        Dispatches to appropriate adapter based on analyzer_id.
        """
        # Check if analyzer exists
        analyzer_info = analyzer_registry.get(analyzer_id)
        if not analyzer_info:
            logger.warning(f"Unknown analyzer {analyzer_id}, falling back to prompt:simple")
            analyzer_id = "prompt:simple"

        # Dispatch based on analyzer kind
        if analyzer_id == "prompt:simple" or analyzer_id == "parser:simple":
            # Use simple parser adapter
            from pixsim7.backend.main.services.prompt_dsl_adapter import analyze_prompt
            return await analyze_prompt(text, analyzer_id=None)  # adapter handles internally

        elif analyzer_id.startswith("prompt:") or analyzer_id.startswith("llm:"):
            # Use LLM analyzer
            from pixsim7.backend.main.services.prompt_parser import analyze_prompt_with_llm

            # Map to provider
            provider_map = {
                "prompt:claude": "anthropic-llm",
                "prompt:openai": "openai-llm",
                "llm:claude": "anthropic-llm",
                "llm:openai": "openai-llm",
            }
            provider_id = provider_map.get(analyzer_id, "anthropic-llm")

            return await analyze_prompt_with_llm(
                text=text,
                provider_id=provider_id,
            )

        else:
            # Unknown - fall back to simple
            logger.warning(f"No handler for analyzer {analyzer_id}, using simple parser")
            from pixsim7.backend.main.services.prompt_dsl_adapter import analyze_prompt
            return await analyze_prompt(text, analyzer_id=None)

    def _compute_hash(self, text: str) -> str:
        """Compute SHA256 hash of normalized prompt text."""
        return hashlib.sha256(text.encode('utf-8')).hexdigest()
