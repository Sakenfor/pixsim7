"""
Provider abstraction - clean interface for video generation providers

CLEAN VERSION: Single execute() method instead of per-operation methods
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime

from pixsim7.backend.main.domain import (
    OperationType,
    ProviderStatus,
    ProviderAccount,
)


@dataclass
class GenerationResult:
    """Result from a video generation request"""
    provider_job_id: str  # Provider's internal job ID
    provider_video_id: str | None = None  # Provider's video ID (if immediate)
    status: ProviderStatus = ProviderStatus.PENDING
    video_url: str | None = None
    thumbnail_url: str | None = None
    estimated_completion: datetime | None = None
    error_message: str | None = None
    metadata: Dict[str, Any] | None = None  # Provider-specific metadata

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


@dataclass
class ProviderStatusResult:
    """Result from checking video status"""
    status: ProviderStatus
    video_url: str | None = None
    thumbnail_url: str | None = None
    progress: float | None = None  # 0.0 to 1.0
    error_message: str | None = None
    metadata: Dict[str, Any] | None = None
    width: int | None = None
    height: int | None = None
    duration_sec: float | None = None
    provider_video_id: str | None = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class Provider(ABC):
    """
    Abstract provider interface

    Each provider (Pixverse, Runway, Pika) implements this interface.

    Design principles:
    - Single execute() method (operation_type determines behavior)
    - Explicit parameters (no auto-detection)
    - Clean separation: Provider only handles API calls, not business logic
    """

    def __init__(self, config: Dict[str, Any] | None = None):
        """
        Initialize provider

        Args:
            config: Provider-specific configuration
        """
        self.config = config or {}

    @property
    @abstractmethod
    def provider_id(self) -> str:
        """
        Provider identifier

        Returns:
            Provider ID: 'pixverse', 'runway', 'pika'
        """
        pass

    @property
    @abstractmethod
    def supported_operations(self) -> list[OperationType]:
        """
        Supported operations

        Returns:
            List of supported operation types
        """
        pass

    @abstractmethod
    def map_parameters(
        self,
        operation_type: OperationType,
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Map generic parameters to provider-specific format

        Args:
            operation_type: Operation type
            params: Generic parameters (prompt, model, quality, etc.)

        Returns:
            Provider-specific payload

        Example:
            Generic:
                {"prompt": "sunset", "quality": "720p", "duration": 5}
            Pixverse:
                {"prompt": "sunset", "quality": 0, "duration": 5, "model": "v5"}
        """
        pass

    @abstractmethod
    async def execute(
        self,
        operation_type: OperationType,
        account: ProviderAccount,
        params: Dict[str, Any]
    ) -> GenerationResult:
        """
        Execute video generation operation

        Args:
            operation_type: Operation type (text_to_video, image_to_video, etc.)
            account: Provider account to use
            params: Operation parameters (already mapped via map_parameters)

        Returns:
            GenerationResult with provider job ID and initial status

        Raises:
            ProviderError: Provider-specific error
            AuthenticationError: Invalid credentials
            QuotaExceededError: No credits remaining
        """
        pass

    @abstractmethod
    async def check_status(
        self,
        account: ProviderAccount,
        provider_job_id: str,
        operation_type: Optional[OperationType] = None,
    ) -> ProviderStatusResult:
        """
        Check job status

        Args:
            account: Provider account
            provider_job_id: Provider's job ID (from execute)
            operation_type: Optional operation type (needed for IMAGE_TO_IMAGE)

        Returns:
            ProviderStatusResult with current status and URLs

        Raises:
            ProviderError: Provider-specific error
            JobNotFoundError: Job ID not found
        """
        pass

    async def extract_embedded_assets(
        self,
        provider_video_id: str,
        extra_metadata: Dict[str, Any] | None = None,
    ) -> list[Dict[str, Any]]:
        """
        Optional hook: extract embedded or source assets used to generate a provider video.

        This enables a sync process to pull referenced prompts/images so they become
        first-class `Asset` records in our system (provider agnostic).

        Args:
            provider_video_id: Provider's video identifier (e.g., Pixverse video id)
            extra_metadata: Optional provider-specific metadata for the video
                (e.g., Pixverse personal-list payload). Callers that already
                have this payload (such as import/sync jobs) can pass it in to
                avoid re-fetching from the provider.

        Returns:
            List of dicts with keys:
                type: 'image' | 'prompt' | 'audio' | 'mask' | etc.
                media_type: optional mapped MediaType value ('image', 'video', etc.)
                remote_url: URL to fetch (if applicable)
                provider_asset_id: provider-specific ID for the embedded asset
                prompt: textual prompt (for type='prompt')
                width/height: optional dimensions

        Default implementation returns empty list; providers override when supported.
        The default ignores extra_metadata.
        """
        return []

    async def cancel(
        self,
        account: ProviderAccount,
        provider_job_id: str
    ) -> bool:
        """
        Cancel a running job (optional)

        Args:
            account: Provider account
            provider_job_id: Provider's job ID

        Returns:
            True if cancelled, False if not supported or already completed

        Default implementation: Not supported
        """
        return False

    async def upload_asset(
        self,
        account: ProviderAccount,
        file_path: str
    ) -> str:
        """
        Upload asset (image/video) to provider (for cross-provider operations)

        This enables using assets from one provider with another.
        For example: Upload a Pixverse video to Sora for extension.

        Args:
            account: Provider account
            file_path: Local file path to upload

        Returns:
            Provider-specific asset ID (e.g., "media_abc123")

        Raises:
            NotImplementedError: If provider doesn't support uploads
            ProviderError: Upload failed

        Default implementation: Not supported
        Override in provider if upload is supported.

        Example:
            >>> # Upload Pixverse video to Sora
            >>> sora_provider = registry.get("sora")
            >>> sora_media_id = await sora_provider.upload_asset(
            ...     account=sora_account,
            ...     file_path="/tmp/pixverse_video.mp4"
            ... )
            >>> # Now use sora_media_id in Sora API calls
        """
        raise NotImplementedError(
            f"Provider {self.provider_id} does not support asset uploads. "
            f"Cannot use cross-provider operations with this provider."
        )

    # ===== PARAMETER SPECIFICATION =====

    def get_operation_parameter_spec(self) -> dict:
        """Return structured parameter specification per supported operation.

        Format:
        {
          operation_type.value: {
             "parameters": [
                {"name": str, "type": str, "required": bool, "default": Any | None,
                 "enum": list[str] | None, "description": str | None, "group": str | None}
             ]
          }
        }

        Default implementation returns a minimal prompt-only spec.
        Providers should override to supply richer metadata (quality presets,
        dimensions, model choices, etc.). This enables dynamic form generation
        in the frontend without hard-coding provider specifics.
        """
        spec = {}
        for op in self.supported_operations:
            spec[op.value] = {
                "parameters": [
                    {
                        "name": "prompt",
                        "type": "string",
                        "required": True,
                        "default": None,
                        "enum": None,
                        "description": "Text prompt describing desired video",
                        "group": "core",
                    }
                ]
            }
        return spec

    def validate_operation(
        self,
        operation_type: OperationType
    ) -> None:
        """
        Validate that operation is supported

        Args:
            operation_type: Operation to validate

        Raises:
            ValueError: Operation not supported by this provider
        """
        if operation_type not in self.supported_operations:
            raise ValueError(
                f"Operation {operation_type.value} not supported by {self.provider_id}. "
                f"Supported: {[op.value for op in self.supported_operations]}"
            )

    async def extract_account_data(self, raw_data: dict, *, fallback_email: str = None) -> dict:
        """
        Extract account data from raw cookies/localStorage (provider-specific)

        This method parses provider-specific formats to extract:
        - email: User email (required, unless fallback_email provided)
        - jwt_token: JWT authentication token (optional)
        - cookies: Cleaned cookies dict (optional)
        - credits: Credits info {credit_type: amount} (optional)

        Args:
            raw_data: Dict with 'cookies' and 'localStorage' from content script
            fallback_email: Optional email to use if extraction fails (e.g., during auto re-auth)
                     Example: {
                         'cookies': {'_ai_token': 'eyJ...', 'session': '...'},
                         'localStorage': {'user': '{"email": "..."}', 'credits': '100'}
                     }

        Returns:
            Dict with extracted data: {
                'email': str,
                'jwt_token': str (optional),
                'cookies': dict (optional),
                'credits': dict (optional)
            }

        Raises:
            ValueError: If email cannot be extracted

        Note: Override this method in provider implementations
        """
        raise NotImplementedError(
            f"Provider {self.provider_id} must implement extract_account_data()"
        )


# ===== PROVIDER ERRORS =====
# Import shared error hierarchy for consistency

from pixsim7.backend.main.shared.errors import (
    ProviderError,
    ProviderAuthenticationError as AuthenticationError,
    ProviderQuotaExceededError as QuotaExceededError,
    ProviderJobNotFoundError as JobNotFoundError,
    ProviderContentFilteredError as ContentFilteredError,
    ProviderRateLimitError as RateLimitError,
    UnsupportedOperationError,
)

__all__ = [
    "Provider",
    "GenerationResult", 
    "ProviderStatusResult",
    "ProviderError",
    "AuthenticationError",
    "QuotaExceededError",
    "JobNotFoundError",
    "ContentFilteredError",
    "RateLimitError",
    "UnsupportedOperationError",
]
