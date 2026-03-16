"""Closed-loop primitive evaluator service.

Records per-run primitive contributions and computes aggregate effectiveness
scores with Wilson confidence intervals.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession


class PrimitiveEvaluatorService:
    """Records primitive contributions and computes effectiveness scores."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def record_contributions(
        self,
        plan_ir: Any,
        generation_id: int,
        run_id: UUID,
    ) -> int:
        """Bulk insert contribution records from a PromptPlanIR.

        Returns the number of records inserted.
        """
        from pixsim7.backend.main.domain.prompt.evaluator_models import (
            PrimitiveContribution,
        )

        records = []
        for prim in plan_ir.selected_primitives:
            records.append(PrimitiveContribution(
                run_id=run_id,
                generation_id=generation_id,
                primitive_id=prim.primitive_id,
                target_key=prim.target_key,
                weight=prim.score if prim.score is not None else 1.0,
                plan_hash=plan_ir.deterministic_hash,
                outcome="pending",
            ))

        for record in records:
            self.db.add(record)

        if records:
            await self.db.flush()

        return len(records)

    async def record_outcome(
        self,
        run_id: UUID,
        outcome_signal: str,
    ) -> int:
        """Update all contributions for a run with the outcome signal.

        Returns the number of records updated.
        """
        from pixsim7.backend.main.domain.prompt.evaluator_models import (
            PrimitiveContribution,
        )

        stmt = (
            update(PrimitiveContribution)
            .where(PrimitiveContribution.run_id == run_id)
            .values(outcome=outcome_signal, outcome_signal=outcome_signal)
        )
        result = await self.db.execute(stmt)
        await self.db.flush()
        return result.rowcount  # type: ignore[return-value]

    async def recompute_scores(
        self,
        primitive_ids: Optional[List[str]] = None,
    ) -> int:
        """Recompute aggregate effectiveness scores.

        Uses Wilson score interval lower bound for confidence ranking.
        Returns the number of scores updated.
        """
        from pixsim7.backend.main.domain.prompt.evaluator_models import (
            PrimitiveContribution,
            PrimitiveEffectivenessScore,
        )

        # Find all primitives with contributions
        query = select(PrimitiveContribution.primitive_id).distinct()
        if primitive_ids:
            query = query.where(PrimitiveContribution.primitive_id.in_(primitive_ids))
        result = await self.db.execute(query)
        prim_ids = [row[0] for row in result.all()]

        updated = 0
        now = datetime.now(timezone.utc)

        for pid in prim_ids:
            # Get all non-pending contributions for this primitive
            contrib_query = select(PrimitiveContribution).where(
                PrimitiveContribution.primitive_id == pid,
                PrimitiveContribution.outcome != "pending",
            )
            contrib_result = await self.db.execute(contrib_query)
            contribs = list(contrib_result.scalars().all())

            if not contribs:
                continue

            sample_count = len(contribs)
            successes = sum(
                1 for c in contribs if c.outcome_signal in ("success", "quality_high")
            )
            success_rate = successes / sample_count if sample_count > 0 else 0.0
            avg_weight = (
                sum(c.weight for c in contribs) / sample_count
                if sample_count > 0
                else 0.0
            )
            confidence = _wilson_lower_bound(successes, sample_count)

            # Build metadata breakdown
            outcome_breakdown: Dict[str, int] = {}
            for c in contribs:
                sig = c.outcome_signal or "unknown"
                outcome_breakdown[sig] = outcome_breakdown.get(sig, 0) + 1

            # Upsert score
            existing_query = select(PrimitiveEffectivenessScore).where(
                PrimitiveEffectivenessScore.primitive_id == pid
            )
            existing_result = await self.db.execute(existing_query)
            existing = existing_result.scalars().first()

            if existing:
                existing.sample_count = sample_count
                existing.success_rate = success_rate
                existing.avg_weight = avg_weight
                existing.confidence = confidence
                existing.last_updated = now
                existing.score_metadata = {"outcome_breakdown": outcome_breakdown}
                self.db.add(existing)
            else:
                score = PrimitiveEffectivenessScore(
                    primitive_id=pid,
                    sample_count=sample_count,
                    success_rate=success_rate,
                    avg_weight=avg_weight,
                    confidence=confidence,
                    last_updated=now,
                    score_metadata={"outcome_breakdown": outcome_breakdown},
                )
                self.db.add(score)

            updated += 1

        if updated:
            await self.db.flush()

        return updated

    async def get_effectiveness(
        self,
        primitive_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Get effectiveness score for a single primitive."""
        from pixsim7.backend.main.domain.prompt.evaluator_models import (
            PrimitiveEffectivenessScore,
        )

        query = select(PrimitiveEffectivenessScore).where(
            PrimitiveEffectivenessScore.primitive_id == primitive_id
        )
        result = await self.db.execute(query)
        score = result.scalars().first()
        if not score:
            return None

        return {
            "primitive_id": score.primitive_id,
            "sample_count": score.sample_count,
            "success_rate": score.success_rate,
            "avg_weight": score.avg_weight,
            "confidence": score.confidence,
            "last_updated": score.last_updated.isoformat() if score.last_updated else None,
            "score_metadata": dict(score.score_metadata or {}),
        }

    async def list_effectiveness(
        self,
        *,
        min_samples: int = 1,
        limit: int = 50,
        sort_by: str = "confidence",
    ) -> List[Dict[str, Any]]:
        """List effectiveness scores with filters."""
        from pixsim7.backend.main.domain.prompt.evaluator_models import (
            PrimitiveEffectivenessScore,
        )

        query = select(PrimitiveEffectivenessScore).where(
            PrimitiveEffectivenessScore.sample_count >= min_samples
        )

        if sort_by == "success_rate":
            query = query.order_by(PrimitiveEffectivenessScore.success_rate.desc())
        elif sort_by == "sample_count":
            query = query.order_by(PrimitiveEffectivenessScore.sample_count.desc())
        else:
            query = query.order_by(PrimitiveEffectivenessScore.confidence.desc())

        query = query.limit(limit)
        result = await self.db.execute(query)
        scores = list(result.scalars().all())

        return [
            {
                "primitive_id": s.primitive_id,
                "sample_count": s.sample_count,
                "success_rate": s.success_rate,
                "avg_weight": s.avg_weight,
                "confidence": s.confidence,
                "last_updated": s.last_updated.isoformat() if s.last_updated else None,
                "score_metadata": dict(s.score_metadata or {}),
            }
            for s in scores
        ]


def _wilson_lower_bound(successes: int, total: int, z: float = 1.96) -> float:
    """Wilson score interval lower bound for binomial proportion.

    Provides a conservative estimate of the true success rate that accounts
    for sample size. z=1.96 corresponds to 95% confidence.
    """
    if total == 0:
        return 0.0
    p = successes / total
    denominator = 1 + z * z / total
    centre = p + z * z / (2 * total)
    spread = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)
    return max(0.0, (centre - spread) / denominator)
