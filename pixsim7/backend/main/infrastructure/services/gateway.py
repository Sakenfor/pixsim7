from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional, TypeVar, Generic

import httpx
from fastapi import HTTPException, Request

from .client import ServiceClientError
from .router import ServiceRouter

TLocal = TypeVar("TLocal")

logger = logging.getLogger(__name__)

# After a connect failure, skip proxy attempts for this many seconds.
_CIRCUIT_OPEN_SECONDS = 30.0


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

        # Circuit breaker: skip proxy if remote recently failed to connect
        last_fail = _circuit_breaker_state.get(self._service_id)
        if last_fail is not None and (time.monotonic() - last_fail) < _CIRCUIT_OPEN_SECONDS:
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
            # Success — clear any previous circuit breaker state
            _circuit_breaker_state.pop(self._service_id, None)
            return ProxyResult(True, data)
        except ServiceClientError as exc:
            _raise_http_error(exc)
        except httpx.ConnectError:
            # Remote service is unreachable — fall back to local processing
            _circuit_breaker_state[self._service_id] = time.monotonic()
            logger.info(
                "service_proxy_connect_failed",
                service_id=self._service_id,
                msg=f"Remote {self._service_id} unreachable, falling back to local (circuit open for {_CIRCUIT_OPEN_SECONDS}s)",
            )
            return ProxyResult(False, None)
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"{self._service_id} service unavailable: {exc}",
            ) from exc

        return ProxyResult(True, None)


# Module-level circuit breaker: service_id → monotonic timestamp of last failure
_circuit_breaker_state: Dict[str, float] = {}


def _build_forward_headers(req: Request) -> Dict[str, str]:
    headers: Dict[str, str] = {}
    auth = req.headers.get("authorization")
    if auth:
        headers["Authorization"] = auth
    request_id = req.headers.get("x-request-id")
    if request_id:
        headers["X-Request-ID"] = request_id
    trace_id = req.headers.get("x-trace-id")
    if trace_id:
        headers["X-Trace-ID"] = trace_id
    client_surface = req.headers.get("x-client-surface")
    if client_surface:
        headers["X-Client-Surface"] = client_surface
    return headers


def _raise_http_error(exc: ServiceClientError) -> None:
    detail = exc.detail
    if isinstance(detail, dict) and "detail" in detail:
        detail = detail["detail"]
    raise HTTPException(status_code=exc.status_code, detail=detail)
