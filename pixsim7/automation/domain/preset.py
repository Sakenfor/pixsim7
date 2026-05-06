"""
Automation action preset model
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON, Text

from pixsim7.common.ownership import (
    OwnershipPolicy,
    OwnershipScope,
    SHARED_FLAG,
    SYSTEM_FLAG,
)


class ActionType(str, Enum):
    CLICK_COORDS = "click_coords"
    CLICK_ELEMENT = "click_element"
    TYPE_TEXT = "type_text"
    WAIT = "wait"
    WAIT_FOR_ELEMENT = "wait_for_element"
    PRESS_BACK = "press_back"
    PRESS_HOME = "press_home"
    NAVIGATE_UP = "navigate_up"
    SWIPE_BACK = "swipe_back"
    EMULATOR_BACK = "emulator_back"
    SWIPE = "swipe"
    LAUNCH_APP = "launch_app"
    EXIT_APP = "exit_app"
    CLEAR_APP_DATA = "clear_app_data"
    CLEAR_CACHE_VIA_SETTINGS = "clear_cache_via_settings"
    CHECK_ELEMENT_EXISTS = "check_element_exists"
    SCREENSHOT = "screenshot"
    SOFT_RESET_APP = "soft_reset_app"
    IF_ELEMENT_EXISTS = "if_element_exists"
    IF_ELEMENT_NOT_EXISTS = "if_element_not_exists"
    REPEAT = "repeat"


class AppActionPreset(SQLModel, table=True):
    __tablename__ = "app_action_presets"

    id: Optional[int] = Field(default=None, primary_key=True, index=True)
    name: str = Field(max_length=200)
    description: str = Field(sa_column=Column(Text))

    # Ownership and visibility (cross-DB ref to users.id; FK constraint dropped
    # for automation-DB extraction — see plan automation-package-extraction Phase 2c)
    owner_id: Optional[int] = Field(default=None, index=True)
    is_shared: bool = Field(default=False, index=True)
    is_system: bool = Field(default=False, index=True)
    cloned_from_id: Optional[int] = Field(default=None, foreign_key="app_action_presets.id")

    # Categorization
    category: str = Field(default="general", max_length=50, index=True)
    tags: List[str] = Field(default_factory=list, sa_column=Column(JSON))

    # Action sequence and target app
    actions: List[Dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    app_package: str = Field(default="ai.pixverse.pixverse", max_length=200)

    # Requirements
    requires_password: bool = Field(default=False)
    requires_google_account: bool = Field(default=False)

    # Execution defaults
    max_retries: int = Field(default=0)
    retry_delay_seconds: int = Field(default=5)
    timeout_seconds: int = Field(default=300)
    continue_on_error: bool = Field(default=False)

    # Usage metadata
    usage_count: int = Field(default=0)
    last_used: Optional[datetime] = Field(default=None)

    created_at: Optional[datetime] = Field(default=None)
    updated_at: Optional[datetime] = Field(default=None)


# Single source of truth for preset access control. Endpoints call the
# `assert_can_*` / `apply_visibility_filter` / `gate_admin_only_writes`
# helpers in pixsim7.common.ownership against this policy — no per-endpoint
# inline checks. Adding a new flag (e.g. `is_archived`) is just a new
# `AccessFlag(...)` entry in this tuple.
PRESET_POLICY = OwnershipPolicy(
    scope=OwnershipScope.USER,
    owner_field="owner_id",
    access_flags=(SYSTEM_FLAG, SHARED_FLAG),
)
