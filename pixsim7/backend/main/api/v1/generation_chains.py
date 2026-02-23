"""Generation Chains API endpoints

REST API for managing and executing generation chains:
- CRUD operations for chains
- Execute: run a chain sequentially (template roll → generate → pipe)
- Execution tracking: query execution progress and per-step state
"""

from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_db, get_current_user
from pixsim7.backend.main.domain.generation.chain import ChainExecution, GenerationChain
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.services.generation.chain_executor import ChainExecutor
from pixsim7.backend.main.services.generation.creation import GenerationCreationService
from pixsim7.backend.main.services.generation.query import GenerationQueryService
from pixsim7.backend.main.services.generation.step_executor import GenerationStepExecutor
from pixsim7.backend.main.services.prompt.block.template_service import BlockTemplateService
from pixsim7.backend.main.services.user.user_service import UserService
from pixsim7.backend.main.shared.datetime_utils import utcnow

router = APIRouter(prefix="/generation-chains", tags=["generation-chains"])


# ===== Request/Response Models =====


class ChainStepInput(BaseModel):
    id: str = Field(..., description="Stable step ID (unique within chain)")
    label: Optional[str] = Field(None, description="Human-readable label")
    template_id: str = Field(..., description="BlockTemplate ID to roll")
    operation: Optional[str] = Field(None, description="Operation type override")
    input_from: Optional[str] = Field(
        None, description="Step ID to take input from (defaults to previous)"
    )
    control_overrides: Optional[Dict[str, float]] = Field(
        None, description="Template slider overrides"
    )
    character_binding_overrides: Optional[Dict[str, Any]] = Field(
        None, description="Character binding overrides"
    )
    guidance: Optional[Dict[str, Any]] = Field(
        None, description="Provider-agnostic guidance plan or patch"
    )
    guidance_inherit: Optional[Dict[str, bool]] = Field(
        None, description="Inheritance flags: references, regions, masks, constraints"
    )


class CreateChainRequest(BaseModel):
    name: str = Field(..., max_length=255)
    description: Optional[str] = None
    steps: List[ChainStepInput] = Field(..., min_length=1)
    tags: List[str] = Field(default_factory=list)
    chain_metadata: Dict[str, Any] = Field(default_factory=dict)
    is_public: bool = False


class UpdateChainRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    steps: Optional[List[ChainStepInput]] = None
    tags: Optional[List[str]] = None
    chain_metadata: Optional[Dict[str, Any]] = None
    is_public: Optional[bool] = None


class ExecuteChainRequest(BaseModel):
    provider_id: str = Field(..., description="Provider for all generation steps")
    initial_asset_id: Optional[int] = Field(
        None, description="Input asset for the first step (optional for txt2img)"
    )
    default_operation: str = Field(
        "txt2img", description="Fallback operation if step doesn't specify one"
    )
    workspace_id: Optional[int] = None
    preferred_account_id: Optional[int] = None
    step_timeout: float = Field(600.0, description="Max seconds per step")
    execution_metadata: Optional[Dict[str, Any]] = None


class ChainResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    steps: List[Dict[str, Any]] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    chain_metadata: Dict[str, Any] = Field(default_factory=dict)
    is_public: bool = False
    created_by: Optional[str] = None
    execution_count: int = 0
    created_at: str
    updated_at: str


class ChainSummaryResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    step_count: int
    tags: List[str] = Field(default_factory=list)
    is_public: bool = False
    execution_count: int = 0
    created_at: str


class ExecutionResponse(BaseModel):
    id: UUID
    chain_id: UUID
    status: str
    current_step_index: int
    total_steps: int
    step_states: List[Dict[str, Any]] = Field(default_factory=list)
    error_message: Optional[str] = None
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class ExecuteChainResponse(BaseModel):
    execution_id: UUID
    status: str
    message: str


# ===== Helper: build services =====


def _build_chain_executor(db: AsyncSession) -> ChainExecutor:
    user_service = UserService(db)
    creation = GenerationCreationService(db, user_service)
    query = GenerationQueryService(db)
    step_exec = GenerationStepExecutor(db, creation, query)
    template_svc = BlockTemplateService(db)
    return ChainExecutor(db, step_exec, template_svc)


# ===== CRUD Endpoints =====


@router.post("", response_model=ChainResponse, status_code=201)
async def create_chain(
    request: CreateChainRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new generation chain."""
    # Validate step IDs are unique
    step_ids = [s.id for s in request.steps]
    if len(step_ids) != len(set(step_ids)):
        raise HTTPException(400, "Step IDs must be unique within a chain")

    # Validate input_from references
    for step in request.steps:
        if step.input_from and step.input_from not in step_ids:
            raise HTTPException(
                400, f"Step '{step.id}' references unknown input_from='{step.input_from}'"
            )

    chain = GenerationChain(
        name=request.name,
        description=request.description,
        steps=[s.model_dump(exclude_none=True) for s in request.steps],
        tags=request.tags,
        chain_metadata=request.chain_metadata,
        is_public=request.is_public,
        created_by=str(user.id),
    )
    db.add(chain)
    await db.commit()
    await db.refresh(chain)

    return _chain_to_response(chain)


@router.get("", response_model=List[ChainSummaryResponse])
async def list_chains(
    is_public: Optional[bool] = Query(None),
    tag: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List generation chains."""
    stmt = select(GenerationChain).order_by(GenerationChain.updated_at.desc())

    if is_public is not None:
        stmt = stmt.where(GenerationChain.is_public == is_public)

    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    chains = result.scalars().all()

    return [
        ChainSummaryResponse(
            id=c.id,
            name=c.name,
            description=c.description,
            step_count=len(c.steps or []),
            tags=c.tags or [],
            is_public=c.is_public,
            execution_count=c.execution_count or 0,
            created_at=c.created_at.isoformat() if c.created_at else "",
        )
        for c in chains
    ]


@router.get("/{chain_id}", response_model=ChainResponse)
async def get_chain(
    chain_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get a generation chain by ID."""
    chain = await db.get(GenerationChain, chain_id)
    if not chain:
        raise HTTPException(404, "Chain not found")
    return _chain_to_response(chain)


@router.patch("/{chain_id}", response_model=ChainResponse)
async def update_chain(
    chain_id: UUID,
    request: UpdateChainRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update a generation chain."""
    chain = await db.get(GenerationChain, chain_id)
    if not chain:
        raise HTTPException(404, "Chain not found")

    if request.name is not None:
        chain.name = request.name
    if request.description is not None:
        chain.description = request.description
    if request.steps is not None:
        # Validate step IDs
        step_ids = [s.id for s in request.steps]
        if len(step_ids) != len(set(step_ids)):
            raise HTTPException(400, "Step IDs must be unique within a chain")
        for step in request.steps:
            if step.input_from and step.input_from not in step_ids:
                raise HTTPException(
                    400,
                    f"Step '{step.id}' references unknown input_from='{step.input_from}'",
                )
        chain.steps = [s.model_dump(exclude_none=True) for s in request.steps]
    if request.tags is not None:
        chain.tags = request.tags
    if request.chain_metadata is not None:
        chain.chain_metadata = request.chain_metadata
    if request.is_public is not None:
        chain.is_public = request.is_public

    chain.updated_at = utcnow()
    await db.commit()
    await db.refresh(chain)

    return _chain_to_response(chain)


@router.delete("/{chain_id}", status_code=204)
async def delete_chain(
    chain_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a generation chain."""
    chain = await db.get(GenerationChain, chain_id)
    if not chain:
        raise HTTPException(404, "Chain not found")
    await db.delete(chain)
    await db.commit()


# ===== Execution Endpoints =====


@router.post("/{chain_id}/execute", response_model=ExecuteChainResponse)
async def execute_chain(
    chain_id: UUID,
    request: ExecuteChainRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Start executing a generation chain.

    The chain runs as a background task. Use the returned execution_id to
    poll progress via GET /generation-chains/executions/{execution_id}.
    """
    chain = await db.get(GenerationChain, chain_id)
    if not chain:
        raise HTTPException(404, "Chain not found")

    if not chain.steps:
        raise HTTPException(400, "Chain has no steps")

    # Create execution record upfront so we can return its ID
    execution = ChainExecution(
        chain_id=chain.id,
        steps_snapshot=list(chain.steps),
        step_states=[
            {"step_id": s.get("id", f"step_{i}"), "status": "pending"}
            for i, s in enumerate(chain.steps)
        ],
        status="pending",
        user_id=user.id,
        execution_metadata=request.execution_metadata or {},
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)

    # Schedule background execution
    background_tasks.add_task(
        _run_chain_background,
        chain_id=chain.id,
        execution_id=execution.id,
        user_id=user.id,
        request=request,
    )

    return ExecuteChainResponse(
        execution_id=execution.id,
        status="pending",
        message=f"Chain execution started with {len(chain.steps)} steps",
    )


@router.get("/executions/{execution_id}", response_model=ExecutionResponse)
async def get_execution(
    execution_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get chain execution progress and per-step state."""
    execution = await db.get(ChainExecution, execution_id)
    if not execution:
        raise HTTPException(404, "Execution not found")
    return _execution_to_response(execution)


@router.get("/{chain_id}/executions", response_model=List[ExecutionResponse])
async def list_chain_executions(
    chain_id: UUID,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List executions for a chain."""
    stmt = (
        select(ChainExecution)
        .where(ChainExecution.chain_id == chain_id)
        .order_by(ChainExecution.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    executions = result.scalars().all()
    return [_execution_to_response(e) for e in executions]


# ===== Background execution =====


async def _run_chain_background(
    chain_id: UUID,
    execution_id: UUID,
    user_id: int,
    request: ExecuteChainRequest,
) -> None:
    """
    Run chain execution in background.

    Creates its own DB session since background tasks outlive the request.
    Delegates to ChainExecutor.execute() which owns the full orchestration
    loop (template rolling, guidance compilation, step submission, asset piping).
    """
    from pixsim7.backend.main.database import async_session_factory

    async with async_session_factory() as db:
        # Load chain and pre-created execution
        chain = await db.get(GenerationChain, chain_id)
        execution = await db.get(ChainExecution, execution_id)
        if not chain or not execution:
            return

        # Load user
        user_svc = UserService(db)
        user = await user_svc.get_user(user_id)
        if not user:
            execution.status = "failed"
            execution.error_message = "User not found"
            await db.commit()
            return

        # Delegate to ChainExecutor with the pre-created execution
        # so the caller's execution_id remains valid for progress polling.
        executor = _build_chain_executor(db)
        await executor.execute(
            chain,
            user,
            provider_id=request.provider_id,
            initial_asset_id=request.initial_asset_id,
            default_operation=request.default_operation,
            workspace_id=request.workspace_id,
            preferred_account_id=request.preferred_account_id,
            step_timeout=request.step_timeout,
            execution_metadata=request.execution_metadata,
            existing_execution=execution,
        )


# ===== Response helpers =====


def _chain_to_response(chain: GenerationChain) -> ChainResponse:
    return ChainResponse(
        id=chain.id,
        name=chain.name,
        description=chain.description,
        steps=chain.steps or [],
        tags=chain.tags or [],
        chain_metadata=chain.chain_metadata or {},
        is_public=chain.is_public,
        created_by=chain.created_by,
        execution_count=chain.execution_count or 0,
        created_at=chain.created_at.isoformat() if chain.created_at else "",
        updated_at=chain.updated_at.isoformat() if chain.updated_at else "",
    )


def _execution_to_response(execution: ChainExecution) -> ExecutionResponse:
    return ExecutionResponse(
        id=execution.id,
        chain_id=execution.chain_id,
        status=execution.status,
        current_step_index=execution.current_step_index,
        total_steps=len(execution.steps_snapshot or []),
        step_states=execution.step_states or [],
        error_message=execution.error_message,
        created_at=execution.created_at.isoformat() if execution.created_at else "",
        started_at=execution.started_at.isoformat() if execution.started_at else None,
        completed_at=execution.completed_at.isoformat() if execution.completed_at else None,
    )
