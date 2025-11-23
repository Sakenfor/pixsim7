"""
Cost Extractor - Extract cost data from provider responses

Provides provider-specific cost extraction logic to populate CostData models.
"""
import logging
from typing import Dict, Any, Optional

from pixsim7.backend.main.shared.schemas.telemetry_schemas import CostData
from pixsim7.backend.main.domain import OperationType

logger = logging.getLogger(__name__)

# Provider-specific pricing (USD per unit)
# These should be moved to config/database in production
PROVIDER_PRICING = {
    "openai": {
        "gpt-4": {"input": 0.03 / 1000, "output": 0.06 / 1000},
        "gpt-3.5-turbo": {"input": 0.0015 / 1000, "output": 0.002 / 1000},
    },
    "anthropic": {
        "claude-3-opus": {"input": 0.015 / 1000, "output": 0.075 / 1000},
        "claude-3-sonnet": {"input": 0.003 / 1000, "output": 0.015 / 1000},
    },
    "pixverse": {
        # Pixverse pricing is typically per video second
        "video": 0.01  # $0.01 per second of video generated
    },
    "runwayml": {
        "video": 0.05  # $0.05 per second
    },
}


class CostExtractor:
    """
    Extract cost data from provider responses

    Each provider returns different response formats. This class normalizes
    them into CostData models for telemetry tracking.
    """

    @staticmethod
    def extract_from_provider_response(
        provider_id: str,
        operation_type: OperationType,
        provider_response: Dict[str, Any],
        generation_params: Optional[Dict[str, Any]] = None
    ) -> Optional[CostData]:
        """
        Extract cost data from provider response

        Args:
            provider_id: Provider identifier (e.g., "pixverse", "openai")
            operation_type: Type of operation
            provider_response: Raw response from provider
            generation_params: Original generation parameters (for fallback)

        Returns:
            CostData object or None if cost cannot be determined
        """
        try:
            if provider_id.startswith("openai"):
                return CostExtractor._extract_openai_cost(provider_response)
            elif provider_id.startswith("anthropic"):
                return CostExtractor._extract_anthropic_cost(provider_response)
            elif provider_id == "pixverse":
                return CostExtractor._extract_pixverse_cost(provider_response, generation_params)
            elif provider_id == "runwayml":
                return CostExtractor._extract_runwayml_cost(provider_response, generation_params)
            else:
                logger.warning(f"No cost extractor for provider: {provider_id}")
                return None

        except Exception as e:
            logger.error(f"Failed to extract cost from {provider_id} response: {e}")
            return None

    @staticmethod
    def _extract_openai_cost(response: Dict[str, Any]) -> Optional[CostData]:
        """Extract cost from OpenAI response"""
        usage = response.get("usage", {})
        if not usage:
            return None

        input_tokens = usage.get("prompt_tokens", 0)
        output_tokens = usage.get("completion_tokens", 0)
        total_tokens = usage.get("total_tokens", input_tokens + output_tokens)

        # Determine model from response
        model = response.get("model", "gpt-3.5-turbo")
        pricing = PROVIDER_PRICING.get("openai", {}).get(model, {})

        # Calculate cost
        input_cost = input_tokens * pricing.get("input", 0)
        output_cost = output_tokens * pricing.get("output", 0)
        estimated_cost = input_cost + output_cost

        return CostData(
            tokens_used=total_tokens,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            estimated_cost_usd=estimated_cost,
        )

    @staticmethod
    def _extract_anthropic_cost(response: Dict[str, Any]) -> Optional[CostData]:
        """Extract cost from Anthropic response"""
        usage = response.get("usage", {})
        if not usage:
            return None

        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)
        total_tokens = input_tokens + output_tokens

        # Determine model
        model = response.get("model", "claude-3-sonnet")
        pricing = PROVIDER_PRICING.get("anthropic", {}).get(model, {})

        # Calculate cost
        input_cost = input_tokens * pricing.get("input", 0)
        output_cost = output_tokens * pricing.get("output", 0)
        estimated_cost = input_cost + output_cost

        return CostData(
            tokens_used=total_tokens,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            estimated_cost_usd=estimated_cost,
        )

    @staticmethod
    def _extract_pixverse_cost(
        response: Dict[str, Any],
        params: Optional[Dict[str, Any]] = None
    ) -> Optional[CostData]:
        """Extract cost from Pixverse response"""
        # Pixverse returns video metadata
        video_info = response.get("video", {})
        duration_seconds = video_info.get("duration", 0)

        # If not in response, try to get from params
        if duration_seconds == 0 and params:
            duration_range = params.get("duration", {})
            duration_seconds = duration_range.get("target", duration_range.get("max", 0))

        # Get resolution for cost calculation
        resolution = video_info.get("resolution", "1920x1080")

        # Calculate cost (basic: per second of video)
        cost_per_second = PROVIDER_PRICING.get("pixverse", {}).get("video", 0.01)
        estimated_cost = duration_seconds * cost_per_second

        # Video generation doesn't use tokens, but we track compute time
        compute_seconds = response.get("processing_time", duration_seconds)

        return CostData(
            tokens_used=0,  # Video generation doesn't use tokens
            estimated_cost_usd=estimated_cost,
            compute_seconds=compute_seconds,
            video_seconds=duration_seconds,
            resolution=resolution,
        )

    @staticmethod
    def _extract_runwayml_cost(
        response: Dict[str, Any],
        params: Optional[Dict[str, Any]] = None
    ) -> Optional[CostData]:
        """Extract cost from RunwayML response"""
        # Similar to Pixverse but different pricing
        video_info = response.get("output", {})
        duration_seconds = video_info.get("duration", 0)

        if duration_seconds == 0 and params:
            duration_range = params.get("duration", {})
            duration_seconds = duration_range.get("target", 0)

        cost_per_second = PROVIDER_PRICING.get("runwayml", {}).get("video", 0.05)
        estimated_cost = duration_seconds * cost_per_second

        # RunwayML provides credits used
        credits_used = response.get("credits_used", 0)

        return CostData(
            tokens_used=0,
            estimated_cost_usd=estimated_cost,
            compute_seconds=response.get("processing_time"),
            video_seconds=duration_seconds,
            provider_credits=float(credits_used) if credits_used else None,
        )

    @staticmethod
    def estimate_cost_from_params(
        provider_id: str,
        operation_type: OperationType,
        params: Dict[str, Any]
    ) -> Optional[CostData]:
        """
        Estimate cost from parameters (fallback when response doesn't include cost)

        Args:
            provider_id: Provider identifier
            operation_type: Operation type
            params: Generation parameters

        Returns:
            Estimated CostData or None
        """
        try:
            if provider_id == "pixverse" or provider_id == "runwayml":
                # Estimate from target duration
                duration_config = params.get("duration", {})
                target_duration = duration_config.get("target", 0)

                if target_duration > 0:
                    pricing = PROVIDER_PRICING.get(provider_id, {}).get("video", 0)
                    return CostData(
                        tokens_used=0,
                        estimated_cost_usd=target_duration * pricing,
                        video_seconds=target_duration,
                    )

            # For LLM providers, we'd need to estimate tokens from prompt length
            # This is harder and less accurate, so we skip for now

            return None

        except Exception as e:
            logger.error(f"Failed to estimate cost from params: {e}")
            return None
