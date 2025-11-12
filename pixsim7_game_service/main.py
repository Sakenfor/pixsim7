from fastapi import FastAPI
from sqlmodel import SQLModel
from pixsim7_game_service.api.v1.routers import api_router
from pixsim7_game_service.infrastructure.database.session import get_engine

app = FastAPI(title="PixSim7 Game Service")

@app.on_event("startup")
def on_startup():
    engine = get_engine()
    # For early dev convenience: create tables if not exist (later switch to Alembic)
    SQLModel.metadata.create_all(engine)

app.include_router(api_router, prefix="/api/v1")

@app.get("/health")
async def health():
    return {"status": "ok"}
