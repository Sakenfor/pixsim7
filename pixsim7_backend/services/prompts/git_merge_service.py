"""Git-like Merge Support for Prompt Versioning

Provides merge capabilities similar to git merge:
- Merge branches
- Detect conflicts
- AI-powered conflict resolution
- Merge strategies (fast-forward, three-way, ours, theirs)
"""
import os
from typing import List, Dict, Any, Optional, Tuple
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

from pixsim7_backend.domain.prompt_versioning import PromptVersion, PromptFamily
from pixsim7_backend.services.prompts import PromptVersionService
from pixsim7_backend.services.prompts.diff_utils import generate_unified_diff


class GitMergeService:
    """Git-like merge support with AI conflict resolution"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.version_service = PromptVersionService(db)

        # Initialize AI client if available
        self.ai_available = ANTHROPIC_AVAILABLE
        if self.ai_available:
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if api_key:
                self.ai_client = anthropic.Anthropic(api_key=api_key)
            else:
                self.ai_available = False

    async def merge(
        self,
        family_id: UUID,
        source_version_id: UUID,
        target_version_id: UUID,
        strategy: str = "auto",
        commit_message: Optional[str] = None,
        author: Optional[str] = None
    ) -> Dict[str, Any]:
        """Merge two versions (like git merge)

        Args:
            family_id: Prompt family
            source_version_id: Version to merge FROM
            target_version_id: Version to merge INTO
            strategy: Merge strategy (auto, fast-forward, three-way, ours, theirs, ai)
            commit_message: Commit message for merge
            author: Author of merge

        Returns:
            Merge result with new version or conflict info
        """
        # Fetch versions
        source = await self.version_service.get_version(source_version_id)
        target = await self.version_service.get_version(target_version_id)

        if not source or not target:
            raise ValueError("Source or target version not found")

        if source.family_id != family_id or target.family_id != family_id:
            raise ValueError("Versions must be from the same family")

        # Find common ancestor
        common_ancestor = await self._find_common_ancestor(source_version_id, target_version_id)

        # Determine merge strategy
        if strategy == "auto":
            strategy = await self._determine_merge_strategy(source, target, common_ancestor)

        # Execute merge based on strategy
        if strategy == "fast-forward":
            return await self._fast_forward_merge(source, target, commit_message, author)
        elif strategy == "ours":
            return await self._ours_merge(source, target, commit_message, author)
        elif strategy == "theirs":
            return await self._theirs_merge(source, target, commit_message, author)
        elif strategy == "three-way":
            return await self._three_way_merge(source, target, common_ancestor, commit_message, author)
        elif strategy == "ai":
            return await self._ai_merge(source, target, common_ancestor, commit_message, author)
        else:
            raise ValueError(f"Unknown merge strategy: {strategy}")

    async def detect_conflicts(
        self,
        source_version_id: UUID,
        target_version_id: UUID
    ) -> Dict[str, Any]:
        """Detect merge conflicts between two versions

        Args:
            source_version_id: First version
            target_version_id: Second version

        Returns:
            Conflict analysis
        """
        source = await self.version_service.get_version(source_version_id)
        target = await self.version_service.get_version(target_version_id)

        if not source or not target:
            raise ValueError("Version not found")

        # Find common ancestor
        common_ancestor = await self._find_common_ancestor(source_version_id, target_version_id)

        conflicts = []

        # Check prompt text conflicts
        if source.prompt_text != target.prompt_text:
            diff = generate_unified_diff(target.prompt_text, source.prompt_text)
            conflicts.append({
                "type": "prompt_text",
                "description": "Prompt text differs between versions",
                "diff": diff,
                "source_value": source.prompt_text[:100] + "...",
                "target_value": target.prompt_text[:100] + "..."
            })

        # Check variable conflicts
        source_vars = set(source.variables.keys())
        target_vars = set(target.variables.keys())

        added_vars = source_vars - target_vars
        removed_vars = target_vars - source_vars
        common_vars = source_vars & target_vars

        for var in added_vars:
            conflicts.append({
                "type": "variable_added",
                "variable_name": var,
                "description": f"Variable '{var}' added in source",
                "source_value": source.variables[var]
            })

        for var in removed_vars:
            conflicts.append({
                "type": "variable_removed",
                "variable_name": var,
                "description": f"Variable '{var}' removed in source",
                "target_value": target.variables[var]
            })

        for var in common_vars:
            if source.variables[var] != target.variables[var]:
                conflicts.append({
                    "type": "variable_changed",
                    "variable_name": var,
                    "description": f"Variable '{var}' changed",
                    "source_value": source.variables[var],
                    "target_value": target.variables[var]
                })

        # Check tags conflicts
        source_tags = set(source.tags or [])
        target_tags = set(target.tags or [])

        if source_tags != target_tags:
            conflicts.append({
                "type": "tags",
                "description": "Tags differ",
                "added_tags": list(source_tags - target_tags),
                "removed_tags": list(target_tags - source_tags)
            })

        return {
            "has_conflicts": len(conflicts) > 0,
            "conflict_count": len(conflicts),
            "conflicts": conflicts,
            "common_ancestor_id": str(common_ancestor.id) if common_ancestor else None,
            "can_fast_forward": await self._can_fast_forward(source, target),
            "recommended_strategy": await self._determine_merge_strategy(source, target, common_ancestor)
        }

    async def _fast_forward_merge(
        self,
        source: PromptVersion,
        target: PromptVersion,
        commit_message: Optional[str],
        author: Optional[str]
    ) -> Dict[str, Any]:
        """Fast-forward merge (source is direct ancestor of target)"""
        # Check if fast-forward is possible
        if not await self._can_fast_forward(source, target):
            raise ValueError("Fast-forward merge not possible. Versions have diverged.")

        # No new version needed, just update branch pointer
        return {
            "success": True,
            "strategy": "fast-forward",
            "merged_version_id": str(target.id),
            "message": "Fast-forward merge completed",
            "conflicts": []
        }

    async def _ours_merge(
        self,
        source: PromptVersion,
        target: PromptVersion,
        commit_message: Optional[str],
        author: Optional[str]
    ) -> Dict[str, Any]:
        """Take-ours merge strategy (keep target version)"""
        # Create new version that's identical to target
        merged_version = await self.version_service.create_version(
            family_id=target.family_id,
            prompt_text=target.prompt_text,
            commit_message=commit_message or f"Merge (ours): keeping target version",
            author=author,
            parent_version_id=target.id,
            variables=target.variables,
            provider_hints=target.provider_hints,
            tags=(target.tags or []) + ['merge', 'strategy:ours']
        )

        return {
            "success": True,
            "strategy": "ours",
            "merged_version_id": str(merged_version.id),
            "message": "Merge completed using 'ours' strategy",
            "conflicts": []
        }

    async def _theirs_merge(
        self,
        source: PromptVersion,
        target: PromptVersion,
        commit_message: Optional[str],
        author: Optional[str]
    ) -> Dict[str, Any]:
        """Take-theirs merge strategy (keep source version)"""
        # Create new version using source content
        merged_version = await self.version_service.create_version(
            family_id=target.family_id,
            prompt_text=source.prompt_text,
            commit_message=commit_message or f"Merge (theirs): using source version",
            author=author,
            parent_version_id=target.id,
            variables=source.variables,
            provider_hints=source.provider_hints,
            tags=(source.tags or []) + ['merge', 'strategy:theirs']
        )

        return {
            "success": True,
            "strategy": "theirs",
            "merged_version_id": str(merged_version.id),
            "message": "Merge completed using 'theirs' strategy",
            "conflicts": []
        }

    async def _three_way_merge(
        self,
        source: PromptVersion,
        target: PromptVersion,
        common_ancestor: Optional[PromptVersion],
        commit_message: Optional[str],
        author: Optional[str]
    ) -> Dict[str, Any]:
        """Three-way merge (combines changes from both versions)"""
        # Simple three-way merge (no conflicts - just combine)

        # Merge prompt text (concatenate with separator if different)
        if source.prompt_text == target.prompt_text:
            merged_text = source.prompt_text
        else:
            # For now, prefer source (could be smarter)
            merged_text = source.prompt_text

        # Merge variables (combine both)
        merged_vars = {**target.variables, **source.variables}

        # Merge tags (union)
        merged_tags = list(set((source.tags or []) + (target.tags or [])))
        merged_tags.append('merge')
        merged_tags.append('strategy:three-way')

        # Create merged version
        merged_version = await self.version_service.create_version(
            family_id=target.family_id,
            prompt_text=merged_text,
            commit_message=commit_message or f"Merge: three-way merge",
            author=author,
            parent_version_id=target.id,
            variables=merged_vars,
            provider_hints={**target.provider_hints, **source.provider_hints},
            tags=merged_tags
        )

        return {
            "success": True,
            "strategy": "three-way",
            "merged_version_id": str(merged_version.id),
            "message": "Three-way merge completed",
            "conflicts": []
        }

    async def _ai_merge(
        self,
        source: PromptVersion,
        target: PromptVersion,
        common_ancestor: Optional[PromptVersion],
        commit_message: Optional[str],
        author: Optional[str]
    ) -> Dict[str, Any]:
        """AI-powered intelligent merge"""
        if not self.ai_available:
            raise ValueError("AI merge requires ANTHROPIC_API_KEY to be set")

        # Call AI to intelligently merge prompts
        system_prompt = """You are an expert at merging two versions of image/video generation prompts.

Given:
- Source version (what they want to merge in)
- Target version (current version)
- Optional common ancestor (what they both branched from)

Your task is to create a merged prompt that:
1. Preserves important changes from both versions
2. Resolves conflicts intelligently
3. Maintains coherence and quality
4. Explains what was kept/changed/merged

Return JSON with:
{
  "merged_prompt_text": "the merged prompt",
  "merge_explanation": "what you did and why",
  "conflicts_resolved": ["list of conflicts and how you resolved them"],
  "kept_from_source": ["what was kept from source"],
  "kept_from_target": ["what was kept from target"]
}"""

        user_prompt = f"""Merge these two prompt versions:

SOURCE VERSION:
{source.prompt_text}

TARGET VERSION:
{target.prompt_text}

{f"COMMON ANCESTOR:{chr(10)}{common_ancestor.prompt_text}" if common_ancestor else ""}

Please create an intelligent merge that combines the best of both versions."""

        response = self.ai_client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            temperature=0.3,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )

        response_text = response.content[0].text

        # Parse JSON response
        import json
        if "```json" in response_text:
            json_start = response_text.find("```json") + 7
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()

        try:
            merge_result = json.loads(response_text)
        except json.JSONDecodeError:
            # Fallback to three-way merge if AI parsing fails
            return await self._three_way_merge(source, target, common_ancestor, commit_message, author)

        # Create merged version
        merged_version = await self.version_service.create_version(
            family_id=target.family_id,
            prompt_text=merge_result['merged_prompt_text'],
            commit_message=commit_message or f"AI merge: {merge_result.get('merge_explanation', 'Intelligent merge')}",
            author=author,
            parent_version_id=target.id,
            variables={**target.variables, **source.variables},
            provider_hints={**target.provider_hints, **source.provider_hints},
            tags=(target.tags or []) + ['merge', 'strategy:ai', 'ai_assisted']
        )

        return {
            "success": True,
            "strategy": "ai",
            "merged_version_id": str(merged_version.id),
            "message": "AI-powered merge completed",
            "ai_explanation": merge_result.get('merge_explanation'),
            "conflicts_resolved": merge_result.get('conflicts_resolved', []),
            "kept_from_source": merge_result.get('kept_from_source', []),
            "kept_from_target": merge_result.get('kept_from_target', [])
        }

    async def _find_common_ancestor(
        self,
        version1_id: UUID,
        version2_id: UUID
    ) -> Optional[PromptVersion]:
        """Find common ancestor of two versions"""
        # Get ancestors of version1
        ancestors1 = await self._get_ancestor_chain(version1_id)

        # Walk version2's ancestors and find first common one
        current_id = version2_id
        for _ in range(100):  # Safety limit
            if current_id in ancestors1:
                # Found common ancestor
                return await self.version_service.get_version(current_id)

            query = select(PromptVersion.parent_version_id).where(
                PromptVersion.id == current_id
            )
            result = await self.db.execute(query)
            parent_id = result.scalar_one_or_none()

            if not parent_id:
                break

            current_id = parent_id

        return None

    async def _get_ancestor_chain(
        self,
        version_id: UUID,
        limit: int = 100
    ) -> set[UUID]:
        """Get set of all ancestor version IDs"""
        ancestors = set()
        current_id = version_id

        for _ in range(limit):
            query = select(PromptVersion.parent_version_id).where(
                PromptVersion.id == current_id
            )
            result = await self.db.execute(query)
            parent_id = result.scalar_one_or_none()

            if not parent_id:
                break

            ancestors.add(parent_id)
            current_id = parent_id

        return ancestors

    async def _can_fast_forward(
        self,
        source: PromptVersion,
        target: PromptVersion
    ) -> bool:
        """Check if fast-forward merge is possible (target is descendant of source)"""
        # Check if source is an ancestor of target
        ancestors = await self._get_ancestor_chain(target.id)
        return source.id in ancestors

    async def _determine_merge_strategy(
        self,
        source: PromptVersion,
        target: PromptVersion,
        common_ancestor: Optional[PromptVersion]
    ) -> str:
        """Determine best merge strategy automatically"""
        # Check if fast-forward is possible
        if await self._can_fast_forward(source, target):
            return "fast-forward"

        # If prompts are identical, use ours
        if source.prompt_text == target.prompt_text:
            return "ours"

        # If AI is available and prompts differ significantly, use AI
        if self.ai_available:
            diff_size = abs(len(source.prompt_text) - len(target.prompt_text))
            if diff_size > 100:  # Significant difference
                return "ai"

        # Default to three-way
        return "three-way"
