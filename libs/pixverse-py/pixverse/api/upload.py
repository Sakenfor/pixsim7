"""
Media upload operations for Pixverse API (async)
Handles image and video file uploads
"""

import uuid
from typing import Dict
from ..models import Account
from ..exceptions import APIError


class UploadOperations:
    """Media upload-related API operations (async)"""

    def __init__(self, client):
        """
        Initialize upload operations

        Args:
            client: Reference to the main PixverseAPI client
        """
        self.client = client

    async def upload_media(
        self,
        file_path: str,
        account: Account
    ) -> Dict[str, str]:
        """
        Upload image or video file to Pixverse using OpenAPI

        This method uploads media files that can be used as inputs for
        image-to-video generation or other operations.

        NOTE: Any account can have an OpenAPI key (not just paid tier).
        Get your API key from Pixverse dashboard.

        Args:
            file_path: Path to image or video file to upload
            account: Account with OpenAPI key (any tier, get from dashboard)

        Returns:
            Dictionary with:
            - id: Media ID (img_id) that can be used in generation requests
            - url: Direct URL to the uploaded media (optional)

        Raises:
            APIError: If upload fails or account doesn't have OpenAPI key

        Example:
            >>> result = await api.upload_media("/path/to/image.jpg", account)
            >>> img_id = result["id"]  # "12345678"
            >>> # Use in generation:
            >>> video = await client.create(
            ...     prompt="animate this image",
            ...     image_url=f"img_id:{img_id}"
            ... )
        """
        # Check for OpenAPI key
        openapi_key = None
        if account.session:
            openapi_key = account.session.get("openapi_key") or account.session.get("api_key_paid")

        if not openapi_key:
            raise APIError("upload_media() requires OpenAPI key (get from Pixverse dashboard)")

        # Prepare upload endpoint
        upload_url = f"{self.client.base_url}/openapi/v2/image/upload"

        # Headers for OpenAPI
        headers = {
            "API-KEY": openapi_key,
            "Ai-trace-id": str(uuid.uuid4()),
        }

        try:
            # Get the async client
            client = await self.client._get_client()

            # Open and upload file
            with open(file_path, "rb") as file_obj:
                files = {"image": file_obj}
                response = await client.post(
                    upload_url,
                    headers=headers,
                    files=files,
                    timeout=60.0
                )
        except FileNotFoundError:
            raise APIError(f"File not found: {file_path}")
        except Exception as e:
            raise APIError(f"Upload request failed: {e}")

        # Parse response
        try:
            payload = response.json()
        except ValueError as e:
            raise APIError(f"Invalid JSON response: {e}")

        # Check for errors
        if response.status_code != 200:
            err_msg = payload.get("ErrMsg") or response.text
            raise APIError(f"Upload failed (HTTP {response.status_code}): {err_msg}")

        if payload.get("ErrCode", 0) != 0:
            err_msg = payload.get("ErrMsg", "Unknown error")
            raise APIError(f"Upload failed: {err_msg}")

        # Extract media ID and URL from response
        resp_data = payload.get("Resp", {})
        media_id = resp_data.get("img_id") or resp_data.get("id")

        if not media_id:
            raise APIError(f"Upload response missing media ID: {payload}")

        result = {"id": str(media_id)}

        # Add URL if present
        url = (
            resp_data.get("img_url")
            or resp_data.get("url")
            or resp_data.get("media_url")
            or resp_data.get("download_url")
        )
        if url:
            result["url"] = url

        return result
