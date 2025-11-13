# Load .env file BEFORE any other imports that need env vars
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from sqlmodel import SQLModel
from pixsim7_game_service.api.v1.routers import api_router
from pixsim7_game_service.infrastructure.database.session import get_engine
from pixsim_logging import configure_logging

logger = configure_logging("game")

app = FastAPI(title="PixSim7 Game Service")

@app.on_event("startup")
def on_startup():
    engine = get_engine()
    # For early dev convenience: create tables if not exist (later switch to Alembic)
    SQLModel.metadata.create_all(engine)
    logger.info("service_started", component="game_service")

app.include_router(api_router, prefix="/api/v1")

@app.get("/health")
async def health():
    logger.debug("health_check")
    return {"status": "ok"}
