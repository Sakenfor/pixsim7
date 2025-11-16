from __future__ import annotations

import os
from typing import Any, Dict, Optional

import httpx


def get_content_api_base() -> str:
  base = os.getenv("CONTENT_API_BASE")
  if not base:
    base = "http://localhost:8001/api/v1"
  return base.rstrip("/")


async def fetch_asset(
  asset_id: int,
  authorization_header: str | None,
  timeout: float = 5.0,
) -> Optional[Dict[str, Any]]:
  """
  Fetch asset details from the content backend for the current user.

  Uses the same Authorization header that was sent to the game service.
  """
  url = f"{get_content_api_base()}/assets/{asset_id}"
  headers: Dict[str, str] = {}
  if authorization_header:
    headers["Authorization"] = authorization_header

  async with httpx.AsyncClient(timeout=timeout) as client:
    resp = await client.get(url, headers=headers)
    if resp.status_code == 200:
      return resp.json()
    # 404 -> asset not found for this user; anything else we treat as no-asset for now.
    return None

