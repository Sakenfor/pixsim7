# PixSim7 Game Service

Separate service for interactive scene graph, sessions, NPC/world state.

## Scope
Owns gameplay domain:
- Scenes (ordered graph of nodes referencing assets from Content Service)
- Edges (choices with conditions/effects)
- Sessions (player progression + flags/relationships)
- World (locations, NPC schedules, NPC state)

Does NOT own raw media assets; those live in Content Service (pixsim7_backend). References them by `asset_id`.

## Stack
- FastAPI
- SQLModel / Postgres (separate DB or schema)
- Redis (future: pub/sub + locks)

## Initial Data Model (v1)
Tables:
- game_scenes
- game_scene_nodes
- game_scene_edges
- game_sessions
- game_session_events
- game_locations
- game_npcs
- npc_schedules
- npc_state

## Endpoints (MVP)
- POST /api/v1/game/sessions { scene_id } -> create session
- GET /api/v1/game/sessions/{id} -> current node + choices
- POST /api/v1/game/sessions/{id}/advance { edge_id } -> next node

## Future
- WebSockets for session/world updates
- Interaction lock via Redis
- World tick worker for active NPC movement

## Environment Variables
- GAME_DATABASE_URL=postgresql+asyncpg://user:pass@host:port/game_db
- CONTENT_API_BASE=http://localhost:8001/api/v1
- GAME_REDIS_URL=redis://localhost:6379/2

## Migrations
Use Alembic in `infrastructure/database/migrations`.

## Development
```bash
# Install
pip install -r requirements.txt

# Run
uvicorn pixsim7_game_service.main:app --reload --port 9001

# Migrate
alembic upgrade head
```
