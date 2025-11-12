from fastapi import APIRouter

from .sessions import router as sessions_router

api_router = APIRouter()
api_router.include_router(sessions_router, prefix="/sessions", tags=["sessions"])