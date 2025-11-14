"""
Job management API endpoints
"""
from fastapi import APIRouter, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from pixsim7_backend.api.dependencies import CurrentUser, JobSvc, get_auth_service, get_database
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
import asyncio
import logging

logger = logging.getLogger(__name__)
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


# ===== WEBSOCKET - JOB EVENTS =====

@router.websocket("/ws/jobs")
async def job_events_websocket(websocket: WebSocket, token: str | None = Query(None)):
    """
    WebSocket endpoint for real-time job events

    Connect to this endpoint to receive job status updates in real-time.
    Authentication is required via token query parameter.

    Usage:
        ws://localhost:8001/api/v1/ws/jobs?token=<your_jwt_token>

    Events sent to client:
        - job:created - New job created
        - job:started - Job started processing
        - job:completed - Job completed successfully
        - job:failed - Job failed
        - job:cancelled - Job cancelled
        - job:progress - Job progress update
    """
    from pixsim7_backend.infrastructure.events.bus import event_bus, Event

    # Authenticate user
    if not token:
        await websocket.close(code=1008, reason="Missing authentication token")
        return

    try:
        # Get auth service and verify token
        from pixsim7_backend.services.user import UserService, AuthService

        async for db in get_database():
            user_service = UserService(db)
            auth_service = AuthService(db, user_service)
            user = await auth_service.verify_token(token)
            break
    except Exception as e:
        logger.warning(f"WebSocket authentication failed: {e}")
        await websocket.close(code=1008, reason="Invalid authentication token")
        return

    # Accept the connection
    await websocket.accept()

    # Send connection success message
    await websocket.send_json({
        "type": "connected",
        "user_id": user.id,
        "message": "Connected to job events stream"
    })

    logger.info(f"WebSocket connected for user {user.id}")

    # Create a queue for this connection
    event_queue: asyncio.Queue = asyncio.Queue()

    # Event handler that filters by user_id and queues events
    async def handle_job_event(event: Event):
        """Handle job events and send to this user if they own the job"""
        try:
            # Get job_id from event data
            job_id = event.data.get("job_id")
            if not job_id:
                return

            # Check if this job belongs to the connected user
            # For performance, we'll trust the event data's user_id if present
            event_user_id = event.data.get("user_id")
            if event_user_id and event_user_id != user.id:
                return  # Not this user's job

            # If no user_id in event, we need to query the job
            if not event_user_id:
                async for db in get_database():
                    from pixsim7_backend.domain.job import Job
                    from sqlalchemy import select

                    result = await db.execute(select(Job).where(Job.id == job_id))
                    job = result.scalar_one_or_none()

                    if not job or job.user_id != user.id:
                        return  # Not this user's job
                    break

            # Queue the event for sending
            await event_queue.put(event)

        except Exception as e:
            logger.error(f"Error handling job event: {e}", exc_info=True)

    # Subscribe to all job events
    event_bus.subscribe("job:created", handle_job_event)
    event_bus.subscribe("job:started", handle_job_event)
    event_bus.subscribe("job:completed", handle_job_event)
    event_bus.subscribe("job:failed", handle_job_event)
    event_bus.subscribe("job:cancelled", handle_job_event)
    event_bus.subscribe("job:progress", handle_job_event)

    try:
        # Main loop - send events and handle client messages
        while True:
            # Use select to handle both queue events and WebSocket messages
            receive_task = asyncio.create_task(websocket.receive_text())
            queue_task = asyncio.create_task(event_queue.get())

            done, pending = await asyncio.wait(
                [receive_task, queue_task],
                return_when=asyncio.FIRST_COMPLETED
            )

            # Cancel pending tasks
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

            # Handle completed task
            if receive_task in done:
                # Client sent a message
                try:
                    message = await receive_task

                    # Handle ping
                    if message == "ping":
                        await websocket.send_json({"type": "pong"})

                except WebSocketDisconnect:
                    logger.info(f"WebSocket disconnected for user {user.id}")
                    break
                except Exception as e:
                    logger.error(f"WebSocket receive error: {e}")
                    break

            if queue_task in done:
                # New event to send
                try:
                    event = await queue_task

                    # Send event to client
                    await websocket.send_json({
                        "type": event.event_type,
                        "job_id": event.data.get("job_id"),
                        "asset_id": event.data.get("asset_id"),
                        "status": event.data.get("status"),
                        "progress_percent": event.data.get("progress_percent"),
                        "stage": event.data.get("stage"),
                        "error": event.data.get("error"),
                        "data": event.data,
                    })

                except Exception as e:
                    logger.error(f"WebSocket send error: {e}")
                    break

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for user {user.id}")
    except Exception as e:
        logger.error(f"WebSocket error for user {user.id}: {e}", exc_info=True)
    finally:
        # Unsubscribe from events
        event_bus.unsubscribe("job:created", handle_job_event)
        event_bus.unsubscribe("job:started", handle_job_event)
        event_bus.unsubscribe("job:completed", handle_job_event)
        event_bus.unsubscribe("job:failed", handle_job_event)
        event_bus.unsubscribe("job:cancelled", handle_job_event)
        event_bus.unsubscribe("job:progress", handle_job_event)

        # Close connection
        try:
            await websocket.close()
        except Exception:
            pass

        logger.info(f"WebSocket closed for user {user.id}")
