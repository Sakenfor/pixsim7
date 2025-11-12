"""
Job management request/response schemas
"""
from datetime import datetime
from typing import Any, Dict
from pydantic import BaseModel, Field
from pixsim7_backend.domain.enums import JobStatus, OperationType


# ===== REQUEST SCHEMAS =====

class CreateJobRequest(BaseModel):
    """Create new job request"""
    operation_type: OperationType
    provider_id: str = "pixverse"
    params: Dict[str, Any] = Field(
        ...,
        description="Operation parameters (prompt, quality, etc.)"
    )
    workspace_id: int | None = None
    parent_job_id: int | None = Field(
        None,
        description="For dependent jobs (extend, transition)"
    )
    priority: int = Field(0, ge=0, le=10)
    scheduled_at: datetime | None = Field(
        None,
        description="Schedule job to run at this time"
    )


class JobFilterRequest(BaseModel):
    """Filter jobs request"""
    status: JobStatus | None = None
    operation_type: OperationType | None = None
    workspace_id: int | None = None
    limit: int = Field(50, ge=1, le=100)
    offset: int = Field(0, ge=0)


# ===== RESPONSE SCHEMAS =====

class JobResponse(BaseModel):
    """Job information response"""
    id: int
    user_id: int
    workspace_id: int | None

    # Operation
    operation_type: OperationType
    provider_id: str
    params: Dict[str, Any]

    # Status
    status: JobStatus
    error_message: str | None
    retry_count: int

    # Scheduling
    priority: int
    parent_job_id: int | None
    scheduled_at: datetime | None

    # Timestamps
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None

    class Config:
        from_attributes = True


class JobListResponse(BaseModel):
    """Job list response with pagination"""
    jobs: list[JobResponse]
    total: int
    limit: int
    offset: int
