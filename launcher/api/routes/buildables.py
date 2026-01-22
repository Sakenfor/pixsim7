"""
Buildables Routes - Endpoints for buildable workspace packages.
"""

from fastapi import APIRouter

from launcher.core import load_buildables

from ..models import BuildableDefinitionResponse, BuildablesListResponse


router = APIRouter(prefix="/buildables", tags=["buildables"])


@router.get("", response_model=BuildablesListResponse)
async def list_buildables():
    """
    List buildable workspace packages.

    Returns:
        List of packages with a build script and pnpm command metadata.
    """
    buildables = load_buildables()
    items = [
        BuildableDefinitionResponse(
            id=buildable.id,
            title=buildable.title,
            package=buildable.package,
            directory=buildable.directory,
            description=buildable.description,
            command=buildable.command,
            args=buildable.args,
            category=buildable.category,
            tags=buildable.tags,
        )
        for buildable in buildables
    ]

    return BuildablesListResponse(
        buildables=items,
        total=len(items),
    )
