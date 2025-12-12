"""
Cost Extractor - Extract cost data from Generation billing fields

Single source of truth: Generation.billing fields (actual_credits, estimated_credits).
No recomputation from params - what we charged is what we display.
"""
import logging
from typing import Optional, TYPE_CHECKING

from pixsim7.backend.main.shared.schemas.telemetry_schemas import CostData
from pixsim7.backend.main.domain import BillingState

if TYPE_CHECKING:
    from pixsim7.backend.main.domain import Generation

logger = logging.getLogger(__name__)


# Stub for legacy USD pricing fallback (deprecated - use pixverse_pricing helpers instead)
PROVIDER_PRICING: dict[str, dict[str, float]] = {}


class CostExtractor:
    """
    Extract cost data from Generation billing fields.

    This is the single source of truth for generation costs.
    Reads directly from Generation.billing fields - no recomputation.
    """

    @staticmethod
    def extract_from_generation(generation: "Generation") -> Optional[CostData]:
        """
        Extract cost data from Generation billing fields.

        Args:
            generation: Generation model with billing fields

        Returns:
            CostData with provider_credits, or None if not available
        """
        # Charged generations: use actual_credits
        if generation.billing_state == BillingState.CHARGED:
            if generation.actual_credits is not None:
                return CostData(
                    tokens_used=0,
                    estimated_cost_usd=None,
                    provider_credits=float(generation.actual_credits),
                )

        # Skipped generations (failed/cancelled): zero cost
        if generation.billing_state == BillingState.SKIPPED:
            return CostData(
                tokens_used=0,
                estimated_cost_usd=0.0,
                provider_credits=0.0,
            )

        # Pending/failed billing: use estimated_credits as fallback
        if generation.estimated_credits is not None:
            return CostData(
                tokens_used=0,
                estimated_cost_usd=None,
                provider_credits=float(generation.estimated_credits),
            )

        return None
