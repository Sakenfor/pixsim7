"""
Codegen Routes - Endpoints for codegen task discovery.
"""

from fastapi import APIRouter, HTTPException

from launcher.core.codegen import load_codegen_tasks, run_codegen_task

from ..models import CodegenRunRequest, CodegenRunResponse, CodegenTaskResponse, CodegenTasksResponse


router = APIRouter(prefix="/codegen", tags=["codegen"])

# Codegen task → service dependency mapping.
# If the required service isn't running, the task will fail.
TASK_SERVICE_DEPS: dict[str, dict] = {
    "openapi": {
        "service": "main-api",
        "label": "Backend API",
        "reason": "Fetches OpenAPI schema from http://localhost:8000/openapi.json",
    },
    "plugin-codegen": {
        "service": "main-api",
        "label": "Backend API",
        "reason": "Reads plugin codegen manifests from backend",
    },
}


@router.get("/tasks")
async def list_codegen_tasks():
    tasks = load_codegen_tasks()

    # Check which required services are running
    dep_status = {}
    try:
        from ..dependencies import get_container
        container = get_container()
        pm = container.get_process_manager()
        for task_id, dep in TASK_SERVICE_DEPS.items():
            svc_key = dep["service"]
            running = pm.is_running(svc_key) if pm else False
            dep_status[task_id] = running
    except Exception:
        pass

    return {
        "tasks": [
            {
                "id": task.id,
                "description": task.description,
                "script": task.script,
                "supports_check": task.supports_check,
                "groups": task.groups,
                "requires_service": TASK_SERVICE_DEPS.get(task.id),
                "service_running": dep_status.get(task.id, True),
            }
            for task in tasks
        ],
        "total": len(tasks),
    }


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
