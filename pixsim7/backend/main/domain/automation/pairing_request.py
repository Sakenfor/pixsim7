"""
Pairing Request model - for remote device agent pairing flow
"""
from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class PairingRequest(SQLModel, table=True):
    """Pairing request for remote device agent"""
    __tablename__ = "pairing_requests"

    id: Optional[int] = Field(default=None, primary_key=True, index=True)

    # Agent identification (before pairing is complete)
    agent_id: str = Field(max_length=100, unique=True, index=True)  # UUID from agent
    pairing_code: str = Field(max_length=20, unique=True, index=True)  # e.g., "A1B2-C3D4"

    # Agent metadata
    name: str = Field(max_length=100)
    host: str = Field(max_length=100)
    port: int = Field(default=5037)
    api_port: int = Field(default=8765)
    version: str = Field(max_length=20)
    os_info: str = Field(max_length=100)

    # Pairing status
    paired_user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime  # Calculated as created_at + TTL

    def __repr__(self) -> str:
        status = "paired" if self.paired_user_id else "pending"
        return f"<PairingRequest {self.pairing_code} ({status})>"
