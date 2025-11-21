"""
WebSocket Message Envelope Types

Defines the structure of messages sent over WebSocket connections.
Part of Phase 31.2 - WebSocket Contract & Keep-Alive Tests.
"""

from typing import Any, Dict, Optional, Literal
from pydantic import BaseModel, Field


class WebSocketMessage(BaseModel):
    """
    Base message envelope for all JSON messages over WebSocket.

    Plain text messages (ping/pong) bypass this envelope.
    """

    type: str = Field(..., description="Message type identifier")
    payload: Optional[Any] = Field(None, description="Optional message payload")
    data: Optional[Any] = Field(None, description="Optional additional data (deprecated - use payload)")
    error: Optional[Dict[str, str]] = Field(None, description="Optional error information")


class ConnectedMessage(WebSocketMessage):
    """Connection established message"""

    type: Literal["connected"] = "connected"
    message: Optional[str] = None
    user_id: Optional[int] = None


class GenerationStatusMessage(WebSocketMessage):
    """Generation status update message"""

    type: Literal[
        "job:created",
        "job:processing",
        "job:completed",
        "job:failed",
    ]
    generation_id: Optional[int] = None
    status: Optional[str] = None
    user_id: Optional[int] = None


class ErrorMessage(WebSocketMessage):
    """Error message"""

    type: Literal["error"] = "error"
    error: Dict[str, str] = Field(..., description="Error details")


def is_keep_alive(message: str) -> bool:
    """
    Check if a message is a plain text keep-alive (ping/pong).

    Keep-alive messages bypass JSON parsing and envelope validation.
    """
    return message in ("ping", "pong")


def validate_message(data: Dict[str, Any]) -> WebSocketMessage:
    """
    Validate that a message conforms to the envelope structure.

    Raises:
        ValueError: If message is missing required fields
    """
    if "type" not in data:
        raise ValueError("Message missing required 'type' field")

    return WebSocketMessage(**data)
