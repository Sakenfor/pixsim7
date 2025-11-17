"""
Automation API (v1)

Minimal endpoints to manage devices and execution loops.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict, Any, Optional

from pixsim7_backend.infrastructure.database.session import get_db
from pixsim7_backend.domain.automation import AndroidDevice, ExecutionLoop, LoopStatus, AppActionPreset, AutomationExecution, AutomationStatus
from pixsim7_backend.domain import ProviderAccount
from pixsim7_backend.services.automation import ExecutionLoopService
from pixsim7_backend.services.automation.device_sync_service import DeviceSyncService
from pixsim7_backend.services.automation.action_schemas import get_action_schemas, get_action_schemas_by_category
from pixsim7_backend.infrastructure.queue import queue_task
from datetime import datetime
from pydantic import BaseModel

router = APIRouter(prefix="/automation", tags=["automation"])


@router.get("/devices", response_model=List[AndroidDevice])
async def list_devices(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AndroidDevice))
    return result.scalars().all()


@router.post("/devices/scan")
async def scan_devices(db: AsyncSession = Depends(get_db)):
    svc = DeviceSyncService(db)
    stats = await svc.scan_and_sync()
    return stats


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
        provider_lower = provider_id.lower()
        preset_query = select(AppActionPreset.id).where(
            or_(
                func.lower(AppActionPreset.app_package).contains(provider_lower),
                AppActionPreset.tags.contains([provider_id])
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
        provider_lower = provider_id.lower()
        query = query.where(
            or_(
                func.lower(AppActionPreset.app_package).contains(provider_lower),
                AppActionPreset.tags.contains([provider_id])
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
    priority: int = 1


@router.post("/execute-preset")
async def execute_preset_for_account(
    request: ExecutePresetRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Execute a single preset for a specific account.

    Creates an automation execution and queues it for processing.
    """
    # Validate preset exists
    preset = await db.get(AppActionPreset, request.preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")

    # Validate account exists
    account = await db.get(ProviderAccount, request.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Create execution
    total_actions = len(preset.actions) if preset.actions else 0
    execution = AutomationExecution(
        user_id=account.user_id,
        preset_id=request.preset_id,
        account_id=request.account_id,
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

    return {
        "status": "queued",
        "execution_id": execution.id,
        "task_id": task_id,
        "account_id": request.account_id,
        "preset_id": request.preset_id,
        "preset_name": preset.name
    }


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
