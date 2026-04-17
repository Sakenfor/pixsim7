"""
Fusion video operations for Pixverse API
Handles fusion video creation combining subjects and backgrounds
"""

import json
import logging
import random
from typing import List, Dict, Any
from ..models import Video, GenerationOptions, Account, filter_options_for_model

# Initialize module-level logger
logger = logging.getLogger(__name__)


class FusionOperations:
    """Fusion video-related API operations"""

    def __init__(self, client):
        """
        Initialize fusion operations

        Args:
            client: Reference to the main PixverseAPI client
        """
        self.client = client

    async def create_fusion(
        self,
        prompt: str,
        image_references: List[Dict[str, Any]],
        options: GenerationOptions,
        account: Account
    ) -> Video:
        """
        Create fusion video combining subjects and backgrounds (WebAPI or OpenAPI)

        Args:
            prompt: Prompt with @references (e.g., "@dog plays at @room")
            image_references: List of image references with structure:
                [
                    {"type": "subject", "img_id": 123, "ref_name": "dog"},
                    {"type": "background", "img_id": 456, "ref_name": "room"}
                ]
            options: Generation options
            account: Account to use

        Returns:
            Fusion video object

        Raises:
            ValueError: If no valid credentials or invalid references
        """
        # Validate image references
        if not image_references or len(image_references) < 1:
            raise ValueError("At least 1 image reference required for fusion")

        if len(image_references) > 3:
            raise ValueError("Maximum 3 image references allowed for fusion")

        # Check for method preference
        use_method = account.session.get("use_method", "auto") if account.session else "auto"

        # Determine which API to use
        has_jwt = bool(account.session and account.session.get("jwt_token"))
        has_openapi = bool(account.session and account.session.get("openapi_key"))

        if use_method == "open-api":
            if not has_openapi:
                raise ValueError("OpenAPI method requested but no openapi_key available")
            return await self._create_fusion_openapi(prompt, image_references, options, account)
        elif use_method == "web-api":
            if not has_jwt:
                raise ValueError("Web API method requested but no jwt_token available")
            return await self._create_fusion_web(prompt, image_references, options, account)
        else:
            # Auto mode: prefer web-api (JWT) if available, fallback to openapi
            if has_jwt:
                return await self._create_fusion_web(prompt, image_references, options, account)
            elif has_openapi:
                return await self._create_fusion_openapi(prompt, image_references, options, account)
            else:
                raise ValueError("No valid credentials available (need jwt_token or openapi_key)")

    async def _create_fusion_web(
        self,
        prompt: str,
        image_references: List[Dict[str, Any]],
        options: GenerationOptions,
        account: Account
    ) -> Video:
        """
        Create fusion video using WebAPI (JWT token)

        This method combines multiple images (subjects and backgrounds) into
        a single video using the Pixverse Web API.

        Supports two modes based on image_references structure:
        - **Role-based** (legacy): references have ``type`` field (subject/background).
          Sends ``fusion_id_list``, ``fusion_name_list``, ``fusion_type_list``.
        - **Simple**: references have no ``type`` field.
          Sends only ``customer_img_paths`` and ``customer_img_urls`` as flat arrays.

        Args:
            prompt: Prompt with @references (e.g., "@1 plays at @2")
            image_references: List of image references
            options: Generation options (model, quality, duration, etc.)
            account: Account with valid JWT token

        Returns:
            Video object with initial status (usually 'processing')

        Raises:
            APIError: If API request fails
            ValueError: If image_references is invalid
        """
        customer_img_paths = [ref.get("customer_img_path", "") for ref in image_references]
        customer_img_urls = [ref.get("customer_img_url", "") for ref in image_references]

        # Detect simple mode: no "type" field on any reference
        simple_mode = not any(ref.get("type") for ref in image_references)

        # Build payload from options (exclude None values)
        payload = options.model_dump(exclude_none=True)

        # Filter out unsupported params for the model (e.g., audio on non-v5.5+ models)
        model = payload.get("model", "v5")
        payload = filter_options_for_model(model, payload)

        # Add common fields
        payload.update({
            "create_count": 1,
            "original_prompt": prompt,
            "prompt": prompt,
            "customer_img_paths": customer_img_paths,
            "customer_img_urls": customer_img_urls,
        })

        if not simple_mode:
            # Role-based mode: include fusion identity/type lists
            fusion_names = [ref["ref_name"] for ref in image_references]
            fusion_types = [ref["type"] for ref in image_references]
            fusion_id_list = [random.randint(100000000000000, 999999999999999) for _ in image_references]
            payload.update({
                "fusion_id_list": fusion_id_list,
                "fusion_name_list": fusion_names,
                "fusion_type_list": fusion_types,
            })

        # Debug logging
        logger.debug(
            "Pixverse WebAPI - Type: Fusion%s, Endpoint: /creative_platform/video/fusion, Payload:\n%s",
            " (simple)" if simple_mode else "",
            json.dumps(payload, indent=2)
        )

        response = await self.client._request(
            "POST",
            "/creative_platform/video/fusion",
            json=payload,
            account=account
        )

        return self.client._parse_video_response(response)

    async def _create_fusion_openapi(
        self,
        prompt: str,
        image_references: List[Dict[str, Any]],
        options: GenerationOptions,
        account: Account
    ) -> Video:
        """
        Create fusion video using OpenAPI (API key)

        This method combines multiple images (subjects and backgrounds) into
        a single video using the Pixverse OpenAPI.

        Supports two modes:
        - **Role-based** (legacy): references include ``type`` field.
        - **Simple**: references have no ``type`` field — sends simplified
          ``image_references`` without ``type``.

        Args:
            prompt: Prompt with @references (e.g., "@1 plays at @2")
            image_references: List of image references (OpenAPI format)
            options: Generation options (model, quality, duration, etc.)
            account: Account with valid OpenAPI key

        Returns:
            Video object with initial status (usually 'processing')

        Raises:
            APIError: If API request fails
            ValueError: If image_references is invalid
        """
        # Build payload from options (exclude None values)
        payload = options.model_dump(exclude_none=True)

        # Filter out unsupported params for the model (e.g., audio on non-v5.5+ models)
        model = payload.get("model", "v5")
        payload = filter_options_for_model(model, payload)

        payload["prompt"] = prompt

        # Detect simple mode: no "type" field on any reference
        simple_mode = not any(ref.get("type") for ref in image_references)
        if simple_mode:
            # Send references without type field
            payload["image_references"] = [
                {k: v for k, v in ref.items() if k != "type"}
                for ref in image_references
            ]
        else:
            payload["image_references"] = image_references

        # Debug logging
        logger.debug(
            "Pixverse OpenAPI - Type: Fusion%s, Endpoint: /openapi/v2/video/fusion/generate, Payload:\n%s",
            " (simple)" if simple_mode else "",
            json.dumps(payload, indent=2)
        )

        response = await self.client._request(
            "POST",
            "/openapi/v2/video/fusion/generate",
            json=payload,
            account=account
        )

        return self.client._parse_video_response(response)
