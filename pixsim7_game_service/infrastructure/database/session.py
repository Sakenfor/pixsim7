from __future__ import annotations
from sqlmodel import create_engine, Session
import os

ENGINE = None

def get_database_url() -> str:
    url = os.getenv("GAME_DB_DSN")
    if not url:
        # default local
        url = "postgresql+psycopg://postgres:postgres@localhost:5433/pixsim7_game"  # separate port/db
    return url

def get_engine():
    global ENGINE
    if ENGINE is None:
        ENGINE = create_engine(get_database_url(), echo=False)
    return ENGINE

def get_session() -> Session:
    return Session(get_engine())
