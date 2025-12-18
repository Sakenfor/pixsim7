"""
Provider abstraction - clean interface for video generation providers

CLEAN VERSION: Single execute() method instead of per-operation methods

Provider Integration Guide:
    To add a new provider, implement this interface and create a manifest.
    See docs/systems/generation/adding-providers.md for details.

    Required:
        - provider_id: Unique identifier
        - supported_operations: List of OperationType values
        - map_parameters(): Convert generic params to provider format
        - execute(): Submit generation to provider
        - check_status(): Poll for completion

    Optional (override for advanced features):
        - get_manifest(): Return provider metadata (domains, credit_types)
        - prepare_execution_params(): Resolve files for multipart uploads
        - extract_account_data(): Parse auth data from browser capture
        - get_operation_parameter_spec(): UI form generation hints
        - estimate_credits() / compute_actual_credits(): Credit estimation
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, TYPE_CHECKING
from dataclasses import dataclass
from datetime import datetime

from pixsim7.backend.main.domain import (
    OperationType,
    ProviderStatus,
    ProviderAccount,
    Generation,
)

if TYPE_CHECKING:
    from pixsim7.backend.main.shared.schemas.provider_schemas import ProviderManifest


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
        # Manifest will be attached by registry during provider loading
        self._manifest = None

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

    # ===== MANIFEST-DRIVEN METADATA =====

    def get_manifest(self):
        """
        Get provider manifest (attached by registry during loading).

        Returns the manifest if it was attached by the registry, None otherwise.
        Providers should not override this - metadata belongs in manifest.py.

        Returns:
            ProviderManifest or None
        """
        return getattr(self, '_manifest', None)

    def get_domains(self) -> list[str]:
        """
        Get provider domains from manifest.

        Returns:
            List of domains (e.g., ["sora.com", "chatgpt.com"])
        """
        manifest = self.get_manifest()
        if manifest and hasattr(manifest, 'domains'):
            return manifest.domains or []
        return []

    def get_credit_types(self) -> list[str]:
        """
        Get valid credit types for this provider from manifest.

        Returns:
            List of credit type keys (e.g., ["web", "openapi"])
        """
        manifest = self.get_manifest()
        if manifest and hasattr(manifest, 'credit_types'):
            return manifest.credit_types or []
        return []

    def get_display_name(self) -> str:
        """
        Get provider display name from manifest.

        Returns:
            Display name (e.g., "OpenAI Sora"), falls back to provider_id
        """
        manifest = self.get_manifest()
        if manifest and hasattr(manifest, 'name'):
            return manifest.name
        return self.provider_id

    # ===== FILE PREPARATION =====

    def requires_file_preparation(self) -> bool:
        """
        Whether this provider requires file preparation before execution.

        Override this to return True if your provider overrides prepare_execution_params().
        Default: False (no file preparation needed)

        Returns:
            True if file preparation is required
        """
        return False

    def prepare_execution_params(
        self,
        operation_type,
        params: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Prepare execution parameters (e.g., download files, resolve asset references).

        This is called before execute() if requires_file_preparation() returns True.
        Override in provider implementations that need to prepare local files.

        Args:
            operation_type: Operation type
            params: Mapped parameters (from map_parameters)

        Returns:
            Prepared parameters with local file paths

        Raises:
            ProviderError: If preparation fails
        """
        # Check for common footgun: prepare_execution_params overridden but requires_file_preparation returns False
        if not self.requires_file_preparation():
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                f"Provider {self.provider_id} has prepare_execution_params() but requires_file_preparation() "
                f"returns False. File preparation will be skipped. Override requires_file_preparation() to return True."
            )
        return params

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

    # NOTE: Removed duplicate method definitions that were here.
    # The canonical methods are defined earlier in this file (lines ~196-242):
    # - get_manifest() - returns _manifest attached by registry
    # - get_domains() - gets domains from manifest
    # - get_credit_types() - gets credit_types from manifest
    # - get_display_name() - gets name from manifest
    # - requires_file_preparation() - returns False by default
    # - prepare_execution_params() - returns params unchanged by default
    #
    # Providers should NOT override get_manifest() - metadata belongs in manifest.py.
    # The registry attaches the manifest during plugin loading.

    # ===== FILE/INPUT RESOLUTION (async version for ProviderService) =====

    async def prepare_execution_params_async(
        self,
        generation: Generation,
        mapped_params: Dict[str, Any],
        resolve_source_fn,
    ) -> Dict[str, Any]:
        """
        Prepare execution parameters, optionally resolving files for multipart uploads.

        This hook is called by ProviderService before execute(). Providers that need
        local file paths (e.g., for multipart form uploads) should override this to:
        1. Identify which params reference files (URLs, asset refs)
        2. Use resolve_source_fn() to download/resolve to local paths
        3. Return updated params with local paths and cleanup list

        The default implementation returns mapped_params unchanged (no file resolution).

        Args:
            generation: The Generation being processed
            mapped_params: Parameters already mapped via map_parameters()
            resolve_source_fn: Async function to resolve sources to local files.
                Signature: async (source, user_id, default_suffix) -> (local_path, temp_paths)
                - source: URL string, asset ref ("asset_123"), dict {"asset_id": 123}, etc.
                - user_id: User ID for asset lookup
                - default_suffix: File extension default (e.g., ".jpg")
                - Returns: (local_path, list_of_temp_paths_to_cleanup)

        Returns:
            Dict with execution params. May include:
            - Original params plus resolved file paths
            - "_temp_paths": list of temp file paths to clean up after execute()

        Example (Remaker inpaint):
            async def prepare_execution_params_async(self, generation, mapped_params, resolve_source_fn):
                original_path, temps1 = await resolve_source_fn(
                    mapped_params["original_image_source"], generation.user_id, ".jpg"
                )
                mask_path, temps2 = await resolve_source_fn(
                    mapped_params["mask_source"], generation.user_id, ".png"
                )
                return {
                    **mapped_params,
                    "original_image_path": original_path,
                    "mask_path": mask_path,
                    "_temp_paths": temps1 + temps2,
                }
        """
        return mapped_params

    # ===== CREDIT ESTIMATION =====

    def estimate_credits(
        self,
        operation_type: OperationType,
        params: Dict[str, Any],
    ) -> Optional[int]:
        """
        Estimate credits required for a generation before submission.

        Used by creation_service to set estimated_credits on the Generation.
        Override in provider implementations to provide accurate estimates.

        Args:
            operation_type: Operation type (text_to_video, image_to_video, etc.)
            params: Canonical parameters for the generation

        Returns:
            Estimated credit cost, or None if estimation not supported
        """
        return None

    def compute_actual_credits(
        self,
        generation: Generation,
        actual_duration: Optional[float] = None,
    ) -> Optional[int]:
        """
        Compute actual credits for a completed generation.

        Used by billing_service to determine final credit charge.
        Override in provider implementations to compute based on actual results.

        Args:
            generation: The completed generation
            actual_duration: Actual duration from provider (for videos)

        Returns:
            Actual credit cost, or None if computation not supported
        """
        return None

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
    ProviderConcurrentLimitError as ConcurrentLimitError,
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
    "ConcurrentLimitError",
    "UnsupportedOperationError",
]
