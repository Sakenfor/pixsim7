"""
Devtools codegen API endpoints.

Backend-authoritative task listing and execution for devtools.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import CurrentCodegenUser
from pixsim7.backend.main.services.codegen import (
    CodegenRunResult,
    CodegenTask,
    load_codegen_tasks,
    run_codegen_task,
)

router = APIRouter(prefix="/devtools/codegen", tags=["devtools", "codegen"])


class CodegenTaskResponse(BaseModel):
    id: str
    description: str
    script: str
    supports_check: bool
    groups: list[str] = Field(default_factory=list)


class CodegenTasksResponse(BaseModel):
    tasks: list[CodegenTaskResponse]
    total: int


class CodegenRunRequest(BaseModel):
    task_id: str = Field(..., min_length=1)
    check: bool = False


class CodegenRunResponse(BaseModel):
    task_id: str
    ok: bool
    exit_code: int | None
    duration_ms: int
    stdout: str
    stderr: str


def _to_task_response(task: CodegenTask) -> CodegenTaskResponse:
    return CodegenTaskResponse(
        id=task.id,
        description=task.description,
        script=task.script,
        supports_check=task.supports_check,
        groups=task.groups,
    )


def _to_run_response(result: CodegenRunResult) -> CodegenRunResponse:
    return CodegenRunResponse(
        task_id=result.task_id,
        ok=result.ok,
        exit_code=result.exit_code,
        duration_ms=result.duration_ms,
        stdout=result.stdout,
        stderr=result.stderr,
    )


@router.get("/tasks", response_model=CodegenTasksResponse)
async def list_codegen_tasks(user: CurrentCodegenUser):
    _ = user
    try:
        tasks = load_codegen_tasks()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load codegen tasks: {exc}") from exc

    return CodegenTasksResponse(
        tasks=[_to_task_response(task) for task in tasks],
        total=len(tasks),
    )


@router.post("/run", response_model=CodegenRunResponse)
async def run_codegen_task_endpoint(
    payload: CodegenRunRequest,
    user: CurrentCodegenUser,
):
    _ = user
    try:
        result = await run_in_threadpool(
            run_codegen_task,
            payload.task_id,
            payload.check,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to run codegen task: {exc}") from exc

    return _to_run_response(result)
