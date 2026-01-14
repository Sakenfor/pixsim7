from __future__ import annotations

from typing import Any, Dict, Optional

import httpx
from fastapi import Request

from pixsim7.backend.main.infrastructure.services.client import ServiceClientError
from pixsim7.backend.main.infrastructure.services.router import ServiceRouter
from pixsim7.backend.main.services.generation.service import GenerationService

GENERATION_SERVICE_ID = "generation"


class GenerationGateway:
    def __init__(self, router: ServiceRouter, local_service: GenerationService) -> None:
        self._router = router
        self.local = local_service

    def has_remote(self) -> bool:
        return self._router.get_client(GENERATION_SERVICE_ID) is not None

    async def request_remote(
        self,
        req: Request,
        method: str,
        path: str,
        *,
        json: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Optional[object]:
        client = self._router.get_client(GENERATION_SERVICE_ID)
        if not client:
            return None

        headers = _build_forward_headers(req)
        try:
            return await client.request_json(
                method,
                path,
                json=json,
                params=params,
                headers=headers,
            )
        except ServiceClientError:
            raise
        except httpx.RequestError as exc:
            raise ServiceClientError(502, f"Generation service unavailable: {exc}") from exc


def _build_forward_headers(req: Request) -> Dict[str, str]:
    headers: Dict[str, str] = {}
    auth = req.headers.get("authorization")
    if auth:
        headers["Authorization"] = auth
    request_id = req.headers.get("x-request-id")
    if request_id:
        headers["X-Request-ID"] = request_id
    return headers
