from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional, TypeVar, Generic

import httpx
from fastapi import HTTPException, Request

from .client import ServiceClientError
from .router import ServiceRouter

TLocal = TypeVar("TLocal")


@dataclass(frozen=True)
class ProxyResult:
    called: bool
    data: Optional[object]


class ServiceGateway(Generic[TLocal]):
    def __init__(self, service_id: str, router: ServiceRouter, local_service: TLocal) -> None:
        self._service_id = service_id
        self._router = router
        self.local = local_service

    def has_remote(self) -> bool:
        return self._router.get_client(self._service_id) is not None

    async def proxy(
        self,
        req: Request,
        method: str,
        path: str,
        *,
        json: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> ProxyResult:
        client = self._router.get_client(self._service_id)
        if not client:
            return ProxyResult(False, None)

        headers = _build_forward_headers(req)
        try:
            data = await client.request_json(
                method,
                path,
                json=json,
                params=params,
                headers=headers,
            )
            return ProxyResult(True, data)
        except ServiceClientError as exc:
            _raise_http_error(exc)
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"{self._service_id} service unavailable: {exc}",
            ) from exc

        return ProxyResult(True, None)


def _build_forward_headers(req: Request) -> Dict[str, str]:
    headers: Dict[str, str] = {}
    auth = req.headers.get("authorization")
    if auth:
        headers["Authorization"] = auth
    request_id = req.headers.get("x-request-id")
    if request_id:
        headers["X-Request-ID"] = request_id
    return headers


def _raise_http_error(exc: ServiceClientError) -> None:
    detail = exc.detail
    if isinstance(detail, dict) and "detail" in detail:
        detail = detail["detail"]
    raise HTTPException(status_code=exc.status_code, detail=detail)
