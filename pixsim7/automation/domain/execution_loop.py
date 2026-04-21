"""
Execution loop models and enums
"""
from typing import Optional, Dict, Any, List as TypeList
from datetime import datetime
from enum import Enum
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON, Text

from pixsim7.backend.main.shared.datetime_utils import utcnow


class LoopSelectionMode(str, Enum):
    MOST_CREDITS = "most_credits"
    LEAST_CREDITS = "least_credits"
    ROUND_ROBIN = "round_robin"
    SPECIFIC_ACCOUNTS = "specific_accounts"


class PresetExecutionMode(str, Enum):
    SINGLE = "SINGLE"
    SHARED_LIST = "SHARED_LIST"
    PER_ACCOUNT = "PER_ACCOUNT"


class LoopStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    STOPPED = "stopped"
    ERROR = "error"


class ExecutionLoop(SQLModel, table=True):
    __tablename__ = "execution_loops"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    name: str = Field(max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)

    # Legacy single preset
    preset_id: Optional[int] = Field(default=None, foreign_key="app_action_presets.id")

    # Preset execution configuration
    preset_execution_mode: PresetExecutionMode = Field(default=PresetExecutionMode.SINGLE)

    # Shared list mode
    shared_preset_ids: TypeList[int] = Field(default_factory=list, sa_column=Column(JSON))
    current_preset_index: int = Field(default=0)
    current_account_id: Optional[int] = Field(default=None)  # Track which account is currently executing presets

    # Per-account configuration
    account_preset_config: Dict[int, TypeList[int]] = Field(default_factory=dict, sa_column=Column(JSON))
    default_preset_ids: TypeList[int] = Field(default_factory=list, sa_column=Column(JSON))
    account_execution_state: Dict[int, Dict[str, int]] = Field(default_factory=dict, sa_column=Column(JSON))

    # Selection strategy
    selection_mode: LoopSelectionMode = Field(default=LoopSelectionMode.MOST_CREDITS)
    account_ids: TypeList[int] = Field(default_factory=list, sa_column=Column(JSON))

    # Conditions
    min_credits: int = Field(default=0)
    max_credits: Optional[int] = Field(default=None)
    require_online_device: bool = Field(default=True)
    skip_accounts_already_ran_today: bool = Field(default=False)
    skip_google_jwt_accounts: bool = Field(default=False)

    # Timing
    delay_between_executions: int = Field(default=60)
    max_executions_per_day: Optional[int] = Field(default=None)

    # Preferred device
    preferred_device_id: Optional[int] = Field(default=None, foreign_key="android_devices.id")

    # State
    status: LoopStatus = Field(default=LoopStatus.PAUSED)
    is_enabled: bool = Field(default=True)

    # Stats
    total_executions: int = Field(default=0)
    successful_executions: int = Field(default=0)
    failed_executions: int = Field(default=0)
    last_execution_at: Optional[datetime] = Field(default=None)
    last_account_id: Optional[int] = Field(default=None)
    executions_today: int = Field(default=0)
    last_reset_date: Optional[datetime] = Field(default=None)

    # Errors
    consecutive_failures: int = Field(default=0)
    max_consecutive_failures: int = Field(default=5)
    last_error: Optional[str] = Field(default=None, max_length=500)

    # Timestamps
    created_at: Optional[datetime] = Field(default_factory=utcnow)
    updated_at: Optional[datetime] = Field(default_factory=utcnow)
    started_at: Optional[datetime] = Field(default=None)
    stopped_at: Optional[datetime] = Field(default=None)

    def get_next_preset_for_account(self, account_id: int) -> Optional[int]:
        if self.preset_execution_mode == PresetExecutionMode.SINGLE:
            return self.preset_id
        elif self.preset_execution_mode == PresetExecutionMode.SHARED_LIST:
            if not self.shared_preset_ids:
                return self.preset_id
            return self.shared_preset_ids[self.current_preset_index]
        elif self.preset_execution_mode == PresetExecutionMode.PER_ACCOUNT:
            account_presets = (
                self.account_preset_config.get(account_id)
                or self.account_preset_config.get(str(account_id))
                or self.default_preset_ids
            )
            if not account_presets:
                return self.preset_id
            key = str(account_id)
            state = self.account_execution_state.get(key) or {"current_index": 0, "completed_cycles": 0}
            idx = int(state.get("current_index", 0))
            if idx < len(account_presets):
                return account_presets[idx]
            # Reset out-of-range
            self.account_execution_state[key] = {"current_index": 0, "completed_cycles": state.get("completed_cycles", 0)}
            self.account_execution_state = dict(self.account_execution_state)
            return account_presets[0]
        return self.preset_id

    def advance_preset_index(self, account_id: int) -> None:
        if self.preset_execution_mode == PresetExecutionMode.SHARED_LIST:
            if self.shared_preset_ids:
                self.current_preset_index += 1
                # If we've completed all presets for this account, reset for next account
                if self.current_preset_index >= len(self.shared_preset_ids):
                    self.current_preset_index = 0
                    self.current_account_id = None  # Signal to move to next account
        elif self.preset_execution_mode == PresetExecutionMode.PER_ACCOUNT:
            account_presets = (
                self.account_preset_config.get(account_id)
                or self.account_preset_config.get(str(account_id))
                or self.default_preset_ids
            )
            if not account_presets:
                return
            key = str(account_id)
            state = self.account_execution_state.get(key) or {"current_index": 0, "completed_cycles": 0}
            state["current_index"] += 1
            if state["current_index"] >= len(account_presets):
                state["current_index"] = 0
                state["completed_cycles"] += 1
                self.current_account_id = None  # Signal to move to next account
            self.account_execution_state[key] = state
            self.account_execution_state = dict(self.account_execution_state)


class ExecutionLoopHistory(SQLModel, table=True):
    __tablename__ = "execution_loop_history"

    id: Optional[int] = Field(default=None, primary_key=True)
    loop_id: int = Field(foreign_key="execution_loops.id", index=True)
    user_id: int = Field(foreign_key="users.id")
    account_id: Optional[int] = Field(default=None, foreign_key="provider_accounts.id")
    device_id: Optional[int] = Field(default=None, foreign_key="android_devices.id")
    execution_id: Optional[int] = Field(default=None, foreign_key="automation_executions.id")
    preset_id: Optional[int] = Field(default=None, foreign_key="app_action_presets.id")

    status: str = Field(max_length=50)
    reason: Optional[str] = Field(default=None, max_length=500)
    error_message: Optional[str] = Field(default=None, sa_column=Column(Text))

    account_email: Optional[str] = Field(default=None, max_length=255)
    account_credits_before: Optional[int] = Field(default=None)
    account_credits_after: Optional[int] = Field(default=None)

    preset_name: Optional[str] = Field(default=None, max_length=255)
    device_name: Optional[str] = Field(default=None, max_length=255)
    selection_mode: Optional[str] = Field(default=None, max_length=50)

    started_at: datetime = Field(default_factory=utcnow)
    completed_at: Optional[datetime] = Field(default=None)
    duration_seconds: Optional[float] = Field(default=None)

    context_data: dict = Field(default_factory=dict, sa_column=Column(JSON))
