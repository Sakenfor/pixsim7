"""
Automation API (v1)

Minimal endpoints to manage devices and execution loops.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, cast
from typing import List, Dict, Any, Optional

from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.domain.automation import AndroidDevice, DeviceAgent, DeviceStatus, ExecutionLoop, LoopStatus, AppActionPreset, AutomationExecution, AutomationStatus
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.services.automation import ExecutionLoopService
from pixsim7.backend.main.services.automation.device_sync_service import DeviceSyncService
from pixsim7.backend.main.services.automation.action_schemas import get_action_schemas, get_action_schemas_by_category
from pixsim7.backend.main.infrastructure.queue import queue_task
from pixsim7.backend.main.api.dependencies import CurrentUser
from datetime import datetime
from pydantic import BaseModel

router = APIRouter(prefix="/automation", tags=["automation"])


# ============================================================================
# Response DTOs
# ============================================================================

class DeviceScanResponse(BaseModel):
    """Response from device scan operation."""
    scanned: int
    added: int
    updated: int
    offline: int


class ExecutePresetResponse(BaseModel):
    """Response from executing a preset for an account."""
    status: str
    execution_id: int
    task_id: str
    account_id: int
    preset_id: int
    preset_name: str


class TestActionsResponse(BaseModel):
    """Response from test actions execution."""
    status: str
    execution_id: Optional[int] = None
    task_id: Optional[str] = None
    actions_count: Optional[int] = None
    message: Optional[str] = None  # Used when status="skipped"


class ClearExecutionsResponse(BaseModel):
    """Response from clearing automation executions."""
    status: str
    deleted: int
    filter: str


class StatusResponse(BaseModel):
    """Generic status response for simple operations."""
    status: str


@router.get("/devices", response_model=List[AndroidDevice])
async def list_devices(
    user: CurrentUser,
    include_alt: bool = False,
    include_disabled: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """
    List Android devices.

    Args:
        include_alt: If False (default), exclude alternate connections to same physical device.
                     If True, include all device connections.
        include_disabled: If False (default), exclude disabled devices.
                          If True, include all devices regardless of enabled status.

    Visibility rules:
    - Admins see all devices (including server-scanned ones with agent_id=None).
    - Regular users see only devices whose agent belongs to them (DeviceAgent.user_id).
    """
    if user.is_admin():
        query = select(AndroidDevice)
    else:
        query = (
            select(AndroidDevice)
            .join(DeviceAgent, AndroidDevice.agent_id == DeviceAgent.id)
            .where(DeviceAgent.user_id == user.id)
        )

    # Filter out disabled devices by default
    if not include_disabled:
        query = query.where(AndroidDevice.is_enabled == True)

    # Filter out alternate connections by default
    if not include_alt:
        query = query.where(AndroidDevice.primary_device_id.is_(None))

    result = await db.execute(query)
    return result.scalars().all()


@router.post("/devices/scan", response_model=DeviceScanResponse)
async def scan_devices(db: AsyncSession = Depends(get_db)) -> DeviceScanResponse:
    """Scan for ADB devices and sync to database."""
    svc = DeviceSyncService(db)
    stats = await svc.scan_and_sync()
    return DeviceScanResponse(**stats)


@router.post("/devices/check-ads")
async def check_device_ads(db: AsyncSession = Depends(get_db)):
    """
    Manually trigger ad detection check on all devices.
    Returns which primary devices are watching ads or in ad session.
    """
    svc = DeviceSyncService(db)
    stats = await svc.check_device_ads()

    # Get updated device statuses (only primary devices, exclude offline)
    result = await db.execute(
        select(AndroidDevice).where(
            AndroidDevice.status != DeviceStatus.OFFLINE,
            AndroidDevice.primary_device_id.is_(None),
        )
    )
    devices = result.scalars().all()

    return {
        **stats,
        "devices": [
            {
                "name": d.name,
                "adb_id": d.adb_id,
                "status": d.status.value,
                "is_watching_ad": d.is_watching_ad,
                "in_ad_session": d.ad_session_started_at is not None,
                "current_activity": d.current_activity,
            }
            for d in devices
        ]
    }


@router.post("/devices/{device_id}/reset")
async def reset_device_status(device_id: int, db: AsyncSession = Depends(get_db)):
    """
    Reset a stuck device back to ONLINE status.

    Clears:
    - assigned_account_id (automation assignment)
    - is_watching_ad (ad detection flag)
    - ad_session_started_at (ad session tracking)
    - Sets status to ONLINE if currently BUSY

    Use this when a device is stuck in BUSY state after an automation
    or ad session failed to clean up properly.
    """
    device = await db.get(AndroidDevice, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    old_status = device.status.value
    was_busy = device.status == DeviceStatus.BUSY

    # Clear all assignment and ad session state
    device.assigned_account_id = None
    device.is_watching_ad = False
    device.ad_session_started_at = None

    # Only change status if it was BUSY
    if was_busy:
        device.status = DeviceStatus.ONLINE

    await db.commit()

    return {
        "status": "reset",
        "device_id": device_id,
        "device_name": device.name,
        "old_status": old_status,
        "new_status": device.status.value,
        "cleared": {
            "assigned_account_id": True,
            "is_watching_ad": True,
            "ad_session_started_at": True,
        }
    }


@router.get("/loops", response_model=List[ExecutionLoop])
async def list_loops(
    provider_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    List all loops, optionally filtered by provider.

    If provider_id is specified, only returns loops that reference
    presets for that provider (via preset_id, shared_preset_ids,
    default_preset_ids, or account_preset_config).
    """
    if provider_id:
        # First get all preset IDs for this provider
        from sqlalchemy import or_, func
        from sqlalchemy.dialects.postgresql import JSONB
        provider_lower = provider_id.lower()
        preset_query = select(AppActionPreset.id).where(
            or_(
                func.lower(AppActionPreset.app_package).contains(provider_lower),
                cast(AppActionPreset.tags, JSONB).contains([provider_id])
            )
        )
        preset_result = await db.execute(preset_query)
        provider_preset_ids = set(preset_result.scalars().all())

        if not provider_preset_ids:
            # No presets for this provider, return empty list
            return []

        # Filter loops that reference any of these presets
        # This is complex because presets can be in multiple JSON fields
        loops_result = await db.execute(select(ExecutionLoop))
        all_loops = loops_result.scalars().all()

        filtered_loops = []
        for loop in all_loops:
            # Check if loop references any provider preset
            referenced_presets = set()

            # Check preset_id (legacy single preset)
            if loop.preset_id:
                referenced_presets.add(loop.preset_id)

            # Check shared_preset_ids
            if loop.shared_preset_ids:
                referenced_presets.update(loop.shared_preset_ids)

            # Check default_preset_ids
            if loop.default_preset_ids:
                referenced_presets.update(loop.default_preset_ids)

            # Check account_preset_config
            if loop.account_preset_config:
                for preset_list in loop.account_preset_config.values():
                    if isinstance(preset_list, list):
                        referenced_presets.update(preset_list)

            # Include loop if it references any provider preset
            if referenced_presets & provider_preset_ids:
                filtered_loops.append(loop)

        return filtered_loops
    else:
        # No filter, return all loops
        result = await db.execute(select(ExecutionLoop))
        return result.scalars().all()


@router.post("/loops", response_model=ExecutionLoop)
async def create_loop(loop: ExecutionLoop, db: AsyncSession = Depends(get_db)):
    db.add(loop)
    await db.commit()
    await db.refresh(loop)
    return loop


@router.post("/loops/{loop_id}/start")
async def start_loop(loop_id: int, db: AsyncSession = Depends(get_db)):
    loop = await db.get(ExecutionLoop, loop_id)
    if not loop:
        raise HTTPException(status_code=404, detail="Loop not found")
    loop.status = LoopStatus.ACTIVE
    await db.commit()
    return {"status": "active"}


@router.post("/loops/{loop_id}/pause")
async def pause_loop(loop_id: int, db: AsyncSession = Depends(get_db)):
    loop = await db.get(ExecutionLoop, loop_id)
    if not loop:
        raise HTTPException(status_code=404, detail="Loop not found")
    loop.status = LoopStatus.PAUSED
    await db.commit()
    return {"status": "paused"}


@router.post("/loops/{loop_id}/run-now")
async def run_loop_now(loop_id: int, db: AsyncSession = Depends(get_db)):
    loop = await db.get(ExecutionLoop, loop_id)
    if not loop:
        raise HTTPException(status_code=404, detail="Loop not found")
    svc = ExecutionLoopService(db)
    executions = await svc.process_loop(loop, bypass_status=True)
    if not executions:
        return {"status": "skipped"}
    return {
        "status": "queued",
        "executions_created": len(executions),
        "executions": [{"id": e.id, "task_id": e.task_id, "account_id": e.account_id} for e in executions]
    }


# ----- Presets -----

@router.get("/presets", response_model=List[AppActionPreset])
async def list_presets(
    provider_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    List all presets, optionally filtered by provider.

    If provider_id is specified, only returns presets where:
    - app_package contains the provider_id (case-insensitive), OR
    - tags array contains the provider_id
    """
    query = select(AppActionPreset)

    if provider_id:
        # Filter by app_package containing provider_id OR tags containing provider_id
        from sqlalchemy import or_, func
        from sqlalchemy.dialects.postgresql import JSONB
        provider_lower = provider_id.lower()
        query = query.where(
            or_(
                func.lower(AppActionPreset.app_package).contains(provider_lower),
                cast(AppActionPreset.tags, JSONB).contains([provider_id])
            )
        )

    result = await db.execute(query)
    return result.scalars().all()


@router.post("/presets", response_model=AppActionPreset)
async def create_preset(preset: AppActionPreset, db: AsyncSession = Depends(get_db)):
    db.add(preset)
    await db.commit()
    await db.refresh(preset)
    return preset


@router.get("/presets/{preset_id}", response_model=AppActionPreset)
async def get_preset(preset_id: int, db: AsyncSession = Depends(get_db)):
    preset = await db.get(AppActionPreset, preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    return preset


@router.put("/presets/{preset_id}", response_model=AppActionPreset)
async def update_preset(
    preset_id: int,
    updated_data: AppActionPreset,
    db: AsyncSession = Depends(get_db)
):
    """
    Update an existing preset.

    System presets cannot be modified - they must be copied first.
    """
    # Get existing preset
    preset = await db.get(AppActionPreset, preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")

    # Prevent modification of system presets
    if preset.is_system:
        raise HTTPException(
            status_code=403,
            detail="System presets cannot be modified. Please copy it first."
        )

    # Update fields
    preset.name = updated_data.name
    preset.description = updated_data.description
    preset.app_package = updated_data.app_package
    preset.category = updated_data.category
    preset.tags = updated_data.tags
    preset.actions = updated_data.actions
    preset.is_shared = updated_data.is_shared

    await db.commit()
    await db.refresh(preset)
    return preset


@router.delete("/presets/{preset_id}")
async def delete_preset(preset_id: int, db: AsyncSession = Depends(get_db)):
    """
    Delete a preset.

    System presets cannot be deleted.
    """
    preset = await db.get(AppActionPreset, preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")

    # Prevent deletion of system presets
    if preset.is_system:
        raise HTTPException(
            status_code=403,
            detail="System presets cannot be deleted."
        )

    await db.delete(preset)
    await db.commit()
    return {"status": "ok"}


@router.post("/presets/{preset_id}/copy", response_model=AppActionPreset)
async def copy_preset(preset_id: int, db: AsyncSession = Depends(get_db)):
    """
    Copy a preset (including system presets) to create a new user-editable preset.

    The copied preset will:
    - Have the same actions and configuration as the source
    - Be marked as is_system=False (user preset)
    - Have " (Copy)" appended to the name
    """
    # Get source preset
    source = await db.get(AppActionPreset, preset_id)
    if not source:
        raise HTTPException(status_code=404, detail="Preset not found")

    # Create new preset with copied data
    new_preset = AppActionPreset(
        name=f"{source.name} (Copy)",
        description=source.description,
        app_package=source.app_package,
        tags=source.tags.copy() if source.tags else [],
        actions=source.actions.copy() if source.actions else [],
        is_system=False,  # Always make copies non-system
    )

    db.add(new_preset)
    await db.commit()
    await db.refresh(new_preset)
    return new_preset


# ----- Executions -----

@router.get("/executions", response_model=List[AutomationExecution])
async def list_executions(
    limit: int = 100,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    List automation executions with optional filtering and limit.

    - limit: Maximum number of executions to return (default: 100, max: 500)
    - status: Filter by status (pending, running, completed, failed, cancelled)
    """
    query = select(AutomationExecution).order_by(AutomationExecution.id.desc())

    if status:
        query = query.where(AutomationExecution.status == status)

    query = query.limit(min(limit, 500))
    result = await db.execute(query)
    return result.scalars().all()


@router.delete("/executions/clear", response_model=ClearExecutionsResponse)
async def clear_executions(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
) -> ClearExecutionsResponse:
    """
    Clear (delete) automation executions by status.

    - If status is specified: deletes executions with that status (e.g., "completed", "failed")
    - If status is not specified: deletes all COMPLETED and FAILED executions

    Common use cases:
    - Clear all completed/failed: DELETE /automation/executions/clear
    - Clear only failed: DELETE /automation/executions/clear?status=failed
    - Clear only completed: DELETE /automation/executions/clear?status=completed

    Returns:
        Number of executions deleted
    """
    from sqlalchemy import delete

    # Build delete query
    if status:
        # Delete specific status
        delete_query = delete(AutomationExecution).where(
            AutomationExecution.status == status
        )
    else:
        # Default: delete completed and failed
        delete_query = delete(AutomationExecution).where(
            AutomationExecution.status.in_([AutomationStatus.COMPLETED, AutomationStatus.FAILED])
        )

    result = await db.execute(delete_query)
    await db.commit()

    deleted_count = result.rowcount

    return ClearExecutionsResponse(
        status="ok",
        deleted=deleted_count,
        filter=status if status else "completed,failed"
    )


@router.get("/executions/{execution_id}", response_model=AutomationExecution)
async def get_execution(execution_id: int, db: AsyncSession = Depends(get_db)):
    execution = await db.get(AutomationExecution, execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution


# ----- Action Schemas -----

@router.get("/action-schemas")
async def list_action_schemas() -> Dict[str, Any]:
    """
    Get all available action schemas for building action presets.

    Returns schemas with metadata including:
    - Action types and display names
    - Parameter definitions with types and validation
    - Categories for organizing actions
    - Examples for each action type
    - Nesting support indicators

    This endpoint enables dynamic UI generation for drag-and-drop action builders.
    """
    schemas = get_action_schemas()
    return {
        "schemas": [schema.model_dump() for schema in schemas],
        "total": len(schemas)
    }


@router.get("/action-schemas/by-category")
async def get_action_schemas_categorized() -> Dict[str, Any]:
    """
    Get action schemas grouped by category for organized UI display.

    Categories include:
    - basic: Fundamental actions (launch app, screenshot)
    - interaction: User interactions (click, type, swipe)
    - element: UI element-based actions (find, click element)
    - control_flow: Conditional logic and loops (if, repeat)
    - timing: Wait and delay actions
    - advanced: Complex automation actions
    """
    by_category = get_action_schemas_by_category()
    return {
        "categories": {
            category: [schema.model_dump() for schema in schemas]
            for category, schemas in by_category.items()
        }
    }


# ----- Execute preset/loop for specific account -----

class ExecutePresetRequest(BaseModel):
    """Request to execute a single preset for a specific account"""
    preset_id: int
    account_id: int
    device_id: Optional[int] = None
    priority: int = 1


@router.post("/execute-preset", response_model=ExecutePresetResponse)
async def execute_preset_for_account(
    request: ExecutePresetRequest,
    db: AsyncSession = Depends(get_db)
) -> ExecutePresetResponse:
    """
    Execute a single preset for a specific account.

    Creates an automation execution and queues it for processing.

    Device selection:
    - If device_id is specified, uses that device (if available)
    - If device_id is None/omitted, automatically selects best available device using LRU algorithm
    """
    # Validate preset exists
    preset = await db.get(AppActionPreset, request.preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")

    # Validate account exists
    account = await db.get(ProviderAccount, request.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Validate device if specified
    if request.device_id:
        device = await db.get(AndroidDevice, request.device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")

    # Create execution
    total_actions = len(preset.actions) if preset.actions else 0
    execution = AutomationExecution(
        user_id=account.user_id,
        preset_id=request.preset_id,
        account_id=request.account_id,
        device_id=request.device_id,  # None = auto-select in worker
        status=AutomationStatus.PENDING,
        priority=request.priority,
        total_actions=total_actions,
        created_at=datetime.utcnow(),
        source="manual",
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)

    # Queue task
    task_id = await queue_task("process_automation", execution.id)
    execution.task_id = task_id
    await db.commit()

    return ExecutePresetResponse(
        status="queued",
        execution_id=execution.id,
        task_id=task_id,
        account_id=request.account_id,
        preset_id=request.preset_id,
        preset_name=preset.name
    )


class TestActionsRequest(BaseModel):
    """Request to test actions (reuses existing execution infrastructure)"""
    account_id: int
    device_id: Optional[int] = None
    actions: List[Dict[str, Any]]
    variables: Optional[List[Dict[str, Any]]] = None
    start_index: int = 0
    end_index: Optional[int] = None  # None = run to end


@router.post("/test-actions", response_model=TestActionsResponse)
async def test_actions(
    request: TestActionsRequest,
    db: AsyncSession = Depends(get_db)
) -> TestActionsResponse:
    """
    Test actions by creating a queued execution (reuses existing infrastructure).

    Stores actions in execution_context and queues via normal worker.
    Frontend can poll execution status for progress.
    """
    # Validate account
    account = await db.get(ProviderAccount, request.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Validate device if specified
    if request.device_id:
        device = await db.get(AndroidDevice, request.device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")

    # Determine action range
    actions = request.actions or []
    start = max(0, request.start_index)
    end = request.end_index if request.end_index is not None else len(actions)
    end = min(end, len(actions))
    actions_to_run = actions[start:end]

    if not actions_to_run:
        return TestActionsResponse(
            status="skipped",
            message="No actions to test"
        )

    # Create execution with test actions stored in execution_context
    execution = AutomationExecution(
        user_id=account.user_id,
        preset_id=None,  # No preset - using inline actions
        account_id=request.account_id,
        device_id=request.device_id,
        status=AutomationStatus.PENDING,
        priority=10,  # High priority for tests
        total_actions=len(actions_to_run),
        created_at=datetime.utcnow(),
        source="test",
        execution_context={
            "test_actions": actions_to_run,
            "test_variables": request.variables,
            "original_start_index": start,  # For error reporting
        }
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)

    # Queue task (reuses existing worker)
    task_id = await queue_task("process_automation", execution.id)
    execution.task_id = task_id
    await db.commit()

    return TestActionsResponse(
        status="queued",
        execution_id=execution.id,
        task_id=task_id,
        actions_count=len(actions_to_run)
    )


class ExecuteLoopForAccountRequest(BaseModel):
    """Request to execute a loop's next preset for a specific account"""
    loop_id: int
    account_id: int


@router.post("/loops/execute-for-account")
async def execute_loop_for_account(
    request: ExecuteLoopForAccountRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Execute the next preset from a loop for a specific account.

    Uses the loop's preset execution mode to determine which preset to run:
    - SINGLE: Uses loop.preset_id
    - SHARED_LIST: Uses the next preset in the shared list
    - PER_ACCOUNT: Uses the next preset in the account's specific list
    """
    # Validate loop exists
    loop = await db.get(ExecutionLoop, request.loop_id)
    if not loop:
        raise HTTPException(status_code=404, detail="Loop not found")

    # Validate account exists
    account = await db.get(ProviderAccount, request.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Get next preset for this account from the loop
    preset_id = loop.get_next_preset_for_account(request.account_id)
    if not preset_id:
        raise HTTPException(status_code=400, detail="No preset configured for this account in the loop")

    preset = await db.get(AppActionPreset, preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail=f"Preset {preset_id} not found")

    # Create execution
    total_actions = len(preset.actions) if preset.actions else 0
    execution = AutomationExecution(
        user_id=account.user_id,
        preset_id=preset_id,
        account_id=request.account_id,
        status=AutomationStatus.PENDING,
        priority=1,
        total_actions=total_actions,
        created_at=datetime.utcnow(),
        source="manual_loop",
        loop_id=loop.id,
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)

    # Update loop stats and advance preset index
    loop.total_executions += 1
    loop.last_execution_at = datetime.utcnow()
    loop.last_account_id = request.account_id
    loop.advance_preset_index(request.account_id)
    await db.commit()

    # Queue task
    task_id = await queue_task("process_automation", execution.id)
    execution.task_id = task_id
    await db.commit()

    return {
        "status": "queued",
        "execution_id": execution.id,
        "task_id": task_id,
        "account_id": request.account_id,
        "preset_id": preset_id,
        "preset_name": preset.name,
        "loop_mode": loop.preset_execution_mode
    }


@router.get("/devices/{device_id}/ui-dump")
async def dump_device_ui(
    device_id: int,
    filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Dump UI elements from a device for debugging element selectors.
    Uses uiautomator2 for reliable UI hierarchy.

    Args:
        device_id: Device to inspect
        filter: Optional text to filter elements (searches text, content_desc, resource_id)
    """
    device = await db.get(AndroidDevice, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    from pixsim7.backend.main.services.automation.uia2 import UIA2
    import asyncio

    # Get UI hierarchy via uiautomator2
    loop = asyncio.get_event_loop()
    elements = await loop.run_in_executor(None, _dump_ui_elements_sync, device.adb_id, filter)

    return {
        "device_id": device_id,
        "device_name": device.name,
        "filter": filter,
        "count": len(elements),
        "elements": elements
    }


def _dump_ui_elements_sync(serial: str, filter_text: Optional[str] = None) -> list:
    """Sync function to dump UI elements via uiautomator2."""
    import uiautomator2 as u2

    results = []
    try:
        d = u2.connect(serial)

        # Get all elements with any selector
        for el in d.xpath('//*').all():
            info = el.info
            text = info.get('text', '') or ''
            desc = info.get('contentDescription', '') or ''
            rid = info.get('resourceName', '') or ''
            cls = info.get('className', '') or ''
            bounds = info.get('bounds', {})

            # Skip empty nodes
            if not text and not desc and not rid:
                continue

            # Apply filter if specified
            if filter_text:
                filter_lower = filter_text.lower()
                if (filter_lower not in text.lower() and
                    filter_lower not in desc.lower() and
                    filter_lower not in rid.lower()):
                    continue

            bounds_str = f"[{bounds.get('left',0)},{bounds.get('top',0)}][{bounds.get('right',0)},{bounds.get('bottom',0)}]"
            results.append({
                "text": text,
                "content_desc": desc,
                "resource_id": rid,
                "class": cls,
                "bounds": bounds_str,
            })
    except Exception as e:
        results.append({"error": str(e)})

    return results
