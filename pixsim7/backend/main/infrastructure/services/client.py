from __future__ import annotations

from typing import Any, Dict, Optional

import httpx


class ServiceClientError(RuntimeError):
    def __init__(self, status_code: int, detail: object):
        super().__init__(f"Service request failed ({status_code})")
        self.status_code = status_code
        self.detail = detail


class ServiceClient:
    def __init__(self, base_url: str, timeout_s: float = 30.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = httpx.Timeout(timeout_s)

    def _build_url(self, path: str) -> str:
        if not path.startswith("/"):
            path = f"/{path}"
        return f"{self._base_url}{path}"

    async def request_json(
        self,
        method: str,
        path: str,
        *,
        json: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Optional[object]:
        url = self._build_url(path)
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.request(
                method,
                url,
                json=json,
                params=params,
                headers=headers,
            )

        if response.status_code == 204 or not response.content:
            if response.status_code >= 400:
                raise ServiceClientError(response.status_code, response.text)
            return None

        try:
            data = response.json()
        except ValueError:
            data = response.text

        if response.status_code >= 400:
            detail = data
            if isinstance(data, dict) and "detail" in data:
                detail = data["detail"]
            raise ServiceClientError(response.status_code, detail)

        return data
