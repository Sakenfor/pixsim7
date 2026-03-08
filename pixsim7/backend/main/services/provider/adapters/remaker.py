"""
Remaker provider adapter (web internal API)

Supports two modes, both under IMAGE_TO_IMAGE:

1. **Photo-editor** (mask present):
   - POST /api/pai/v4/ai-photo-editor/create-job
   - GET  /api/pai/v4/ai-photo-editor/get-job/{job_id}
   - Processing status code: 300006
   - Fields: image, mask, prompt, task_type (sd/flux), turnstile_token

2. **Prompt-editor** (no mask):
   - POST /api/pai/v4/prompt-editor/create-job
   - GET  /api/pai/v4/prompt-editor/get-job/{job_id}
   - Processing status code: 300013
   - Fields: image_files, prompt, task_type, aspect_ratio, image_resolution

Notes:
- Remaker uses a raw JWT token in the `authorization` header (no "Bearer " prefix).
- The site also sends `product-serial` and `product-code` headers; we persist those
  on ProviderAccount.provider_metadata and forward them on each request.
- Inpaint masks are PNG images where white = inpaint and black = preserve.
- Mode is auto-detected by mask presence in parameters.

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

from pixsim_logging import get_logger
from pixsim7.backend.main.domain import OperationType, ProviderStatus, Generation
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.shared.composition_assets import coerce_composition_assets
from pixsim7.backend.main.shared.asset_refs import extract_asset_id
from pixsim7.backend.main.services.provider.base import (
    GenerationResult,
    ProviderStatusResult,
    AuthenticationError,
    ProviderError,
    UnsupportedOperationError,
)
from pixsim7.backend.main.services.provider.adapters.web_api_base import WebApiProvider

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
            description="Remaker.ai photo-editor & prompt-editor provider (web internal API replay)",
            author="PixSim7",
            kind=ProviderKind.VIDEO,
            enabled=True,
            requires_credentials=True,
            domains=["remaker.ai", "api.remaker.ai"],
            credit_types=["web"],  # Remaker only has web credits
            status_mapping_notes="100000=success, 300006=photo-editor processing, 300013=prompt-editor processing, other=failed",
        )
    return _REMAKER_MANIFEST


class RemakerProvider(WebApiProvider):
    """
    Remaker provider supporting photo-editor and prompt-editor modes.

    Both modes operate under IMAGE_TO_IMAGE. Mode is auto-detected:
    - Mask present → photo-editor (image + mask + prompt + model choice)
    - No mask → prompt-editor (image + prompt + model + aspect ratio + resolution)
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
        account: Optional[ProviderAccount] = None,
    ) -> Dict[str, Any]:
        """
        Resolve Remaker inputs to local filesystem paths.

        Both modes need the original image resolved. Photo-editor mode
        additionally resolves the mask image.
        """
        original_source = mapped_params.get("original_image_source")
        file_extension = mapped_params.get("file_extension")
        mode = mapped_params.get("mode", "photo-editor")

        original_path, original_temps = await resolve_source_fn(
            original_source,
            generation.user_id,
            ".jpg",
        )

        temps = list(original_temps)

        resolved: Dict[str, Any] = dict(mapped_params)
        resolved["original_image_path"] = original_path

        if mode == "photo-editor":
            mask_source = mapped_params.get("mask_source")
            if mask_source:
                mask_path, mask_temps = await resolve_source_fn(
                    mask_source,
                    generation.user_id,
                    ".png",
                )
                temps.extend(mask_temps)
                resolved["mask_path"] = mask_path

        resolved["_temp_paths"] = temps

        if file_extension and isinstance(file_extension, str) and not file_extension.startswith("."):
            resolved["file_extension"] = f".{file_extension}"

        return resolved

    # ===== PARAMETER MAPPING =====

    @staticmethod
    def _extract_image_source(params: Dict[str, Any]) -> Optional[str]:
        """Extract the first image source from composition_assets."""
        composition_assets = params.get("composition_assets")
        if not isinstance(composition_assets, list):
            return None
        assets = coerce_composition_assets(composition_assets)
        for item in assets:
            item_media_type = item.get("media_type")
            if item_media_type and item_media_type != "image":
                continue
            asset_value = item.get("asset")
            url_value = item.get("url")
            if asset_value:
                return asset_value
            elif url_value and isinstance(url_value, str):
                return url_value
        return None

    @staticmethod
    def _normalize_task_type(params: Dict[str, Any]) -> str:
        """Resolve Remaker model selector to sd|flux."""
        raw_task = params.get("task_type")
        if isinstance(raw_task, str) and raw_task.strip().lower() in {"sd", "flux"}:
            return raw_task.strip().lower()

        model = str(params.get("model") or "").strip().lower()
        if "flux" in model:
            return "flux"
        return "sd"

    @staticmethod
    def _normalize_image_resolution(task_type: str, params: Dict[str, Any]) -> str:
        """
        Resolve Remaker image_resolution.

        Remaker prompt-editor accepts 1K/2K/4K in observed traffic. Flux jobs are
        constrained to 1K, so we clamp to 1K for task_type=flux.
        """
        if task_type == "flux":
            return "1K"

        raw = params.get("image_resolution")
        if raw is None:
            raw = params.get("quality")

        normalized = str(raw or "").strip().upper().replace(" ", "")
        aliases = {
            "1024": "1K",
            "1K": "1K",
            "720P": "1K",
            "1080P": "1K",
            "2K": "2K",
            "1440P": "2K",
            "4K": "4K",
            "2160P": "4K",
        }
        return aliases.get(normalized, "2K")

    def map_parameters(self, operation_type: OperationType, params: Dict[str, Any]) -> Dict[str, Any]:
        if operation_type not in self.supported_operations:
            raise UnsupportedOperationError(self.provider_id, operation_type.value)

        prompt = params.get("prompt")
        if not prompt or not str(prompt).strip():
            raise ProviderError("Remaker requires a non-empty prompt")

        original_image_source = self._extract_image_source(params)
        if not original_image_source:
            raise ProviderError("Remaker requires 'composition_assets' with at least one image entry")

        file_extension = params.get("file_extension")
        if file_extension and isinstance(file_extension, str) and not file_extension.startswith("."):
            file_extension = f".{file_extension}"

        # Auto-detect mode by mask presence
        mask_source = params.get("mask_url") or params.get("mask_source") or params.get("mask")
        task_type = self._normalize_task_type(params)
        image_resolution = self._normalize_image_resolution(task_type, params)

        if mask_source:
            # Photo-editor mode: image + mask + prompt + model choice
            return {
                "mode": "photo-editor",
                "prompt": prompt,
                "original_image_source": original_image_source,
                "mask_source": mask_source,
                "task_type": task_type,
                "file_extension": file_extension,
            }
        else:
            # Prompt-editor mode: image + prompt (no mask)
            return {
                "mode": "prompt-editor",
                "prompt": prompt,
                "original_image_source": original_image_source,
                "task_type": task_type,
                "aspect_ratio": params.get("aspect_ratio", "match_input_image"),
                "image_resolution": image_resolution,
                "file_extension": file_extension,
            }

    def _build_headers(self, account: ProviderAccount) -> Dict[str, str]:
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

        mode = params.get("mode", "photo-editor")
        temp_paths = list(params.get("_temp_paths") or [])

        try:
            if mode == "prompt-editor":
                return await self._execute_prompt_editor(account, params)
            else:
                return await self._execute_photo_editor(account, params)
        finally:
            self._cleanup_temps(temp_paths)

    async def _execute_photo_editor(
        self, account: ProviderAccount, params: Dict[str, Any]
    ) -> GenerationResult:
        """Submit a photo-editor job (image + optional mask + prompt + model)."""
        prompt = params.get("prompt")
        original_path = params.get("original_image_path")
        mask_path = params.get("mask_path")
        task_type = params.get("task_type", "sd")
        file_extension = params.get("file_extension")

        if not original_path:
            raise ProviderError(
                "Remaker photo-editor requires resolved file path: 'original_image_path'"
            )

        if not file_extension:
            _, ext = os.path.splitext(str(original_path))
            file_extension = ext or ".jpg"

        create_url = f"{self.API_BASE}/api/pai/v4/ai-photo-editor/create-job"
        img_content_type = "image/jpeg" if file_extension.lower() in {".jpg", ".jpeg"} else "application/octet-stream"

        file_fields = {
            "image": (
                os.path.basename(str(original_path)) or f"input{file_extension}",
                original_path,
                img_content_type,
            ),
            "mask": ("mask.png", mask_path, "image/png") if mask_path else None,
        }
        data = {
            "prompt": prompt,
            "task_type": task_type,
            "turnstile_token": "",
        }

        payload = await self._submit_multipart(account, create_url, data, file_fields)
        return self._parse_create_response(payload)

    async def _execute_prompt_editor(
        self, account: ProviderAccount, params: Dict[str, Any]
    ) -> GenerationResult:
        """Submit a prompt-editor job (image + prompt, no mask)."""
        prompt = params.get("prompt")
        original_path = params.get("original_image_path")
        task_type = params.get("task_type", "sd")
        aspect_ratio = params.get("aspect_ratio", "match_input_image")
        image_resolution = params.get("image_resolution")
        if not image_resolution:
            image_resolution = "1K" if str(task_type).lower() == "flux" else "2K"
        elif str(task_type).lower() == "flux":
            image_resolution = "1K"
        file_extension = params.get("file_extension")

        if not original_path:
            raise ProviderError(
                "Remaker prompt-editor requires resolved file path: 'original_image_path'"
            )

        if not file_extension:
            _, ext = os.path.splitext(str(original_path))
            file_extension = ext or ".jpg"

        create_url = f"{self.API_BASE}/api/pai/v4/prompt-editor/create-job"
        img_content_type = "image/jpeg" if file_extension.lower() in {".jpg", ".jpeg"} else "application/octet-stream"

        file_fields = {
            "image_files": (
                os.path.basename(str(original_path)) or f"input{file_extension}",
                original_path,
                img_content_type,
            ),
        }
        data = {
            "prompt": prompt,
            "task_type": task_type,
            "aspect_ratio": aspect_ratio,
            "image_resolution": image_resolution,
        }

        payload = await self._submit_multipart(account, create_url, data, file_fields)
        result = self._parse_create_response(payload)
        # Prefix job_id so check_status routes to the correct poll endpoint
        result.provider_job_id = f"pe:{result.provider_job_id}"
        return result

    @staticmethod
    def _parse_create_response(payload: Dict[str, Any]) -> GenerationResult:
        """Parse Remaker create-job response (shared between modes)."""
        code = payload.get("code")
        if code != 100000:
            msg = (payload.get("message") or {}).get("en") or str(payload.get("message") or payload)
            raise ProviderError(f"Remaker create-job failed (code={code}): {msg}")

        job_id = (payload.get("result") or {}).get("job_id")
        if not job_id:
            raise ProviderError(f"Remaker create-job missing job_id: {payload}")

        return GenerationResult(
            provider_job_id=str(job_id),
            status=ProviderStatus.PENDING,
            metadata={"provider_status": code},
        )

    async def check_status(
        self,
        account: ProviderAccount,
        provider_job_id: str,
        operation_type: Optional[OperationType] = None,
    ) -> ProviderStatusResult:
        # Route to correct poll endpoint based on job_id prefix
        if provider_job_id.startswith("pe:"):
            real_job_id = provider_job_id[3:]
            url = f"{self.API_BASE}/api/pai/v4/prompt-editor/get-job/{real_job_id}"
        else:
            real_job_id = provider_job_id
            url = f"{self.API_BASE}/api/pai/v4/ai-photo-editor/get-job/{real_job_id}"

        payload = await self._fetch_json(account, url)

        code = payload.get("code")
        # Both 300006 (photo-editor) and 300013 (prompt-editor) indicate processing
        if code in (300006, 300013):
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

        raw_message = payload.get("message")
        msg = (raw_message or {}).get("en") if isinstance(raw_message, dict) else None
        if not msg:
            msg = str(raw_message or payload)
        logger.warning(
            "remaker_status_unexpected",
            provider_job_id=provider_job_id,
            code=code,
            message=msg,
        )
        metadata = {"provider_status": code, "provider_message": msg}
        if isinstance(raw_message, dict):
            zh_message = raw_message.get("zh")
            if zh_message:
                metadata["provider_message_zh"] = zh_message
        return ProviderStatusResult(
            status=ProviderStatus.FAILED,
            error_message=f"Remaker unexpected status (code={code}): {msg}",
            metadata=metadata,
            provider_video_id=provider_job_id,
        )

    def get_operation_parameter_spec(self) -> dict:
        # -- Per-model option maps (Pixverse pattern) --
        all_ratios = ["match_input_image", "1:1", "2:3", "3:4", "9:16", "3:2", "4:3", "16:9", "21:9"]
        flux_ratios = list(all_ratios)
        aspect_per_model = {
            "sd": all_ratios,
            "flux": flux_ratios,
        }
        resolution_per_model = {
            "sd": ["1K", "2K", "4K"],
            "flux": ["1K"],
        }
        credits_per_model = {
            "sd": 6,
            "flux": 2,
        }

        return {
            OperationType.IMAGE_TO_IMAGE.value: {
                "parameters": [
                    {
                        "name": "prompt",
                        "type": "string",
                        "required": True,
                        "default": None,
                        "enum": None,
                        "max": 5000,
                        "description": "Edit instruction or inpainting prompt",
                        "group": "core",
                    },
                    {
                        "name": "composition_assets",
                        "type": "composition_assets",
                        "required": True,
                        "default": None,
                        "enum": None,
                        "description": "Source image",
                        "group": "core",
                    },
                    {
                        "name": "mask_url",
                        "type": "string",
                        "required": False,
                        "default": None,
                        "enum": None,
                        "description": "Inpaint mask (PNG). With mask → photo-editor, without → prompt-editor.",
                        "group": "core",
                    },
                    {
                        "name": "task_type",
                        "type": "enum",
                        "required": False,
                        "default": "sd",
                        "enum": ["sd", "flux"],
                        "description": "Model: Seedream 4 (sd) or Flux",
                        "group": "core",
                        "metadata": {
                            "credits_per_option": credits_per_model,
                        },
                    },
                    {
                        "name": "aspect_ratio",
                        "type": "enum",
                        "required": False,
                        "default": "match_input_image",
                        "enum": all_ratios,
                        "description": "Aspect ratio (prompt-editor mode only)",
                        "group": "prompt-editor",
                        "metadata": {
                            "per_model_options": aspect_per_model,
                        },
                    },
                    {
                        "name": "image_resolution",
                        "type": "enum",
                        "required": False,
                        "default": "2K",
                        "enum": ["1K", "2K", "4K"],
                        "description": "Output resolution (prompt-editor mode only)",
                        "group": "prompt-editor",
                        "metadata": {
                            "per_model_options": resolution_per_model,
                        },
                    },
                ]
            }
        }

    def compute_actual_credits(self, generation, actual_duration: Optional[float] = None) -> Optional[int]:
        # Remaker credits are provider-specific and currently not modeled in PixSim7.
        # Returning 0 causes billing to be skipped.
        return 0

    async def get_credits(
        self,
        account: "ProviderAccount",
        *,
        retry_on_session_error: bool = False,
        force_refresh: bool = False,
    ) -> Dict[str, Any]:
        """Fetch current credits from Remaker's userinfo endpoint."""
        url = f"{self.API_BASE}/api/pai-login/v1/user/get-userinfo"
        try:
            import httpx

            headers = self._build_headers(account)
            # Remaker expects multipart/form-data with product_code +
            # turnstile_token fields.
            meta = account.provider_metadata or {}
            product_code = meta.get("product_code") or meta.get("product-code") or ""
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.post(
                    url,
                    headers=headers,
                    files={
                        "product_code": (None, str(product_code)),
                        "turnstile_token": (None, ""),
                    },
                )
                if resp.status_code != 200:
                    logger.warning(
                        "remaker_get_credits_http_error",
                        status=resp.status_code,
                        body=resp.text[:500],
                    )
                resp.raise_for_status()
                payload = resp.json()
        except AuthenticationError:
            raise
        except Exception as e:
            logger.warning("remaker_get_credits_failed", error=str(e))
            return {}

        code = payload.get("code")
        if code != 100000:
            logger.warning("remaker_get_credits_unexpected", code=code, payload=payload)
            return {}

        result = payload.get("result") or {}
        credits = result.get("credits")
        if credits is not None:
            return {"web": int(credits)}
        return {}

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
