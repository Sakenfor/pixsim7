"""
Automation API (v1)

Minimal endpoints to manage devices and execution loops.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict, Any

from pixsim7_backend.infrastructure.database.session import get_db
from pixsim7_backend.domain.automation import AndroidDevice, ExecutionLoop, LoopStatus, AppActionPreset, AutomationExecution
from pixsim7_backend.services.automation import ExecutionLoopService
from pixsim7_backend.services.automation.device_sync_service import DeviceSyncService
from pixsim7_backend.services.automation.action_schemas import get_action_schemas, get_action_schemas_by_category

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
async def list_loops(db: AsyncSession = Depends(get_db)):
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
async def list_presets(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AppActionPreset))
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
async def list_executions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AutomationExecution).order_by(AutomationExecution.id.desc()))
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
