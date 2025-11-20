"""
WebSocket connection manager for real-time updates

Manages WebSocket connections and broadcasts generation status updates to connected clients.
"""
from typing import Dict, List, Set
from fastapi import WebSocket, WebSocketDisconnect
import logging
import json

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages WebSocket connections for real-time generation updates

    Features:
    - Per-user connection tracking
    - Broadcast to specific users
    - Broadcast to all connections
    - Automatic cleanup on disconnect
    """

    def __init__(self):
        # Map of user_id -> set of WebSocket connections
        self._connections: Dict[int, Set[WebSocket]] = {}
        # All active connections
        self._all_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket, user_id: int):
        """
        Accept and register a new WebSocket connection

        Args:
            websocket: WebSocket connection
            user_id: User ID for filtering broadcasts
        """
        await websocket.accept()

        # Add to user's connections
        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(websocket)

        # Add to all connections
        self._all_connections.add(websocket)

        logger.info(f"WebSocket connected for user {user_id}. Total connections: {len(self._all_connections)}")

    def disconnect(self, websocket: WebSocket, user_id: int):
        """
        Remove a WebSocket connection

        Args:
            websocket: WebSocket connection
            user_id: User ID
        """
        # Remove from user's connections
        if user_id in self._connections:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]

        # Remove from all connections
        self._all_connections.discard(websocket)

        logger.info(f"WebSocket disconnected for user {user_id}. Total connections: {len(self._all_connections)}")

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """
        Send a message to a specific WebSocket connection

        Args:
            message: Message dict to send as JSON
            websocket: Target WebSocket connection
        """
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Failed to send message to WebSocket: {e}")

    async def broadcast_to_user(self, message: dict, user_id: int):
        """
        Broadcast a message to all connections for a specific user

        Args:
            message: Message dict to send as JSON
            user_id: Target user ID
        """
        if user_id not in self._connections:
            return

        # Send to all connections for this user
        dead_connections = set()
        for connection in self._connections[user_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Failed to send to user {user_id}: {e}")
                dead_connections.add(connection)

        # Clean up dead connections
        for connection in dead_connections:
            self.disconnect(connection, user_id)

    async def broadcast(self, message: dict):
        """
        Broadcast a message to all connected clients

        Args:
            message: Message dict to send as JSON
        """
        dead_connections = set()
        for connection in self._all_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Failed to broadcast: {e}")
                dead_connections.add(connection)

        # Clean up dead connections
        for connection in dead_connections:
            # Find user_id for this connection
            for user_id, user_connections in list(self._connections.items()):
                if connection in user_connections:
                    self.disconnect(connection, user_id)
                    break

    def get_connection_count(self) -> int:
        """Get total number of active connections"""
        return len(self._all_connections)

    def get_user_connection_count(self, user_id: int) -> int:
        """Get number of connections for a specific user"""
        return len(self._connections.get(user_id, set()))


# Global connection manager instance
connection_manager = ConnectionManager()
