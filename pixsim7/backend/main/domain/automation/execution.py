"""
Automation execution job model
"""
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON, Text


class AutomationStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AutomationExecution(SQLModel, table=True):
    __tablename__ = "automation_executions"

    id: Optional[int] = Field(default=None, primary_key=True, index=True)
    user_id: int = Field(foreign_key="users.id", index=True)

    # What to execute (preset_id is optional for test executions with inline actions)
    preset_id: Optional[int] = Field(default=None, foreign_key="app_action_presets.id", index=True)
    account_id: int = Field(foreign_key="provider_accounts.id", index=True)
    device_id: Optional[int] = Field(default=None, foreign_key="android_devices.id", index=True)

    # Status
    status: AutomationStatus = Field(default=AutomationStatus.PENDING, index=True)
    priority: int = Field(default=0)

    # Progress and results
    current_action_index: int = Field(default=0)
    total_actions: int = Field(default=0)
    screenshot_path: Optional[str] = Field(default=None, max_length=500)
    error_message: Optional[str] = Field(default=None, sa_column=Column(Text))
    error_action_index: Optional[int] = Field(default=None)
    error_details: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))

    # Retry logic
    retry_count: int = Field(default=0)
    max_retries: int = Field(default=2)

    # Timing
    created_at: Optional[datetime] = Field(default=None)
    started_at: Optional[datetime] = Field(default=None)
    completed_at: Optional[datetime] = Field(default=None)

    # Worker task tracking
    task_id: Optional[str] = Field(default=None, max_length=255, index=True)

    # Context
    execution_context: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))

    # Optional linkage to loop
    source: Optional[str] = Field(default=None, max_length=50)
    loop_id: Optional[int] = Field(default=None, foreign_key="execution_loops.id")

    @property
    def processing_time(self) -> float:
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return 0.0

    def can_retry(self) -> bool:
        return self.retry_count < self.max_retries and self.status == AutomationStatus.FAILED
