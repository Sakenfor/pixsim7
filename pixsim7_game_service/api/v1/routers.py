from fastapi import APIRouter

from .sessions import router as sessions_router
from .scenes import router as scenes_router

api_router = APIRouter()
api_router.include_router(sessions_router, prefix="/sessions", tags=["sessions"])
api_router.include_router(scenes_router, prefix="/scenes", tags=["scenes"])
