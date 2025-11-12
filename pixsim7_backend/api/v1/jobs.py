"""
Job management API endpoints
"""
from fastapi import APIRouter, HTTPException, Query, Request
from pixsim7_backend.api.dependencies import CurrentUser, JobSvc
from pixsim7_backend.shared.schemas.job_schemas import (
    CreateJobRequest,
    JobResponse,
    JobListResponse,
)
from pixsim7_backend.domain.enums import JobStatus, OperationType
from pixsim7_backend.shared.errors import (
    ResourceNotFoundError,
    ValidationError as DomainValidationError,
    QuotaExceededError,
)
from pixsim7_backend.shared.rate_limit import job_create_limiter, get_client_identifier

router = APIRouter()


# ===== CREATE JOB =====

@router.post("/jobs", response_model=JobResponse, status_code=201)
async def create_job(
    request: CreateJobRequest,
    req: Request,
    user: CurrentUser,
    job_service: JobSvc
):
    """
    Create a new job

    Creates a video generation job with the specified operation type and parameters.
    The job will be queued for processing by background workers.

    **Operation Types:**
    - `text_to_video`: Generate video from text prompt
    - `image_to_video`: Generate video from image + prompt
    - `video_extend`: Extend existing video
    - `video_transition`: Create transition between videos
    - `fusion`: Combine multiple videos

    **Required params by operation:**
    - `text_to_video`: prompt, quality (720p/1080p)
    - `image_to_video`: prompt, image_url, quality
    - `video_extend`: video_url, extend_seconds
    - `video_transition`: video_url_1, video_url_2
    - `fusion`: video_urls (list)
    
    Rate limited: 10 requests per 60 seconds per user/IP
    """
    # Rate limit check
    identifier = await get_client_identifier(req)
    await job_create_limiter.check(identifier)
    
    try:
        job = await job_service.create_job(
            user=user,
            operation_type=request.operation_type,
            provider_id=request.provider_id,
            params=request.params,
            workspace_id=request.workspace_id,
            parent_job_id=request.parent_job_id,
            priority=request.priority,
            scheduled_at=request.scheduled_at
        )

        return JobResponse.model_validate(job)

    except QuotaExceededError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except DomainValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create job: {str(e)}")


# ===== LIST JOBS =====

@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(
    user: CurrentUser,
    job_service: JobSvc,
    status: JobStatus | None = Query(None, description="Filter by status"),
    operation_type: OperationType | None = Query(None, description="Filter by operation type"),
    workspace_id: int | None = Query(None, description="Filter by workspace"),
    limit: int = Query(50, ge=1, le=100, description="Results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset")
):
    """
    List jobs for current user

    Returns paginated list of jobs with optional filters.
    Jobs are returned in reverse chronological order (newest first).
    """
    try:
        # Build filters
        filters = {}
        if status:
            filters["status"] = status
        if operation_type:
            filters["operation_type"] = operation_type
        if workspace_id:
            filters["workspace_id"] = workspace_id

        # Get jobs
        jobs = await job_service.list_jobs(
            user=user,
            filters=filters,
            limit=limit,
            offset=offset
        )

        # Get total count (simplified - would need separate count query in production)
        total = len(jobs)  # TODO: Add proper count query to service

        return JobListResponse(
            jobs=[JobResponse.model_validate(job) for job in jobs],
            total=total,
            limit=limit,
            offset=offset
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list jobs: {str(e)}")


# ===== GET JOB =====

@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: int,
    user: CurrentUser,
    job_service: JobSvc
):
    """
    Get job details

    Returns detailed information about a specific job.
    Users can only access their own jobs.
    """
    try:
        job = await job_service.get_job_for_user(job_id, user)
        return JobResponse.model_validate(job)

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Job not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get job: {str(e)}")


# ===== CANCEL JOB =====

@router.delete("/jobs/{job_id}", status_code=204)
async def cancel_job(
    job_id: int,
    user: CurrentUser,
    job_service: JobSvc
):
    """
    Cancel a job

    Cancels a pending or processing job. Completed or failed jobs cannot be cancelled.
    Users can only cancel their own jobs.
    """
    try:
        await job_service.cancel_job(job_id, user)
        return None

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Job not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except DomainValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to cancel job: {str(e)}")
