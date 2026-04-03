"""
App Map Snapshot API (v2).

Provides the canonical backend-served App Map snapshot for dev tooling.
"""

from typing import Optional

from fastapi import APIRouter, Depends

from pixsim7.backend.main.api.dependencies import get_current_user_optional
from pixsim7.backend.main.domain.user import User

from .dev_app_map_contract import AppMapSnapshotV2
from .dev_app_map_service import build_app_map_snapshot


router = APIRouter(prefix="/dev/app-map", tags=["dev"])


@router.get("/snapshot", response_model=AppMapSnapshotV2)
async def get_app_map_snapshot(
    user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Return canonical App Map snapshot (v2).

    Includes frontend generated registry data, backend runtime introspection,
    and optional external registry references.
    """
    return build_app_map_snapshot()
