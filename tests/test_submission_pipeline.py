"""Tests for JobSubmissionPipeline (Phase 1)

Covers:
- Success path (pending job -> submitted)
- Skip non-pending job
- No account available path

Uses in-memory SQLite and a stub provider registered in registry.
"""
import asyncio
import pytest
from sqlmodel import SQLModel, create_engine
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from pixsim7.backend.main.domain import Job, JobStatus, OperationType, ProviderAccount, AccountStatus
from pixsim7.backend.main.services.submission.pipeline import JobSubmissionPipeline
from pixsim7.backend.main.services.provider.base import Provider, GenerationResult
from pixsim7.backend.main.services.provider.registry import registry
from pixsim7.backend.main.domain import GenerationArtifact

# ===== Stub Provider =====
class StubProvider(Provider):
    @property
    def provider_id(self) -> str:
        return "stub"

    @property
    def supported_operations(self):
        return [OperationType.TEXT_TO_VIDEO]

    def map_parameters(self, operation_type, params):  # pragma: no cover - trivial
        return {"prompt": params.get("prompt", ""), "duration": params.get("duration", 5)}

    async def execute(self, operation_type, account, params):
        return GenerationResult(provider_job_id="stub-job-1", status=account.status == AccountStatus.ACTIVE and JobStatus.PENDING)  # type: ignore

    async def check_status(self, account, provider_job_id):  # pragma: no cover
        raise NotImplementedError


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()

@pytest.fixture
async def db_session():
    # Async in-memory engine
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session

@pytest.fixture(autouse=True)
def clear_registry():
    registry.clear()
    registry.register(StubProvider())
    yield
    registry.clear()

async def _create_account(session: AsyncSession) -> ProviderAccount:
    acct = ProviderAccount(
        user_id=1,
        email="user@example.com",
        provider_id="stub",
        status=AccountStatus.ACTIVE,
        is_private=False,
    )
    session.add(acct)
    await session.commit()
    await session.refresh(acct)
    return acct

async def _create_job(session: AsyncSession, status=JobStatus.PENDING) -> Job:
    job = Job(
        user_id=1,
        operation_type=OperationType.TEXT_TO_VIDEO,
        provider_id="stub",
        params={"prompt": "test"},
        status=status,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job

@pytest.mark.asyncio
async def test_pipeline_success(db_session: AsyncSession):
    await _create_account(db_session)
    job = await _create_job(db_session)
    pipeline = JobSubmissionPipeline(db_session)
    result = await pipeline.run(job)
    assert result.status == "submitted"
    assert result.provider_job_id == "stub-job-1"
    # Artifact created
    artifacts = await db_session.exec(GenerationArtifact.select().where(GenerationArtifact.job_id == job.id))
    artifact_list = artifacts.all()
    assert len(artifact_list) == 1
    assert artifact_list[0].canonical_params["prompt"] == "test"

@pytest.mark.asyncio
async def test_pipeline_skip_non_pending(db_session: AsyncSession):
    await _create_account(db_session)
    job = await _create_job(db_session, status=JobStatus.COMPLETED)
    pipeline = JobSubmissionPipeline(db_session)
    result = await pipeline.run(job)
    assert result.status == "skipped"

@pytest.mark.asyncio
async def test_pipeline_no_account(db_session: AsyncSession):
    job = await _create_job(db_session)
    pipeline = JobSubmissionPipeline(db_session)
    result = await pipeline.run(job)
    assert result.status == "no_account"
    assert result.error is not None
