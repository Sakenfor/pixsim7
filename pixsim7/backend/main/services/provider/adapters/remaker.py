"""
Remaker provider adapter (web internal API)

Implements Remaker's inpainting flow using the same endpoints the website uses:
- POST /api/pai/v4/ai-inpainting/create-job
- GET  /api/pai/v4/ai-inpainting/get-job/{job_id}

Notes:
- Remaker uses a raw JWT token in the `authorization` header (no "Bearer " prefix).
- The site also sends `product-serial` and `product-code` headers; we persist those
  on ProviderAccount.provider_metadata and forward them on each request.
- Inpaint masks are PNG images where white = inpaint and black = preserve.

This is a "web internal API" provider - it replays the same requests the browser makes.
Adding similar providers requires:
1. Implementing prepare_execution_params() if multipart uploads are needed
2. Implementing extract_account_data() to parse browser-captured auth data
3. Defining get_manifest() with domains for URL detection
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional, TYPE_CHECKING
from urllib.parse import urlparse

import httpx

from pixsim_logging import get_logger
from pixsim7.backend.main.domain import OperationType, ProviderStatus, Generation
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.services.provider.base import (
    Provider,
    GenerationResult,
    ProviderStatusResult,
    AuthenticationError,
    ProviderError,
    UnsupportedOperationError,
)

if TYPE_CHECKING:
    from pixsim7.backend.main.domain.providers.schemas import ProviderManifest

logger = get_logger()


# Provider manifest - can also be accessed from manifest.py
_REMAKER_MANIFEST = None

def _get_remaker_manifest() -> "ProviderManifest":
    """Lazily load Remaker manifest to avoid circular imports."""
    global _REMAKER_MANIFEST
    if _REMAKER_MANIFEST is None:
        from pixsim7.backend.main.domain.providers.schemas import ProviderManifest, ProviderKind
        _REMAKER_MANIFEST = ProviderManifest(
            id="remaker",
            name="Remaker.ai",
            version="0.1.0",
            description="Remaker.ai inpainting provider (web internal API replay)",
            author="PixSim7",
            kind=ProviderKind.VIDEO,
            enabled=True,
            requires_credentials=True,
            domains=["remaker.ai", "api.remaker.ai"],
            credit_types=["web"],  # Remaker only has web credits
            status_mapping_notes="100000=success, 300006=processing, other=failed",
        )
    return _REMAKER_MANIFEST


class RemakerProvider(Provider):
    """
    Remaker inpaint provider.

    Currently supports IMAGE_TO_IMAGE in "inpaint" mode.
    """

    API_BASE = "https://api.remaker.ai"

    @property
    def provider_id(self) -> str:
        return "remaker"

    @property
    def supported_operations(self) -> list[OperationType]:
        return [OperationType.IMAGE_TO_IMAGE]

    # ===== PROVIDER METADATA =====

    def get_manifest(self) -> "ProviderManifest":
        """Return Remaker provider manifest with domains and credit types."""
        return _get_remaker_manifest()

    # ===== FILE PREPARATION (for multipart uploads) =====

    def requires_file_preparation(self) -> bool:
        """Remaker requires local file paths for multipart uploads."""
        return True

    async def prepare_execution_params(
        self,
        generation: Generation,
        mapped_params: Dict[str, Any],
        resolve_source_fn,
    ) -> Dict[str, Any]:
        """
        Resolve Remaker inpaint inputs to local filesystem paths.

        Remaker's create-job endpoint is multipart and requires two files:
        - original image (jpeg)
        - mask image (png)

        The mapped payload stores sources as strings (URL/path/asset ref).
        This method resolves those sources to local paths, downloading remote
        URLs to temp files when needed, and returns an execute-only params dict.
        """
        original_source = mapped_params.get("original_image_source")
        mask_source = mapped_params.get("mask_source")
        file_extension = mapped_params.get("file_extension")

        original_path, original_temps = await resolve_source_fn(
            original_source,
            generation.user_id,
            ".jpg",
        )
        mask_path, mask_temps = await resolve_source_fn(
            mask_source,
            generation.user_id,
            ".png",
        )

        temps = [*original_temps, *mask_temps]

        resolved: Dict[str, Any] = dict(mapped_params)
        resolved["original_image_path"] = original_path
        resolved["mask_path"] = mask_path
        resolved["_temp_paths"] = temps

        if file_extension and isinstance(file_extension, str) and not file_extension.startswith("."):
            resolved["file_extension"] = f".{file_extension}"

        return resolved

    # ===== PARAMETER MAPPING =====

    def map_parameters(self, operation_type: OperationType, params: Dict[str, Any]) -> Dict[str, Any]:
        if operation_type not in self.supported_operations:
            raise UnsupportedOperationError(self.provider_id, operation_type.value)

        prompt = params.get("prompt")
        if not prompt or not str(prompt).strip():
            raise ProviderError("Remaker requires a non-empty prompt")

        image_urls = params.get("image_urls") or []
        if isinstance(image_urls, str):
            image_urls = [image_urls]
        if not image_urls and isinstance(params.get("composition_assets"), list):
            derived_urls: list[str] = []

            def _asset_ref(value: Any) -> Optional[str]:
                if value is None:
                    return None
                if hasattr(value, "id"):
                    return f"asset:{value.id}"
                if isinstance(value, dict) and value.get("type") == "asset":
                    return f"asset:{value.get('id')}"
                if isinstance(value, int):
                    return f"asset:{value}"
                if isinstance(value, str):
                    return value
                return None

            for item in params["composition_assets"]:
                if hasattr(item, "model_dump"):
                    item = item.model_dump()
                if isinstance(item, dict):
                    ref_value = item.get("asset") or item.get("asset_id") or item.get("assetId") or item.get("url")
                    ref = _asset_ref(ref_value)
                    if ref:
                        derived_urls.append(ref)
                else:
                    ref = _asset_ref(item)
                    if ref:
                        derived_urls.append(ref)

            image_urls = derived_urls
        if not isinstance(image_urls, list) or not image_urls:
            raise ProviderError("Remaker requires 'image_urls' with at least one entry")

        # Extra fields for inpaint. We keep these provider-specific to avoid changing
        # core OperationType semantics.
        mask_source = params.get("mask_url") or params.get("mask_source") or params.get("mask")
        if not mask_source:
            raise ProviderError("Remaker inpaint requires 'mask_url' (PNG mask)")

        file_extension = params.get("file_extension")
        if file_extension and isinstance(file_extension, str) and not file_extension.startswith("."):
            file_extension = f".{file_extension}"

        return {
            "prompt": prompt,
            "original_image_source": image_urls[0],
            "mask_source": mask_source,
            "file_extension": file_extension,
        }

    def _headers_for_account(self, account: ProviderAccount) -> Dict[str, str]:
        token = account.jwt_token
        if not token:
            raise AuthenticationError(self.provider_id, "Missing account jwt_token")

        meta = account.provider_metadata or {}
        headers: Dict[str, str] = {
            "authorization": token,
            "origin": "https://remaker.ai",
            "referer": "https://remaker.ai/",
            "accept": "application/json, text/plain, */*",
        }

        product_serial = meta.get("product_serial") or meta.get("product-serial")
        if product_serial:
            headers["product-serial"] = str(product_serial)
        product_code = meta.get("product_code") or meta.get("product-code")
        if product_code:
            headers["product-code"] = str(product_code)

        return headers

    async def execute(
        self,
        operation_type: OperationType,
        account: ProviderAccount,
        params: Dict[str, Any],
    ) -> GenerationResult:
        if operation_type not in self.supported_operations:
            raise UnsupportedOperationError(self.provider_id, operation_type.value)

        headers = self._headers_for_account(account)

        prompt = params.get("prompt")
        original_path = params.get("original_image_path")
        mask_path = params.get("mask_path")
        file_extension = params.get("file_extension")
        temp_paths = list(params.get("_temp_paths") or [])

        if not original_path or not mask_path:
            raise ProviderError(
                "Remaker execute requires resolved file paths: 'original_image_path' and 'mask_path'"
            )

        # Determine file_extension if caller didn't provide it.
        if not file_extension:
            _, ext = os.path.splitext(str(original_path))
            file_extension = ext or ".jpg"

        create_url = f"{self.API_BASE}/api/pai/v4/ai-inpainting/create-job"

        try:
            with open(mask_path, "rb") as mask_f, open(original_path, "rb") as img_f:
                files = {
                    "mask_file": ("blob", mask_f, "image/png"),
                    "original_image_file": (
                        os.path.basename(str(original_path)) or f"input{file_extension}",
                        img_f,
                        "image/jpeg" if file_extension.lower() in {".jpg", ".jpeg"} else "application/octet-stream",
                    ),
                }
                data = {
                    "prompt": prompt,
                    "file_extension": file_extension,
                }

                async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
                    resp = await client.post(create_url, headers=headers, data=data, files=files)
                    resp.raise_for_status()
                    payload = resp.json()

            code = payload.get("code")
            if code != 100000:
                msg = (payload.get("message") or {}).get("en") or str(payload.get("message") or payload)
                raise ProviderError(f"Remaker create-job failed (code={code}): {msg}")

            job_id = ((payload.get("result") or {}) or {}).get("job_id")
            if not job_id:
                raise ProviderError(f"Remaker create-job missing job_id: {payload}")

            return GenerationResult(
                provider_job_id=str(job_id),
                status=ProviderStatus.PENDING,
                metadata={"provider_status": code},
            )
        except httpx.HTTPStatusError as e:
            raise ProviderError(f"Remaker create-job HTTP error: {e.response.status_code}") from e
        except httpx.HTTPError as e:
            raise ProviderError(f"Remaker create-job network error: {e}") from e
        finally:
            # Clean up any temp downloads created by the orchestrator.
            for path in temp_paths:
                try:
                    if path and os.path.exists(path):
                        os.remove(path)
                except Exception:
                    pass

    async def check_status(
        self,
        account: ProviderAccount,
        provider_job_id: str,
        operation_type: Optional[OperationType] = None,
    ) -> ProviderStatusResult:
        headers = self._headers_for_account(account)
        url = f"{self.API_BASE}/api/pai/v4/ai-inpainting/get-job/{provider_job_id}"

        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                payload = resp.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403):
                raise AuthenticationError(self.provider_id, f"HTTP {e.response.status_code}") from e
            raise ProviderError(f"Remaker get-job HTTP error: {e.response.status_code}") from e
        except httpx.HTTPError as e:
            raise ProviderError(f"Remaker get-job network error: {e}") from e

        code = payload.get("code")
        if code == 300006:
            return ProviderStatusResult(
                status=ProviderStatus.PROCESSING,
                metadata={"provider_status": code},
                provider_video_id=provider_job_id,
            )

        if code == 100000:
            result = payload.get("result") or {}
            outputs = result.get("output") or []
            out_url = outputs[0] if isinstance(outputs, list) and outputs else None
            if not out_url:
                return ProviderStatusResult(
                    status=ProviderStatus.PROCESSING,
                    metadata={"provider_status": code},
                    provider_video_id=provider_job_id,
                )

            # Remaker returns a direct CDN URL to a PNG image.
            return ProviderStatusResult(
                status=ProviderStatus.COMPLETED,
                video_url=str(out_url),
                provider_video_id=provider_job_id,
                metadata={
                    "provider_status": code,
                    "output_url": str(out_url),
                    "output_host": urlparse(str(out_url)).netloc,
                },
            )

        msg = (payload.get("message") or {}).get("en") or str(payload.get("message") or payload)
        logger.warning(
            "remaker_status_unexpected",
            provider_job_id=provider_job_id,
            code=code,
            message=msg,
        )
        return ProviderStatusResult(
            status=ProviderStatus.FAILED,
            error_message=f"Remaker unexpected status (code={code}): {msg}",
            metadata={"provider_status": code},
            provider_video_id=provider_job_id,
        )

    def compute_actual_credits(self, generation, actual_duration: Optional[float] = None) -> Optional[int]:
        # Remaker credits are provider-specific and currently not modeled in PixSim7.
        # Returning 0 causes billing to be skipped.
        return 0

    async def extract_account_data(self, raw_data: dict, *, fallback_email: str = None) -> dict:
        """
        Extract Remaker account details from extension-captured data.

        Expected raw_data fields (best effort, not strict):
          - token / jwt_token / authorization: auth token (raw JWT)
          - product_serial / product_code: required headers used by the site
          - email (optional; also available in JWT payload as 'gmail' in observed responses)
          - credits (optional)
          - cookies (optional)
        """
        import base64
        import json

        cookies = raw_data.get("cookies") or {}
        token = (
            raw_data.get("token")
            or raw_data.get("jwt_token")
            or raw_data.get("authorization")
            or cookies.get("token")
        )
        if not token:
            raise ValueError("Remaker: token not found in raw_data")

        email = raw_data.get("email") or raw_data.get("gmail") or None
        provider_user_id = raw_data.get("userId") or raw_data.get("user_id") or None
        product_serial = raw_data.get("product_serial") or raw_data.get("product-serial") or None
        product_code = raw_data.get("product_code") or raw_data.get("product-code") or None

        # Best-effort: parse JWT payload for email/product_code.
        try:
            parts = str(token).split(".")
            if len(parts) == 3:
                payload_b64 = parts[1]
                payload_b64 += "=" * (-len(payload_b64) % 4)
                decoded = base64.urlsafe_b64decode(payload_b64.encode("utf-8"))
                jwt_payload = json.loads(decoded.decode("utf-8"))
                email = email or jwt_payload.get("gmail") or jwt_payload.get("email")
                product_code = product_code or jwt_payload.get("product_code")
                provider_user_id = provider_user_id or jwt_payload.get("id")
        except Exception:
            jwt_payload = None

        if not email and fallback_email:
            email = fallback_email
        if not email:
            raise ValueError("Remaker: email not found (provide email or fallback_email)")

        provider_metadata: Dict[str, Any] = {}
        if product_serial:
            provider_metadata["product_serial"] = product_serial
        if product_code:
            provider_metadata["product_code"] = product_code
        if jwt_payload:
            # Store a minimal subset only (avoid storing the whole JWT payload).
            for key in ("login_method", "register_type"):
                if key in jwt_payload:
                    provider_metadata[key] = jwt_payload.get(key)

        extracted: Dict[str, Any] = {
            "email": email,
            "jwt_token": token,
            "cookies": cookies if isinstance(cookies, dict) else {},
            "account_id": str(provider_user_id) if provider_user_id is not None else None,
            "provider_metadata": provider_metadata or None,
        }

        credits = raw_data.get("credits")
        if isinstance(credits, dict):
            extracted["credits"] = credits
        elif isinstance(credits, (int, float, str)) and str(credits).isdigit():
            extracted["credits"] = {"web": int(credits)}

        return extracted
