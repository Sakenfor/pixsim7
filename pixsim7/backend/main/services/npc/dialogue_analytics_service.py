"""
Dialogue Analytics Service

Tracks dialogue generation analytics including:
- LLM usage and costs
- Player engagement metrics
- Quality tracking
- A/B testing support
- Optimization insights
"""
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, desc

from pixsim7.backend.main.domain.npc_memory import DialogueAnalytics


class DialogueAnalyticsService:
    """Service for tracking dialogue generation analytics"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def record_dialogue_generation(
        self,
        npc_id: int,
        user_id: int,
        program_id: str,
        prompt_hash: str,
        relationship_tier: str,
        model_used: str,
        generation_time_ms: float,
        dialogue_length: int,
        session_id: Optional[int] = None,
        memory_id: Optional[int] = None,
        intimacy_level: Optional[str] = None,
        npc_emotion: Optional[str] = None,
        was_cached: bool = False,
        tokens_used: Optional[int] = None,
        estimated_cost: Optional[float] = None,
        contains_memory_reference: bool = False,
        emotional_consistency: bool = True,
        variant_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> DialogueAnalytics:
        """
        Record a dialogue generation event

        Args:
            npc_id: NPC ID
            user_id: Player ID
            program_id: Prompt program used
            prompt_hash: Hash of the prompt
            relationship_tier: Current relationship tier
            model_used: LLM model
            generation_time_ms: Generation time
            dialogue_length: Character count
            session_id: Session ID
            memory_id: Related memory ID
            intimacy_level: Intimacy level
            npc_emotion: NPC's emotion
            was_cached: Whether cached
            tokens_used: Total tokens
            estimated_cost: Cost in USD
            contains_memory_reference: Whether dialogue referenced memories
            emotional_consistency: Whether emotion was consistent
            variant_id: A/B test variant
            metadata: Additional metadata

        Returns:
            Created analytics record
        """
        analytics = DialogueAnalytics(
            npc_id=npc_id,
            user_id=user_id,
            session_id=session_id,
            memory_id=memory_id,
            program_id=program_id,
            prompt_hash=prompt_hash,
            relationship_tier=relationship_tier,
            intimacy_level=intimacy_level,
            npc_emotion=npc_emotion,
            model_used=model_used,
            was_cached=was_cached,
            tokens_used=tokens_used,
            generation_time_ms=generation_time_ms,
            estimated_cost=estimated_cost,
            dialogue_length=dialogue_length,
            contains_memory_reference=contains_memory_reference,
            emotional_consistency=emotional_consistency,
            variant_id=variant_id,
            metadata=metadata or {}
        )

        self.db.add(analytics)
        await self.db.commit()
        await self.db.refresh(analytics)

        return analytics

    async def update_engagement_metrics(
        self,
        analytics_id: int,
        player_responded: bool,
        response_time_seconds: Optional[float] = None,
        conversation_continued: bool = False,
        player_sentiment: Optional[str] = None
    ) -> Optional[DialogueAnalytics]:
        """
        Update player engagement metrics for a dialogue

        Args:
            analytics_id: Analytics record ID
            player_responded: Whether player responded
            response_time_seconds: Time until response
            conversation_continued: Whether conversation continued
            player_sentiment: Detected sentiment

        Returns:
            Updated analytics or None if not found
        """
        analytics = await self.db.get(DialogueAnalytics, analytics_id)
        if not analytics:
            return None

        analytics.player_responded = player_responded
        analytics.response_time_seconds = response_time_seconds
        analytics.conversation_continued = conversation_continued
        analytics.player_sentiment = player_sentiment

        await self.db.commit()
        await self.db.refresh(analytics)

        return analytics

    async def get_cost_summary(
        self,
        npc_id: Optional[int] = None,
        user_id: Optional[int] = None,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Get cost summary for dialogue generation

        Args:
            npc_id: Optional NPC filter
            user_id: Optional user filter
            days: Number of days to analyze

        Returns:
            Cost summary
        """
        cutoff = datetime.utcnow() - timedelta(days=days)

        query = select(DialogueAnalytics).where(
            DialogueAnalytics.generated_at >= cutoff
        )

        if npc_id:
            query = query.where(DialogueAnalytics.npc_id == npc_id)
        if user_id:
            query = query.where(DialogueAnalytics.user_id == user_id)

        result = await self.db.execute(query)
        analytics = result.scalars().all()

        total_cost = 0.0
        cached_cost_saved = 0.0
        total_tokens = 0
        cached_count = 0
        fresh_count = 0

        for a in analytics:
            if a.estimated_cost:
                if a.was_cached:
                    cached_cost_saved += a.estimated_cost * 0.95  # Assume 95% savings
                    cached_count += 1
                else:
                    total_cost += a.estimated_cost
                    fresh_count += 1

            if a.tokens_used:
                total_tokens += a.tokens_used

        return {
            "period_days": days,
            "total_dialogues": len(analytics),
            "fresh_generations": fresh_count,
            "cached_generations": cached_count,
            "cache_hit_rate": cached_count / len(analytics) if analytics else 0.0,
            "total_cost_usd": round(total_cost, 4),
            "estimated_savings_usd": round(cached_cost_saved, 4),
            "total_tokens": total_tokens,
            "average_cost_per_dialogue": round(total_cost / fresh_count, 4) if fresh_count > 0 else 0.0
        }

    async def get_engagement_metrics(
        self,
        npc_id: Optional[int] = None,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Get player engagement metrics

        Args:
            npc_id: Optional NPC filter
            days: Number of days to analyze

        Returns:
            Engagement metrics
        """
        cutoff = datetime.utcnow() - timedelta(days=days)

        query = select(DialogueAnalytics).where(
            DialogueAnalytics.generated_at >= cutoff
        )

        if npc_id:
            query = query.where(DialogueAnalytics.npc_id == npc_id)

        result = await self.db.execute(query)
        analytics = result.scalars().all()

        if not analytics:
            return {
                "total_dialogues": 0,
                "response_rate": 0.0,
                "continuation_rate": 0.0,
                "average_response_time_seconds": 0.0,
                "sentiment_breakdown": {}
            }

        responded = sum(1 for a in analytics if a.player_responded)
        continued = sum(1 for a in analytics if a.conversation_continued)

        response_times = [
            a.response_time_seconds
            for a in analytics
            if a.response_time_seconds is not None
        ]

        sentiments = {}
        for a in analytics:
            if a.player_sentiment:
                sentiments[a.player_sentiment] = sentiments.get(a.player_sentiment, 0) + 1

        return {
            "total_dialogues": len(analytics),
            "response_rate": responded / len(analytics),
            "continuation_rate": continued / len(analytics),
            "average_response_time_seconds": (
                sum(response_times) / len(response_times)
                if response_times else 0.0
            ),
            "sentiment_breakdown": sentiments
        }

    async def get_quality_metrics(
        self,
        npc_id: Optional[int] = None,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Get dialogue quality metrics

        Args:
            npc_id: Optional NPC filter
            days: Number of days to analyze

        Returns:
            Quality metrics
        """
        cutoff = datetime.utcnow() - timedelta(days=days)

        query = select(DialogueAnalytics).where(
            DialogueAnalytics.generated_at >= cutoff
        )

        if npc_id:
            query = query.where(DialogueAnalytics.npc_id == npc_id)

        result = await self.db.execute(query)
        analytics = result.scalars().all()

        if not analytics:
            return {
                "total_dialogues": 0,
                "memory_reference_rate": 0.0,
                "emotional_consistency_rate": 0.0,
                "average_length": 0
            }

        memory_refs = sum(1 for a in analytics if a.contains_memory_reference)
        emotionally_consistent = sum(1 for a in analytics if a.emotional_consistency)
        total_length = sum(a.dialogue_length for a in analytics)

        return {
            "total_dialogues": len(analytics),
            "memory_reference_rate": memory_refs / len(analytics),
            "emotional_consistency_rate": emotionally_consistent / len(analytics),
            "average_length": total_length // len(analytics) if analytics else 0
        }

    async def get_model_performance(
        self,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Compare performance across different models

        Args:
            days: Number of days to analyze

        Returns:
            Model performance comparison
        """
        cutoff = datetime.utcnow() - timedelta(days=days)

        query = select(DialogueAnalytics).where(
            DialogueAnalytics.generated_at >= cutoff
        )

        result = await self.db.execute(query)
        analytics = result.scalars().all()

        models = {}
        for a in analytics:
            if a.model_used not in models:
                models[a.model_used] = {
                    "count": 0,
                    "total_time_ms": 0.0,
                    "total_cost": 0.0,
                    "total_tokens": 0
                }

            models[a.model_used]["count"] += 1
            models[a.model_used]["total_time_ms"] += a.generation_time_ms

            if a.estimated_cost:
                models[a.model_used]["total_cost"] += a.estimated_cost
            if a.tokens_used:
                models[a.model_used]["total_tokens"] += a.tokens_used

        # Calculate averages
        for model, stats in models.items():
            count = stats["count"]
            stats["average_time_ms"] = stats["total_time_ms"] / count
            stats["average_cost"] = stats["total_cost"] / count
            stats["average_tokens"] = stats["total_tokens"] / count

        return models

    async def get_program_performance(
        self,
        npc_id: Optional[int] = None,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Analyze performance by prompt program

        Args:
            npc_id: Optional NPC filter
            days: Number of days to analyze

        Returns:
            Program performance data
        """
        cutoff = datetime.utcnow() - timedelta(days=days)

        query = select(DialogueAnalytics).where(
            DialogueAnalytics.generated_at >= cutoff
        )

        if npc_id:
            query = query.where(DialogueAnalytics.npc_id == npc_id)

        result = await self.db.execute(query)
        analytics = result.scalars().all()

        programs = {}
        for a in analytics:
            if a.program_id not in programs:
                programs[a.program_id] = {
                    "uses": 0,
                    "responded_count": 0,
                    "continued_count": 0
                }

            programs[a.program_id]["uses"] += 1
            if a.player_responded:
                programs[a.program_id]["responded_count"] += 1
            if a.conversation_continued:
                programs[a.program_id]["continued_count"] += 1

        # Calculate rates
        for program_id, stats in programs.items():
            uses = stats["uses"]
            stats["response_rate"] = stats["responded_count"] / uses
            stats["continuation_rate"] = stats["continued_count"] / uses

        return programs

    async def compare_ab_variants(
        self,
        variant_a: str,
        variant_b: str,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Compare two A/B test variants

        Args:
            variant_a: First variant ID
            variant_b: Second variant ID
            days: Number of days to analyze

        Returns:
            Comparison data
        """
        cutoff = datetime.utcnow() - timedelta(days=days)

        # Get data for both variants
        variants_data = {}

        for variant_id in [variant_a, variant_b]:
            query = select(DialogueAnalytics).where(
                and_(
                    DialogueAnalytics.variant_id == variant_id,
                    DialogueAnalytics.generated_at >= cutoff
                )
            )

            result = await self.db.execute(query)
            analytics = result.scalars().all()

            responded = sum(1 for a in analytics if a.player_responded)
            continued = sum(1 for a in analytics if a.conversation_continued)

            variants_data[variant_id] = {
                "total_uses": len(analytics),
                "response_rate": responded / len(analytics) if analytics else 0.0,
                "continuation_rate": continued / len(analytics) if analytics else 0.0
            }

        return {
            "variant_a": variants_data.get(variant_a, {}),
            "variant_b": variants_data.get(variant_b, {}),
            "period_days": days
        }

    async def get_recent_dialogues(
        self,
        npc_id: int,
        user_id: int,
        limit: int = 20
    ) -> List[DialogueAnalytics]:
        """
        Get recent dialogue analytics for an NPC-user pair

        Args:
            npc_id: NPC ID
            user_id: User ID
            limit: Maximum number of records

        Returns:
            List of analytics records
        """
        query = select(DialogueAnalytics).where(
            and_(
                DialogueAnalytics.npc_id == npc_id,
                DialogueAnalytics.user_id == user_id
            )
        ).order_by(desc(DialogueAnalytics.generated_at)).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())
