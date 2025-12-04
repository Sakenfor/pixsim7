"""
Cost Extractor - Extract cost data from provider responses

Provides provider-specific cost extraction logic to populate CostData models.
"""
import logging
from typing import Dict, Any, Optional

from pixsim7.backend.main.shared.schemas.telemetry_schemas import CostData
from pixsim7.backend.main.domain import OperationType

logger = logging.getLogger(__name__)

# Optional: use pixverse-py pricing helpers when available so that
# multi_shot/audio/off_peak are reflected in provider_credits.
try:  # pragma: no cover - optional dependency
    from pixverse.pricing import calculate_cost as pixverse_calculate_cost  # type: ignore
except Exception:  # pragma: no cover
    pixverse_calculate_cost = None  # type: ignore

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
        # Rough USD approximation when credits are unknown. Real credit-based
        # pricing uses pixverse_calculate_cost for provider_credits.
        "video": 0.01  # ~ $0.01 per second of video generated
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
        """Extract cost from Pixverse response

        Notes:
        - Pixverse native units are "credits", not USD.
        - When pixverse-py is available, we use its pricing helpers to
          populate provider_credits, including multi_shot/audio/off_peak.
        - estimated_cost_usd remains a rough per-second approximation.
        """
        # Pixverse returns video metadata
        video_info = response.get("video", {})
        duration_seconds = video_info.get("duration", 0)

        # If not in response, try to get from params
        if duration_seconds == 0 and params:
            duration_range = params.get("duration", {})
            duration_seconds = duration_range.get("target", duration_range.get("max", 0))

        # Get resolution and quality/model signals
        resolution = video_info.get("resolution", "1920x1080")
        quality = video_info.get("quality") or (params or {}).get("quality", "360p")
        model = video_info.get("model") or (params or {}).get("model", "v5")
        motion_mode = (params or {}).get("motion_mode")
        multi_shot = bool((params or {}).get("multi_shot"))
        audio = bool((params or {}).get("audio"))

        # Calculate rough USD cost (per-second approximation)
        cost_per_second = PROVIDER_PRICING.get("pixverse", {}).get("video", 0.01)
        estimated_cost = duration_seconds * cost_per_second

        # If SDK pricing helper is available, also record provider_credits
        provider_credits: Optional[float] = None
        if pixverse_calculate_cost is not None and duration_seconds:
            try:
                credits = pixverse_calculate_cost(
                    quality=quality,
                    duration=int(duration_seconds),
                    api_method="web-api",
                    model=model,
                    motion_mode=motion_mode,
                    multi_shot=multi_shot,
                    audio=audio,
                )
                provider_credits = float(credits)
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("pixverse_calculate_cost_failed", error=str(exc))

        # Video generation doesn't use tokens, but we track compute time
        compute_seconds = response.get("processing_time", duration_seconds)

        return CostData(
            tokens_used=0,  # Video generation doesn't use tokens
            estimated_cost_usd=estimated_cost,
            compute_seconds=compute_seconds,
            video_seconds=duration_seconds,
            resolution=resolution,
            provider_credits=provider_credits,
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
                # Estimate from target duration and, for Pixverse, optionally
                # include provider_credits via pixverse_calculate_cost.
                duration_config = params.get("duration", {})
                target_duration = duration_config.get("target", 0)

                if target_duration > 0:
                    pricing = PROVIDER_PRICING.get(provider_id, {}).get("video", 0)
                    estimated_usd = target_duration * pricing

                    if provider_id == "pixverse" and pixverse_calculate_cost is not None:
                        quality = params.get("quality", "360p")
                        model = params.get("model", "v5")
                        motion_mode = params.get("motion_mode")
                        multi_shot = bool(params.get("multi_shot"))
                        audio = bool(params.get("audio"))
                        provider_credits: Optional[float] = None
                        try:
                            credits = pixverse_calculate_cost(
                                quality=quality,
                                duration=int(target_duration),
                                api_method="web-api",
                                model=model,
                                motion_mode=motion_mode,
                                multi_shot=multi_shot,
                                audio=audio,
                            )
                            provider_credits = float(credits)
                        except Exception as exc:  # pragma: no cover
                            logger.warning("pixverse_calculate_cost_failed", error=str(exc))

                        return CostData(
                            tokens_used=0,
                            estimated_cost_usd=estimated_usd,
                            video_seconds=target_duration,
                            provider_credits=provider_credits,
                        )

                    # RunwayML or Pixverse without SDK helper: duration-only estimate
                    return CostData(
                        tokens_used=0,
                        estimated_cost_usd=estimated_usd,
                        video_seconds=target_duration,
                    )

            # For LLM providers, we'd need to estimate tokens from prompt length
            # This is harder and less accurate, so we skip for now

            return None

        except Exception as e:
            logger.error(f"Failed to estimate cost from params: {e}")
            return None
