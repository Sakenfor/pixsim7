"""
Codegen Routes - Endpoints for codegen task discovery.
"""

from fastapi import APIRouter

from launcher.core.codegen import load_codegen_tasks

from ..models import CodegenTaskResponse, CodegenTasksResponse


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
