"""Manual test runner for JobSubmissionPipeline Phase 1.

Runs three scenarios:
 1. Success path (pending job with account)
 2. No-account path (pending job without account)
 3. Skip non-pending job (completed status)

Exits non-zero if any assertion fails.
"""
import asyncio
import sys
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

sys.path.append('g:/code/pixsim7')

from pixsim7_backend.domain import Job, JobStatus, OperationType, ProviderAccount, AccountStatus, GenerationArtifact
from pixsim7_backend.services.submission.pipeline import JobSubmissionPipeline
from pixsim7_backend.services.provider.base import Provider, GenerationResult
from pixsim7_backend.services.provider.registry import registry


class StubProvider(Provider):
    @property
    def provider_id(self) -> str:
        return "stub"

    @property
    def supported_operations(self):
        return [OperationType.TEXT_TO_VIDEO]

    def map_parameters(self, operation_type, params):
        return {"prompt": params.get("prompt", ""), "duration": params.get("duration", 5)}

    async def execute(self, operation_type, account, params):
        return GenerationResult(provider_job_id="stub-job-1")

    async def check_status(self, account, provider_job_id):
        raise NotImplementedError


async def setup_db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return async_session


async def create_account(session: AsyncSession) -> ProviderAccount:
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


async def create_job(session: AsyncSession, status=JobStatus.PENDING) -> Job:
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


async def run_tests():
    registry.clear()
    registry.register(StubProvider())
    async_session = await setup_db()

    # Success path
    async with async_session() as session:
        await create_account(session)
        job = await create_job(session)
        pipeline = JobSubmissionPipeline(session)
        result = await pipeline.run(job)
        assert result.status == "submitted", f"Expected submitted, got {result.status}" 
        artifacts = await session.exec(GenerationArtifact.select().where(GenerationArtifact.job_id == job.id))
        artifact_list = artifacts.all()
        assert len(artifact_list) == 1, "Artifact not created"
        print("✅ Success path passed")

    # No account path
    async with async_session() as session:
        job = await create_job(session)
        pipeline = JobSubmissionPipeline(session)
        result = await pipeline.run(job)
        assert result.status == "no_account", f"Expected no_account, got {result.status}"
        print("✅ No account path passed")

    # Skip non-pending
    async with async_session() as session:
        await create_account(session)
        job = await create_job(session, status=JobStatus.COMPLETED)
        pipeline = JobSubmissionPipeline(session)
        result = await pipeline.run(job)
        assert result.status == "skipped", f"Expected skipped, got {result.status}" 
        print("✅ Skip non-pending path passed")

    print("All pipeline tests passed.")


if __name__ == "__main__":
    asyncio.run(run_tests())