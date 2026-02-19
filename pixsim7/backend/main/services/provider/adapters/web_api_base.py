"""
Base class for web-API-replay providers.

Web-API-replay providers replicate the HTTP requests that a browser makes to a
provider's internal/undocumented API.  They share common patterns:

  1. Multipart POST to submit a job (with files + form data)
  2. GET to poll job status (JSON response)
  3. Auth via raw JWT / custom headers extracted from the browser session

This base class factors out the HTTP plumbing so that concrete providers
(e.g. Remaker) only define parameter mapping, endpoint URLs, and response
parsing.

NOT intended for SDK-driven providers (Pixverse, Sora) which use official
Python packages and have fundamentally different calling conventions.
"""

from __future__ import annotations

import os
from abc import abstractmethod
from typing import Any, Dict, Optional

import httpx

from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.services.provider.base import (
    Provider,
    AuthenticationError,
    ProviderError,
)


class WebApiProvider(Provider):
    """Base for providers that replay browser web-API requests via httpx."""

    API_BASE: str  # Subclass must set, e.g. "https://api.remaker.ai"

    @abstractmethod
    def _build_headers(self, account: ProviderAccount) -> Dict[str, str]:
        """Build request headers from account credentials."""
        ...

    async def _submit_multipart(
        self,
        account: ProviderAccount,
        url: str,
        data: Dict[str, str],
        file_fields: Dict[str, tuple[str, str, str] | None],
        timeout: float = 120.0,
    ) -> Dict[str, Any]:
        """
        POST multipart form data with files, return parsed JSON.

        Args:
            account: Provider account (used for headers).
            url: Full endpoint URL.
            data: Non-file form fields.
            file_fields: Mapping of field name to (filename, local_path, content_type).
                         ``None`` values are silently skipped.
            timeout: Request timeout in seconds.

        Returns:
            Parsed JSON response body.

        Raises:
            AuthenticationError: On HTTP 401/403.
            ProviderError: On other HTTP or network errors.
        """
        headers = self._build_headers(account)
        open_handles = []
        try:
            files: Dict[str, tuple[str, Any, str]] = {}
            for field, spec in file_fields.items():
                if spec is None:
                    continue
                filename, path, content_type = spec
                fh = open(path, "rb")
                open_handles.append(fh)
                files[field] = (filename, fh, content_type)

            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                resp = await client.post(url, headers=headers, data=data, files=files)
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403):
                raise AuthenticationError(self.provider_id, f"HTTP {e.response.status_code}") from e
            raise ProviderError(
                f"{self.provider_id} multipart POST HTTP error: {e.response.status_code}"
            ) from e
        except httpx.HTTPError as e:
            raise ProviderError(
                f"{self.provider_id} multipart POST network error: {e}"
            ) from e
        finally:
            for fh in open_handles:
                fh.close()

    async def _fetch_json(
        self,
        account: ProviderAccount,
        url: str,
        timeout: float = 30.0,
    ) -> Dict[str, Any]:
        """
        GET a URL and return parsed JSON.

        Args:
            account: Provider account (used for headers).
            url: Full endpoint URL.
            timeout: Request timeout in seconds.

        Returns:
            Parsed JSON response body.

        Raises:
            AuthenticationError: On HTTP 401/403.
            ProviderError: On other HTTP or network errors.
        """
        headers = self._build_headers(account)
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403):
                raise AuthenticationError(self.provider_id, f"HTTP {e.response.status_code}") from e
            raise ProviderError(
                f"{self.provider_id} GET HTTP error: {e.response.status_code}"
            ) from e
        except httpx.HTTPError as e:
            raise ProviderError(
                f"{self.provider_id} GET network error: {e}"
            ) from e

    @staticmethod
    def _cleanup_temps(paths: list[str]) -> None:
        """Safely remove temporary files, swallowing errors."""
        for path in paths:
            try:
                if path and os.path.exists(path):
                    os.remove(path)
            except Exception:
                pass
