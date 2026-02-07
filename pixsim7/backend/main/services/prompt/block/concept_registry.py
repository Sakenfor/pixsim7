"""Concept Registry Service - Learn and track new concepts from prompts

Manages discovered concepts/tags from AI extraction:
- Stores new concepts discovered during parsing
- Suggests new tags based on usage patterns
- Tracks concept frequency and reusability
- Provides concept recommendations for future extractions
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from uuid import uuid4, UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from pixsim7.backend.main.domain.prompt import PromptBlock


class ConceptRegistry:
    """Registry for discovered concepts and tags"""

    def __init__(self, db: AsyncSession):
        self.db = db
        # In-memory cache (could be Redis in production)
        self.concept_cache = {}

    async def discover_concepts_from_extraction(
        self,
        extracted_blocks: List[Dict[str, Any]],
        prompt_text: str
    ) -> Dict[str, Any]:
        """Analyze extracted blocks and discover new concepts

        Args:
            extracted_blocks: Blocks extracted by AI
            prompt_text: Original prompt text

        Returns:
            Discovery result with new concepts and suggestions
        """
        discovered = {
            "new_concepts": [],
            "existing_concepts": [],
            "suggestions": []
        }

        # Analyze each block's metadata
        for block in extracted_blocks:
            block_type = block.get('block_type', 'unknown')
            subtypes = block.get('subtypes', [])

            # Check if block_type is new
            if not await self._concept_exists(block_type, 'block_type'):
                discovered["new_concepts"].append({
                    "type": "block_type",
                    "value": block_type,
                    "description": block.get('description', ''),
                    "found_in": block.get('block_id'),
                    "reusable": block.get('reusable', True),
                    "prompt_context": block.get('prompt', '')[:100] + "..."
                })
            else:
                discovered["existing_concepts"].append({
                    "type": "block_type",
                    "value": block_type
                })

            # Check subtypes
            for subtype in subtypes:
                if not await self._concept_exists(subtype, 'subtype'):
                    discovered["new_concepts"].append({
                        "type": "subtype",
                        "value": subtype,
                        "description": f"Subtype found in {block_type}",
                        "found_in": block.get('block_id'),
                        "reusable": block.get('reusable', True),
                        "prompt_context": block.get('prompt', '')[:100] + "..."
                    })

            # Extract tags from block tags
            tags = block.get('tags', {})
            for tag_key, tag_value in tags.items():
                tag_concept = f"{tag_key}:{tag_value}"
                if not await self._concept_exists(tag_concept, 'tag'):
                    discovered["new_concepts"].append({
                        "type": "tag",
                        "value": tag_concept,
                        "tag_key": tag_key,
                        "tag_value": tag_value,
                        "description": f"Tag discovered in {block_type}",
                        "found_in": block.get('block_id'),
                        "reusable": True,
                        "prompt_context": block.get('prompt', '')[:100] + "..."
                    })

        # Generate suggestions for formalization
        discovered["suggestions"] = await self._generate_suggestions(
            discovered["new_concepts"],
            prompt_text
        )

        return discovered

    async def confirm_concepts(
        self,
        concepts: List[Dict[str, Any]],
        confirmed_by: Optional[str] = None
    ) -> Dict[str, Any]:
        """Confirm and formalize new concepts

        Args:
            concepts: List of concepts to confirm
            confirmed_by: User who confirmed

        Returns:
            Confirmation result
        """
        confirmed = []
        skipped = []

        for concept in concepts:
            concept_type = concept.get('type')
            concept_value = concept.get('value')

            # Check if already exists
            if await self._concept_exists(concept_value, concept_type):
                skipped.append({
                    "value": concept_value,
                    "reason": "already_exists"
                })
                continue

            # Store in concept registry (tags on existing blocks for now)
            # In production, you might have a dedicated concepts table
            confirmed.append({
                "type": concept_type,
                "value": concept_value,
                "confirmed_at": datetime.now(timezone.utc).isoformat(),
                "confirmed_by": confirmed_by,
                "reusability_score": concept.get('reusable', True)
            })

            # Add to cache
            cache_key = f"{concept_type}:{concept_value}"
            self.concept_cache[cache_key] = {
                "confirmed": True,
                "usage_count": 1,
                "confirmed_at": datetime.now(timezone.utc)
            }

        return {
            "confirmed_count": len(confirmed),
            "skipped_count": len(skipped),
            "confirmed": confirmed,
            "skipped": skipped
        }

    async def get_concept_suggestions(
        self,
        prompt_text: str,
        existing_blocks: Optional[List[UUID]] = None
    ) -> List[Dict[str, Any]]:
        """Get concept suggestions for a new prompt based on history

        Args:
            prompt_text: Prompt to analyze
            existing_blocks: Existing blocks to consider

        Returns:
            Suggested concepts/tags to use
        """
        suggestions = []

        # Analyze prompt for known patterns
        keywords = self._extract_keywords(prompt_text.lower())

        # Find similar blocks in database
        for keyword in keywords[:10]:  # Top 10 keywords
            query = select(PromptBlock).where(
                PromptBlock.prompt.ilike(f"%{keyword}%")
            ).limit(5)

            result = await self.db.execute(query)
            similar_blocks = result.scalars().all()

            for block in similar_blocks:
                # Extract concepts from similar blocks
                if block.tags:
                    for tag_key, tag_value in block.tags.items():
                        concept = f"{tag_key}:{tag_value}"
                        suggestions.append({
                            "type": "tag",
                            "value": concept,
                            "tag_key": tag_key,
                            "tag_value": tag_value,
                            "source": "similar_prompt",
                            "similar_block_id": block.block_id,
                            "confidence": 0.7
                        })

        # Deduplicate
        seen = set()
        unique_suggestions = []
        for suggestion in suggestions:
            key = suggestion['value']
            if key not in seen:
                seen.add(key)
                unique_suggestions.append(suggestion)

        return unique_suggestions[:20]  # Top 20

    async def get_concept_stats(self) -> Dict[str, Any]:
        """Get statistics about discovered concepts

        Returns:
            Concept statistics
        """
        # Count unique block types
        block_type_query = select(
            PromptBlock.block_metadata['block_type'].astext,
            func.count(PromptBlock.id)
        ).where(
            PromptBlock.block_metadata['block_type'].isnot(None)
        ).group_by(PromptBlock.block_metadata['block_type'].astext)

        block_type_result = await self.db.execute(block_type_query)
        block_types = dict(block_type_result.all())

        # Count unique tags
        # This is simplified - in production you'd want better JSONB queries
        all_blocks_query = select(PromptBlock.tags).where(
            PromptBlock.tags.isnot(None)
        )
        all_tags_result = await self.db.execute(all_blocks_query)
        all_tags_lists = all_tags_result.scalars().all()

        tag_counts = {}
        for tags in all_tags_lists:
            if isinstance(tags, dict):
                for key, value in tags.items():
                    tag = f"{key}:{value}"
                    tag_counts[tag] = tag_counts.get(tag, 0) + 1

        return {
            "total_block_types": len(block_types),
            "block_types": block_types,
            "total_tags": len(tag_counts),
            "top_tags": sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:20],
            "cache_size": len(self.concept_cache)
        }

    async def _concept_exists(self, value: str, concept_type: str) -> bool:
        """Check if a concept already exists in system"""
        # Check cache first
        cache_key = f"{concept_type}:{value}"
        if cache_key in self.concept_cache:
            return True

        # Check database (simplified)
        if concept_type == 'block_type':
            query = select(PromptBlock).where(
                PromptBlock.block_metadata['block_type'].astext == value
            ).limit(1)
        elif concept_type == 'tag':
            # Check if any block uses this tag
            # This is simplified - proper JSONB query needed
            query = select(PromptBlock).limit(1)
        else:
            return False

        result = await self.db.execute(query)
        exists = result.first() is not None

        if exists:
            self.concept_cache[cache_key] = {"confirmed": True}

        return exists

    async def _generate_suggestions(
        self,
        new_concepts: List[Dict[str, Any]],
        prompt_text: str
    ) -> List[Dict[str, Any]]:
        """Generate suggestions for new concept formalization

        Args:
            new_concepts: Newly discovered concepts
            prompt_text: Original prompt

        Returns:
            Suggestions for user
        """
        suggestions = []

        for concept in new_concepts:
            concept_type = concept.get('type')
            concept_value = concept.get('value')

            # Determine if this should be a reusable concept
            reusability_score = self._calculate_reusability(concept, prompt_text)

            if reusability_score > 0.5:
                suggestions.append({
                    "action": "add_to_registry",
                    "concept": concept,
                    "reason": "High reusability potential",
                    "reusability_score": reusability_score,
                    "recommendation": "Add as new concept for future use"
                })
            elif reusability_score > 0.3:
                suggestions.append({
                    "action": "consider",
                    "concept": concept,
                    "reason": "Moderate reusability",
                    "reusability_score": reusability_score,
                    "recommendation": "Consider adding if you plan to reuse this pattern"
                })
            else:
                suggestions.append({
                    "action": "skip",
                    "concept": concept,
                    "reason": "Very specific to this scenario",
                    "reusability_score": reusability_score,
                    "recommendation": "Skip - too specific for general use"
                })

        return suggestions

    def _calculate_reusability(
        self,
        concept: Dict[str, Any],
        prompt_text: str
    ) -> float:
        """Calculate reusability score for a concept (0-1)

        Heuristics:
        - Generic terms = higher score
        - Specific details = lower score
        - Common patterns = higher score
        """
        value = concept.get('value', '').lower()
        concept_type = concept.get('type', '')

        score = 0.5  # Base score

        # Generic terms increase score
        generic_keywords = ['camera', 'lighting', 'movement', 'position', 'angle',
                          'action', 'response', 'continuity', 'effect']
        if any(kw in value for kw in generic_keywords):
            score += 0.2

        # Very specific terms decrease score
        specific_keywords = ['banana', 'goo', 'buttocks', '15cm']
        if any(kw in value for kw in specific_keywords):
            score -= 0.3

        # Block types are generally reusable
        if concept_type == 'block_type':
            score += 0.1

        # Common tags are reusable
        common_tags = ['camera_', 'intensity', 'mood', 'location', 'style']
        if any(value.startswith(ct) for ct in common_tags):
            score += 0.15

        return max(0.0, min(1.0, score))

    def _extract_keywords(self, text: str) -> List[str]:
        """Extract important keywords from text"""
        # Simple keyword extraction (in production, use NLP)
        words = text.split()

        # Filter common words
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'}
        keywords = [w for w in words if w not in stop_words and len(w) > 3]

        # Return unique keywords
        return list(set(keywords))
