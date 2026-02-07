"""
Codegen Routes - Endpoints for codegen task discovery.
"""

from fastapi import APIRouter, HTTPException

from launcher.core.codegen import load_codegen_tasks, run_codegen_task

from ..models import CodegenRunRequest, CodegenRunResponse, CodegenTaskResponse, CodegenTasksResponse


router = APIRouter(prefix="/codegen", tags=["codegen"])


@router.get("/tasks", response_model=CodegenTasksResponse)
async def list_codegen_tasks():
    tasks = load_codegen_tasks()
    return CodegenTasksResponse(
        tasks=[
            CodegenTaskResponse(
                id=task.id,
                description=task.description,
                script=task.script,
                supports_check=task.supports_check,
                groups=task.groups,
            )
            for task in tasks
        ],
        total=len(tasks),
    )


@router.post("/run", response_model=CodegenRunResponse)
async def run_codegen_task_endpoint(payload: CodegenRunRequest):
    try:
        result = run_codegen_task(payload.task_id, check_mode=payload.check)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return CodegenRunResponse(
        task_id=result.task_id,
        ok=result.ok,
        exit_code=result.exit_code,
        duration_ms=result.duration_ms,
        stdout=result.stdout,
        stderr=result.stderr,
    )
