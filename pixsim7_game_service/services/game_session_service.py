from __future__ import annotations

from typing import Optional

from sqlmodel import Session, select

from pixsim7_game_service.domain.models import (
  GameSession,
  GameScene,
  GameSceneEdge,
  GameSessionEvent,
)


class GameSessionService:
  def __init__(self, db: Session):
    self.db = db

  def _get_scene(self, scene_id: int) -> GameScene:
    scene = self.db.exec(
      select(GameScene).where(GameScene.id == scene_id)
    ).first()
    if not scene:
      raise ValueError("scene_not_found")
    if not scene.entry_node_id:
      raise ValueError("scene_missing_entry_node")
    return scene

  def create_session(self, *, user_id: int, scene_id: int) -> GameSession:
    scene = self._get_scene(scene_id)
    session = GameSession(
      user_id=user_id,
      scene_id=scene.id,
      current_node_id=scene.entry_node_id,
    )
    self.db.add(session)
    self.db.commit()
    self.db.refresh(session)

    event = GameSessionEvent(
      session_id=session.id,
      node_id=scene.entry_node_id,
      action="session_created",
      diff={"scene_id": scene.id},
    )
    self.db.add(event)
    self.db.commit()

    return session

  def get_session(self, session_id: int) -> Optional[GameSession]:
    return self.db.get(GameSession, session_id)

  def advance_session(self, *, session_id: int, edge_id: int) -> GameSession:
    session = self.db.get(GameSession, session_id)
    if not session:
      raise ValueError("session_not_found")

    edge = self.db.exec(
      select(GameSceneEdge).where(GameSceneEdge.id == edge_id)
    ).first()
    if not edge or edge.from_node_id != session.current_node_id:
      raise ValueError("invalid_edge_for_current_node")

    session.current_node_id = edge.to_node_id
    self.db.add(session)

    event = GameSessionEvent(
      session_id=session.id,
      node_id=edge.to_node_id,
      edge_id=edge.id,
      action="advance",
      diff={"from_node_id": edge.from_node_id, "to_node_id": edge.to_node_id},
    )
    self.db.add(event)

    self.db.commit()
    self.db.refresh(session)
    return session

