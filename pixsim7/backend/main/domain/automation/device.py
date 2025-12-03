"""
Android automation device model
"""
from typing import Optional
from datetime import datetime
from enum import Enum
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import String, Text


class DeviceType(str, Enum):
    BLUESTACKS = "bluestacks"
    ADB = "adb"


class ConnectionMethod(str, Enum):
    ADB = "adb"
    UIAUTOMATOR2 = "uiautomator2"


class DeviceStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    BUSY = "busy"
    ERROR = "error"


class AndroidDevice(SQLModel, table=True):
    """Android device in pool (emulator or physical)"""
    __tablename__ = "android_devices"

    id: Optional[int] = Field(default=None, primary_key=True, index=True)
    name: str = Field(max_length=100)
    device_type: DeviceType = Field()

    connection_method: ConnectionMethod = Field(
        default=ConnectionMethod.ADB,
        sa_column=Column(String(20), nullable=False, server_default="adb"),
    )

    # ADB identifier (e.g., emulator-5554 or host:port)
    adb_id: str = Field(max_length=100, index=True)

    # Optional physical device identification and primary record linking
    device_serial: Optional[str] = Field(default=None, max_length=100, index=True)
    primary_device_id: Optional[int] = Field(default=None, foreign_key="android_devices.id", index=True)
    
    # Remote agent (if device is from remote agent, not local)
    agent_id: Optional[int] = Field(default=None, foreign_key="device_agents.id", index=True)

    # Emulator details
    instance_name: Optional[str] = Field(default=None, max_length=100)
    instance_port: Optional[int] = Field(default=None)

    # Status
    status: DeviceStatus = Field(default=DeviceStatus.OFFLINE, index=True)
    is_enabled: bool = Field(default=True)

    # Assignment
    assigned_account_id: Optional[int] = Field(default=None, foreign_key="provider_accounts.id", index=True)
    assigned_at: Optional[datetime] = Field(default=None)

    # Metadata
    last_seen: Optional[datetime] = Field(default=None)
    last_used_at: Optional[datetime] = Field(default=None)  # Track last execution time for LRU device pool
    error_message: Optional[str] = Field(default=None, sa_column=Column(Text))

    created_at: Optional[datetime] = Field(default=None)
    updated_at: Optional[datetime] = Field(default=None)

    def __repr__(self) -> str:
        return f"<AndroidDevice {self.name} ({self.status.value})>"
