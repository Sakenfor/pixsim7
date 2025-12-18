"""
Template Provider Adapter

INSTRUCTIONS:
1. Copy this file to services/provider/adapters/<yourprovider>.py
2. Rename the class and update provider_id
3. Implement all required methods
4. Implement optional methods as needed

See /docs/systems/generation/adding-providers.md for details.
"""
from __future__ import annotations

from typing import Dict, Any, Optional, TYPE_CHECKING

from pixsim7.backend.main.domain import (
    OperationType,
    ProviderStatus,
    ProviderAccount,
    Generation,
)
from pixsim7.backend.main.services.provider.base import (
    Provider,
    GenerationResult,
    ProviderStatusResult,
    ProviderError,
    AuthenticationError,
    QuotaExceededError,
    ContentFilteredError,
)

if TYPE_CHECKING:
    from pixsim7.backend.main.domain.providers.schemas import ProviderManifest

# Use structured logging
from pixsim_logging import get_logger

logger = get_logger()


class MyProvider(Provider):
    """
    Template provider implementation.

    Replace 'MyProvider' with your provider name (e.g., 'RunwayProvider').
    """

    # API base URL for your provider
    API_BASE = "https://api.myprovider.ai"

    # ===== REQUIRED: Identity =====

    @property
    def provider_id(self) -> str:
        """Unique provider identifier (must match manifest.id)."""
        return "myprovider"

    @property
    def supported_operations(self) -> list[OperationType]:
        """List of supported operation types."""
        return [
            OperationType.TEXT_TO_VIDEO,
            OperationType.IMAGE_TO_VIDEO,
            # Add other operations your provider supports
        ]

    # ===== RECOMMENDED: Provider Metadata =====

    def get_manifest(self) -> "ProviderManifest":
        """
        Return provider manifest with domains and credit types.

        This enables:
        - URL detection (domains)
        - Credit tracking (credit_types)
        - UI display (name, description)
        """
        from pixsim7.backend.main.domain.providers.schemas import ProviderManifest, ProviderKind
        return ProviderManifest(
            id="myprovider",
            name="My Provider",
            version="1.0.0",
            description="Description of my provider",
            author="Your Name",
            kind=ProviderKind.VIDEO,
            enabled=True,
            requires_credentials=True,
            domains=["myprovider.ai", "app.myprovider.ai"],
            credit_types=["web"],
            status_mapping_notes="1=completed, 2=processing, 3=failed",
        )

    # ===== REQUIRED: Parameter Mapping =====

    def map_parameters(
        self,
        operation_type: OperationType,
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Map generic parameters to provider-specific format.

        Args:
            operation_type: The operation being performed
            params: Generic parameters from the request

        Returns:
            Provider-specific parameter dict

        Example transformation:
            Input:  {"prompt": "sunset", "quality": "720p", "duration": 5}
            Output: {"text": "sunset", "resolution": "hd", "length_seconds": 5}
        """
        mapped: Dict[str, Any] = {}

        # Map common parameters
        if "prompt" in params and params["prompt"]:
            mapped["prompt"] = params["prompt"]

        if "quality" in params:
            # Map quality to provider's format
            quality_map = {
                "360p": "sd",
                "720p": "hd",
                "1080p": "fhd",
            }
            mapped["resolution"] = quality_map.get(params["quality"], "hd")

        if "duration" in params:
            mapped["duration"] = int(params["duration"])

        # Add operation-specific mappings
        if operation_type == OperationType.IMAGE_TO_VIDEO:
            if "image_url" in params:
                mapped["input_image"] = params["image_url"]

        return mapped

    # ===== REQUIRED: Execution =====

    async def execute(
        self,
        operation_type: OperationType,
        account: ProviderAccount,
        params: Dict[str, Any]
    ) -> GenerationResult:
        """
        Submit generation to provider.

        Args:
            operation_type: Operation type
            account: Provider account with credentials
            params: Mapped parameters (from map_parameters)

        Returns:
            GenerationResult with provider_job_id

        Raises:
            AuthenticationError: Invalid credentials
            QuotaExceededError: No credits
            ProviderError: API error
        """
        import httpx

        # Build request headers with authentication
        headers = self._build_headers(account)

        # Build request payload
        payload = {
            "type": operation_type.value,
            **params,
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.API_BASE}/v1/generate",
                    headers=headers,
                    json=payload,
                )

                # Handle auth errors
                if response.status_code == 401:
                    raise AuthenticationError(self.provider_id, "Invalid token")
                if response.status_code == 402:
                    raise QuotaExceededError(self.provider_id, "Insufficient credits")

                response.raise_for_status()
                data = response.json()

            # Extract job ID from response
            job_id = data.get("job_id") or data.get("id")
            if not job_id:
                raise ProviderError(f"No job_id in response: {data}")

            return GenerationResult(
                provider_job_id=str(job_id),
                status=ProviderStatus.PENDING,
                metadata={"raw_response": data},
            )

        except httpx.HTTPStatusError as e:
            raise ProviderError(f"HTTP error: {e.response.status_code}") from e
        except httpx.HTTPError as e:
            raise ProviderError(f"Network error: {e}") from e

    # ===== REQUIRED: Status Polling =====

    async def check_status(
        self,
        account: ProviderAccount,
        provider_job_id: str,
        operation_type: Optional[OperationType] = None,
    ) -> ProviderStatusResult:
        """
        Check job status on provider.

        Args:
            account: Provider account
            provider_job_id: Job ID from execute()
            operation_type: Optional, needed for some providers

        Returns:
            ProviderStatusResult with current status
        """
        import httpx

        headers = self._build_headers(account)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.API_BASE}/v1/jobs/{provider_job_id}",
                    headers=headers,
                )
                response.raise_for_status()
                data = response.json()

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                raise AuthenticationError(self.provider_id, "Invalid token")
            raise ProviderError(f"Status check failed: {e.response.status_code}") from e
        except httpx.HTTPError as e:
            raise ProviderError(f"Network error: {e}") from e

        # Map provider status to ProviderStatus
        # TODO: Update this mapping for your provider's status codes
        status_code = data.get("status")

        if status_code == 1 or status_code == "completed":
            return ProviderStatusResult(
                status=ProviderStatus.COMPLETED,
                video_url=data.get("output_url"),
                thumbnail_url=data.get("thumbnail_url"),
                provider_video_id=data.get("video_id") or provider_job_id,
                duration_sec=data.get("duration"),
                width=data.get("width"),
                height=data.get("height"),
            )

        elif status_code == 2 or status_code == "processing":
            return ProviderStatusResult(
                status=ProviderStatus.PROCESSING,
                progress=data.get("progress", 0.5),
                provider_video_id=provider_job_id,
            )

        elif status_code == 3 or status_code == "failed":
            return ProviderStatusResult(
                status=ProviderStatus.FAILED,
                error_message=data.get("error") or "Generation failed",
                provider_video_id=provider_job_id,
            )

        elif status_code == 4 or status_code == "filtered":
            return ProviderStatusResult(
                status=ProviderStatus.FILTERED,
                error_message=data.get("error") or "Content filtered",
                provider_video_id=provider_job_id,
            )

        else:
            # Unknown status - treat as processing
            logger.warning(
                "unknown_provider_status",
                provider_id=self.provider_id,
                job_id=provider_job_id,
                status=status_code,
            )
            return ProviderStatusResult(
                status=ProviderStatus.PROCESSING,
                provider_video_id=provider_job_id,
            )

    # ===== RECOMMENDED: Account Data Extraction =====

    async def extract_account_data(
        self,
        raw_data: dict,
        *,
        fallback_email: str = None
    ) -> dict:
        """
        Extract account data from browser-captured auth.

        Called when user adds an account via the browser extension.

        Args:
            raw_data: Dict with 'cookies' and 'localStorage' from extension
            fallback_email: Email to use if extraction fails

        Returns:
            Dict with: email, jwt_token, cookies, provider_metadata (optional)

        Raises:
            ValueError: If required data cannot be extracted
        """
        cookies = raw_data.get("cookies") or {}
        local_storage = raw_data.get("localStorage") or {}

        # Extract token from cookies or localStorage
        token = (
            cookies.get("auth_token")
            or local_storage.get("token")
            or raw_data.get("token")
        )

        if not token:
            raise ValueError(f"{self.provider_id}: auth token not found")

        # Extract email (provider-specific location)
        email = (
            raw_data.get("email")
            or local_storage.get("user_email")
            or fallback_email
        )

        if not email:
            # Try to decode JWT to get email
            try:
                import base64
                import json
                parts = token.split(".")
                if len(parts) == 3:
                    payload = base64.urlsafe_b64decode(parts[1] + "==")
                    jwt_data = json.loads(payload)
                    email = jwt_data.get("email")
            except Exception:
                pass

        if not email:
            raise ValueError(f"{self.provider_id}: email not found")

        return {
            "email": email,
            "jwt_token": token,
            "cookies": cookies,
            # Add any provider-specific metadata
            "provider_metadata": {
                "user_id": raw_data.get("user_id"),
            },
        }

    # ===== OPTIONAL: File Preparation =====

    def requires_file_preparation(self) -> bool:
        """
        Return True if provider needs local file paths for multipart uploads.

        Override this and prepare_execution_params() for providers that
        require uploading files via multipart form data.
        """
        return False

    async def prepare_execution_params(
        self,
        generation: Generation,
        mapped_params: Dict[str, Any],
        resolve_source_fn,
    ) -> Dict[str, Any]:
        """
        Resolve file sources to local paths for multipart uploads.

        Only implement if requires_file_preparation() returns True.

        Args:
            generation: The generation being processed
            mapped_params: Parameters from map_parameters()
            resolve_source_fn: Async function to resolve URLs/assets to local files
                Signature: (source, user_id, default_suffix) -> (local_path, temp_paths)

        Returns:
            Updated params dict with local file paths and _temp_paths list
        """
        # Example for a provider needing image upload:
        #
        # image_url = mapped_params.get("image_url")
        # if image_url:
        #     local_path, temps = await resolve_source_fn(
        #         image_url,
        #         generation.user_id,
        #         ".jpg",
        #     )
        #     return {
        #         **mapped_params,
        #         "local_image_path": local_path,
        #         "_temp_paths": temps,
        #     }

        return mapped_params

    # ===== OPTIONAL: UI Form Hints =====

    def get_operation_parameter_spec(self) -> dict:
        """
        Return structured parameter specification for UI form generation.

        This enables the frontend to dynamically generate forms for each operation.
        """
        return {
            "text_to_video": {
                "parameters": [
                    {
                        "name": "prompt",
                        "type": "string",
                        "required": True,
                        "description": "Text prompt describing the video",
                        "group": "core",
                    },
                    {
                        "name": "quality",
                        "type": "string",
                        "required": False,
                        "default": "720p",
                        "enum": ["360p", "720p", "1080p"],
                        "description": "Output quality",
                        "group": "settings",
                    },
                    {
                        "name": "duration",
                        "type": "integer",
                        "required": False,
                        "default": 5,
                        "description": "Duration in seconds",
                        "group": "settings",
                    },
                ]
            },
            "image_to_video": {
                "parameters": [
                    {
                        "name": "prompt",
                        "type": "string",
                        "required": True,
                        "description": "Text prompt for animation",
                        "group": "core",
                    },
                    {
                        "name": "image_url",
                        "type": "string",
                        "required": True,
                        "description": "URL of input image",
                        "group": "core",
                    },
                ]
            },
        }

    # ===== OPTIONAL: Credit Estimation =====

    def estimate_credits(
        self,
        operation_type: OperationType,
        params: Dict[str, Any],
    ) -> Optional[int]:
        """
        Estimate credits before submission.

        Returns None if estimation not supported.
        """
        # Example: Estimate based on duration
        duration = params.get("duration", 5)
        credits_per_second = 1
        return duration * credits_per_second

    def compute_actual_credits(
        self,
        generation: Generation,
        actual_duration: Optional[float] = None,
    ) -> Optional[int]:
        """
        Compute actual credits after completion.

        Returns None if computation not supported.
        """
        if actual_duration:
            return int(actual_duration)
        return None

    # ===== HELPER METHODS =====

    def _build_headers(self, account: ProviderAccount) -> Dict[str, str]:
        """Build request headers with authentication."""
        token = account.jwt_token
        if not token:
            raise AuthenticationError(self.provider_id, "Missing auth token")

        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
