"""
Sora provider adapter

Adapter for OpenAI Sora video generation using sora-py SDK
"""
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
import logging
import asyncio

# Import sora-py SDK
try:  # Optional dependency guard
    from sora import SoraClient  # type: ignore
    from sora.models import Task, GenerationRequest, InpaintItem  # type: ignore
    from sora.exceptions import (  # type: ignore
        SoraError,
        AuthenticationError as SoraAuthError,
        RateLimitError as SoraRateLimitError,
        GenerationError as SoraGenerationError,
        TaskNotFoundError as SoraTaskNotFoundError,
        ContentFilteredError as SoraContentFilteredError,
    )
except ImportError:  # pragma: no cover - keep adapter importable without SDK
    SoraClient = None  # type: ignore
    Task = GenerationRequest = InpaintItem = object  # type: ignore
    SoraError = SoraAuthError = SoraRateLimitError = SoraGenerationError = SoraTaskNotFoundError = SoraContentFilteredError = Exception  # type: ignore

from pixsim7.backend.main.domain import (
    OperationType,
    ProviderStatus,
    ProviderAccount,
)
from pixsim7.backend.main.services.provider.base import (
    Provider,
    GenerationResult,
    ProviderStatusResult,
    ProviderError,
    AuthenticationError,
    QuotaExceededError,
    ContentFilteredError,
    JobNotFoundError,
    RateLimitError,
)
from pixsim7.backend.main.shared.composition_assets import composition_assets_to_refs
from pixsim7.backend.main.shared.jwt_helpers import JWTExtractor
from pixsim7.backend.main.services.provider.provider_logging import (
    log_provider_error,
)

logger = logging.getLogger(__name__)


class SoraProvider(Provider):
    """
    OpenAI Sora video generation provider

    Uses sora-py SDK for API calls
    """

    # JWT field mappings for OpenAI/Sora format
    # Define where to find each field in the JWT payload
    JWT_EXTRACTOR = JWTExtractor(
        email_paths=[
            "https://api.openai.com/profile.email",  # OpenAI's custom claim
            "email",  # Standard fallback
        ],
        user_id_paths=[
            "https://api.openai.com/auth.user_id",  # OpenAI's custom claim
            "sub",  # Standard JWT subject
        ],
        username_paths=[
            "name",
            "username",
        ]
    )

    @property
    def provider_id(self) -> str:
        return "sora"

    @property
    def supported_operations(self) -> list[OperationType]:
        return [
            OperationType.TEXT_TO_VIDEO,
            OperationType.IMAGE_TO_VIDEO,
        ]

    def _create_client(self, account: ProviderAccount):
        """
        Create Sora client from provider account

        Args:
            account: Provider account with JWT bearer token

        Returns:
            Configured SoraClient
        """
        if SoraClient is None:
            raise AuthenticationError("sora", "Sora SDK not installed")
        if not account.jwt_token:
            raise AuthenticationError("sora", "Sora requires JWT bearer token (jwt_token)")

        # Extract device ID from cookies if available
        device_id = None
        if account.cookies and isinstance(account.cookies, dict):
            device_id = account.cookies.get("oai-device-id")

        return SoraClient(
            bearer_token=account.jwt_token,
            device_id=device_id,
            poll_interval=5,
            max_poll_attempts=120,  # 10 minutes
        )

    def _map_sora_status(self, task) -> ProviderStatus:
        """
        Map Sora task status to universal ProviderStatus

        Args:
            task: Sora task object

        Returns:
            Universal ProviderStatus
        """
        status = task.status.lower()

        if status == "succeeded":
            return ProviderStatus.COMPLETED
        elif status in ["pending", "processing"]:
            return ProviderStatus.PROCESSING
        elif status == "failed":
            return ProviderStatus.FAILED
        else:
            return ProviderStatus.PROCESSING

    def map_parameters(
        self,
        operation_type: OperationType,
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Map generic parameters to Sora-specific format

        Args:
            operation_type: Operation type
            params: Generic parameters

        Returns:
            Sora-specific parameters

        Example:
            Input:  {"prompt": "a cat", "width": 480, "height": 480, "duration": 5}
            Output: {"prompt": "a cat", "width": 480, "height": 480, "n_frames": 150, "model": "turbo"}
        """
        mapped = {}

        # Common parameters
        if "prompt" in params:
            mapped["prompt"] = params["prompt"]

        # Model (turbo or standard)
        if "model" in params:
            mapped["model"] = params["model"]
        else:
            mapped["model"] = "turbo"  # Default to turbo

        # Dimensions
        if "width" in params:
            mapped["width"] = params["width"]
        else:
            mapped["width"] = 480  # Default

        if "height" in params:
            mapped["height"] = params["height"]
        else:
            mapped["height"] = 480  # Default

        # Duration (convert to frames at 30 FPS)
        if "duration" in params:
            mapped["duration"] = params["duration"]
        else:
            mapped["duration"] = 5.0  # Default 5 seconds

        # Number of variants
        if "n_variants" in params:
            mapped["n_variants"] = params["n_variants"]
        else:
            mapped["n_variants"] = 2  # Default

        # Operation-specific parameters
        if operation_type == OperationType.IMAGE_TO_VIDEO:
            # Image input
            image_source = params.get("image_url")
            if not image_source:
                refs = composition_assets_to_refs(params.get("composition_assets"), media_type="image")
                if refs:
                    image_source = refs[0]
            if image_source is not None:
                mapped["image_url"] = image_source
            elif "image_media_id" in params:
                mapped["image_media_id"] = params["image_media_id"]

        return mapped

    def get_operation_parameter_spec(self) -> dict:
        """Sora-specific parameter specification for dynamic UI forms."""
        prompt = {"name": "prompt", "type": "string", "required": True, "default": None, "enum": None, "description": "Primary text prompt", "group": "core"}
        width = {"name": "width", "type": "integer", "required": False, "default": 480, "enum": None, "description": "Frame width", "group": "dimensions", "min": 64, "max": 1280}
        height = {"name": "height", "type": "integer", "required": False, "default": 480, "enum": None, "description": "Frame height", "group": "dimensions", "min": 64, "max": 1280}
        duration = {"name": "duration", "type": "number", "required": False, "default": 5.0, "enum": None, "description": "Duration in seconds", "group": "render", "min": 1, "max": 30}
        model = {"name": "model", "type": "enum", "required": False, "default": "turbo", "enum": ["turbo", "standard"], "description": "Sora model variant", "group": "core"}
        n_variants = {"name": "n_variants", "type": "integer", "required": False, "default": 2, "enum": None, "description": "Number of variants to generate", "group": "render", "min": 1, "max": 8}
        composition_assets = {"name": "composition_assets", "type": "array", "required": False, "default": None, "enum": None, "description": "Source composition assets (image-to-video)", "group": "source"}
        image_media_id = {"name": "image_media_id", "type": "string", "required": False, "default": None, "enum": None, "description": "Uploaded image media ID", "group": "source"}
        spec = {
            "text_to_video": {"parameters": [prompt, width, height, duration, model, n_variants]},
            "image_to_video": {"parameters": [prompt, width, height, duration, model, n_variants, composition_assets, image_media_id]},
        }
        return spec

    async def execute(
        self,
        operation_type: OperationType,
        account: ProviderAccount,
        params: Dict[str, Any]
    ) -> GenerationResult:
        """
        Execute video generation operation

        Args:
            operation_type: Operation type
            account: Provider account
            params: Mapped parameters (from map_parameters)

        Returns:
            GenerationResult with task ID and status

        Raises:
            ProviderError: On API errors
        """
        # Validate operation is supported
        self.validate_operation(operation_type)

        client = self._create_client(account)

        try:
            # Build creation parameters
            create_params = {
                "prompt": params.get("prompt", ""),
                "width": params.get("width", 480),
                "height": params.get("height", 480),
                "duration": params.get("duration", 5.0),
                "model": params.get("model", "turbo"),
                "n_variants": params.get("n_variants", 2),
                "wait": False,  # Don't wait for completion - we'll poll separately
            }

            # Add image parameters if image-to-video
            if operation_type == OperationType.IMAGE_TO_VIDEO:
                if "image_url" in params:
                    create_params["image_path"] = params["image_url"]
                elif "image_media_id" in params:
                    create_params["image_media_id"] = params["image_media_id"]

            # Call sora-py (synchronous) in thread
            task = await asyncio.to_thread(
                client.create,
                **create_params
            )

            # Map status
            status = self._map_sora_status(task)

            # Get first video URL if available
            video_url = None
            thumbnail_url = None
            if task.generations and len(task.generations) > 0:
                gen = task.generations[0]
                video_url = gen.url
                if gen.encodings and gen.encodings.thumbnail:
                    thumbnail_url = gen.encodings.thumbnail.path

            # Use adaptive ETA from account if available
            estimated_seconds = account.get_estimated_completion_time()
            estimated_completion = datetime.utcnow() + timedelta(seconds=estimated_seconds)

            return GenerationResult(
                provider_job_id=task.id,
                provider_video_id=task.id,  # Task ID is the main identifier
                status=status,
                video_url=video_url,
                thumbnail_url=thumbnail_url,
                estimated_completion=estimated_completion,
                metadata={
                    "operation_type": operation_type.value,
                    "width": task.width,
                    "height": task.height,
                    "duration_sec": task.duration,
                    "n_variants": task.n_variants,
                    "model": task.model,
                    "n_frames": task.n_frames,
                }
            )

        except SoraAuthError as e:
            log_provider_error(
                provider_id="sora",
                operation="execute",
                stage="provider:submit",
                account_id=account.id,
                email=account.email,
                error=str(e),
                error_type=e.__class__.__name__,
            )
            logger.error(f"Sora authentication error: {e}")
            raise AuthenticationError("sora", str(e))
        except SoraRateLimitError as e:
            log_provider_error(
                provider_id="sora",
                operation="execute",
                stage="provider:submit",
                account_id=account.id,
                email=account.email,
                error=str(e),
                error_type=e.__class__.__name__,
            )
            logger.error(f"Sora rate limit: {e}")
            raise RateLimitError("sora", None)
        except SoraContentFilteredError as e:
            log_provider_error(
                provider_id="sora",
                operation="execute",
                stage="provider:submit",
                account_id=account.id,
                email=account.email,
                error=str(e),
                error_type=e.__class__.__name__,
            )
            logger.error(f"Sora content filtered: {e}")
            raise ContentFilteredError("sora", str(e))
        except SoraTaskNotFoundError as e:
            log_provider_error(
                provider_id="sora",
                operation="execute",
                stage="provider:submit",
                account_id=account.id,
                email=account.email,
                error=str(e),
                error_type=e.__class__.__name__,
            )
            logger.error(f"Sora task not found: {e}")
            raise JobNotFoundError("sora", "unknown")
        except SoraError as e:
            log_provider_error(
                provider_id="sora",
                operation="execute",
                stage="provider:submit",
                account_id=account.id,
                email=account.email,
                error=str(e),
                error_type=e.__class__.__name__,
            )
            logger.error(f"Sora API error: {e}", exc_info=True)
            raise ProviderError(f"Sora API error: {e}")
        except Exception as e:
            log_provider_error(
                provider_id="sora",
                operation="execute",
                stage="provider:submit",
                account_id=account.id,
                email=account.email,
                error=str(e),
                error_type=e.__class__.__name__,
            )
            logger.error(f"Unexpected Sora error: {e}", exc_info=True)
            raise ProviderError(f"Unexpected error: {e}")

    async def check_status(
        self,
        account: ProviderAccount,
        provider_job_id: str
    ) -> ProviderStatusResult:
        """
        Check status of a Sora task

        Args:
            account: Provider account
            provider_job_id: Task ID from Sora

        Returns:
            ProviderStatusResult with current status

        Raises:
            JobNotFoundError: If task not found
        """
        client = self._create_client(account)

        try:
            # Get task status
            task = await asyncio.to_thread(
                client.get_task,
                task_id=provider_job_id
            )

            # Map status
            status = self._map_sora_status(task)

            # Get video URLs from generations
            video_urls = []
            thumbnail_urls = []
            if task.generations:
                for gen in task.generations:
                    if gen.url:
                        video_urls.append(gen.url)
                    if gen.encodings and gen.encodings.thumbnail:
                        thumbnail_urls.append(gen.encodings.thumbnail.path)

            # Calculate progress
            progress = 0.0
            if task.progress_pct is not None:
                progress = task.progress_pct
            elif status == ProviderStatus.COMPLETED:
                progress = 100.0
            elif status == ProviderStatus.PROCESSING:
                progress = 50.0  # Estimate

            return ProviderStatusResult(
                status=status,
                video_url=video_urls[0] if video_urls else None,
                thumbnail_url=thumbnail_urls[0] if thumbnail_urls else None,
                progress=progress,
                width=task.width,
                height=task.height,
                duration_sec=task.duration,
                error_message=task.failure_reason,
                metadata={
                    "all_video_urls": video_urls,
                    "all_thumbnail_urls": thumbnail_urls,
                    "n_variants": len(task.generations) if task.generations else 0,
                    "progress_pos_in_queue": task.progress_pos_in_queue,
                }
            )

        except SoraTaskNotFoundError as e:
            log_provider_error(
                provider_id="sora",
                operation="check_status",
                stage="provider:status",
                account_id=account.id,
                email=account.email,
                error=str(e),
                error_type=e.__class__.__name__,
                extra={"provider_job_id": provider_job_id},
            )
            raise JobNotFoundError("sora", provider_job_id)
        except SoraAuthError as e:
            log_provider_error(
                provider_id="sora",
                operation="check_status",
                stage="provider:status",
                account_id=account.id,
                email=account.email,
                error=str(e),
                error_type=e.__class__.__name__,
                extra={"provider_job_id": provider_job_id},
            )
            raise AuthenticationError("sora", str(e))
        except Exception as e:
            log_provider_error(
                provider_id="sora",
                operation="check_status",
                stage="provider:status",
                account_id=account.id,
                email=account.email,
                error=str(e),
                error_type=e.__class__.__name__,
                extra={"provider_job_id": provider_job_id},
            )
            logger.error(f"Error checking Sora status: {e}", exc_info=True)
            raise ProviderError(f"Error checking status: {e}")

    async def cancel(
        self,
        account: ProviderAccount,
        provider_job_id: str
    ) -> bool:
        """
        Cancel a Sora task

        Args:
            account: Provider account
            provider_job_id: Task ID to cancel

        Returns:
            True if cancelled successfully
        """
        client = self._create_client(account)

        try:
            success = await asyncio.to_thread(
                client.cancel_task,
                task_id=provider_job_id
            )
            return success
        except Exception as e:
            log_provider_error(
                provider_id="sora",
                operation="cancel",
                stage="provider:status",
                account_id=account.id,
                email=account.email,
                error=str(e),
                error_type=e.__class__.__name__,
                extra={"provider_job_id": provider_job_id},
                severity="warning",
            )
            logger.error(f"Error cancelling Sora task: {e}", exc_info=True)
            return False

    async def extract_account_data(self, raw_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract account credentials from browser cookies/localStorage

        Args:
            raw_data: Raw cookies and localStorage from browser extension

        Returns:
            Dict with extracted account data:
                - email: User email
                - jwt_token: JWT bearer token
                - cookies: Relevant cookies
                - username: Username
                - account_id: User ID

        Example raw_data from extension:
            {
                "cookies": {"__Secure-next-auth.session-token": "...", ...},
                "bearer_token": "eyJhbGci...",  # Captured from Authorization header
            }
        """
        extracted = {}

        # Extract cookies
        cookies = raw_data.get("cookies", {})

        # Get bearer token (captured by extension from Authorization header)
        bearer_token = None

        if "bearer_token" in raw_data:
            bearer_token = raw_data["bearer_token"]
        elif "authorization" in raw_data:
            # Strip "Bearer " prefix if present
            auth = raw_data["authorization"]
            if auth.startswith("Bearer "):
                bearer_token = auth[7:]
            else:
                bearer_token = auth

        if not bearer_token:
            raise ValueError(
                "Could not extract bearer token from raw data. "
                "Make sure the browser extension captured the Authorization header."
            )

        # Store JWT token
        extracted["jwt_token"] = bearer_token

        # Extract device ID from cookies
        device_id = cookies.get("oai-device-id") or cookies.get("oai-did")
        if device_id:
            extracted["cookies"] = {"oai-device-id": device_id}

        # Extract user info from JWT using generic utility
        try:
            jwt_data = self.JWT_EXTRACTOR.extract(bearer_token)

            extracted["email"] = jwt_data.get("email")
            extracted["account_id"] = jwt_data.get("user_id")
            extracted["username"] = jwt_data.get("username")

            # Fallback: if username not in JWT, check raw_data
            if not extracted.get("username") and "username" in raw_data:
                extracted["username"] = raw_data["username"]

        except Exception as e:
            logger.warning(f"Failed to parse JWT payload: {e}")
            # JWT parsing failed, but we still have the token
            # Backend can work without email/user_id if needed

        return extracted

    async def upload_asset(
        self,
        account: ProviderAccount,
        file_path: str
    ) -> str:
        """
        Upload asset (image/video) to Sora for cross-provider operations

        Args:
            account: Sora provider account
            file_path: Local file path to upload

        Returns:
            Sora media ID (e.g., "media_01k9rhxc6he49bdm3v0bkdkkwy")

        Example:
            # Upload Pixverse video to Sora for extension
            >>> sora_media_id = await sora_provider.upload_asset(account, "/tmp/pixverse_video.mp4")
            >>> # Use in Sora generation
            >>> task = client.create(prompt="extend this", video_media_id=sora_media_id)
        """
        client = self._create_client(account)

        try:
            # Use sora-py upload method
            response = await asyncio.to_thread(
                client.api.upload_media,
                file_path=file_path
            )

            # Response format: {"id": "media_...", "type": "image/video", ...}
            media_id = response.get("id")

            if not media_id:
                raise ProviderError(f"Sora upload response missing media ID: {response}")

            logger.info(f"Uploaded asset to Sora: {media_id}")
            return media_id

        except Exception as e:
            log_provider_error(
                provider_id="sora",
                operation="upload_asset",
                stage="provider:submit",
                account_id=account.id,
                email=account.email,
                error=str(e),
                error_type=e.__class__.__name__,
                extra={"file_path": file_path},
            )
            logger.error(f"Failed to upload asset to Sora: {e}", exc_info=True)
            raise ProviderError(f"Sora upload failed: {e}")
