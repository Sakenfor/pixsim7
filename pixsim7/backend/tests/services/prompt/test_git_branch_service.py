from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from pixsim7.backend.main.domain.prompt import PromptFamily, PromptVersion
from pixsim7.backend.main.services.prompt.git.branch import GitBranchService


class _FakeScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _FakeScalars(self._rows)


class _FakeDb:
    def __init__(self, rows):
        self.rows = rows
        self.last_query = None

    async def execute(self, query):
        self.last_query = query
        return _FakeResult(self.rows)


@pytest.mark.asyncio
async def test_list_branches_excludes_archived_and_normalizes_main_branch():
    family = PromptFamily(slug="branch-family", title="Branch Family", prompt_type="visual")
    family.id = uuid4()
    t0 = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)

    def _version(
        *,
        version_number: int,
        prompt_text: str,
        branch_name: str | None,
        created_at: datetime,
        tags: list[str] | None = None,
        author: str = "tester",
    ) -> PromptVersion:
        return PromptVersion(
            id=uuid4(),
            family_id=family.id,
            prompt_hash=PromptVersion.compute_hash(prompt_text),
            prompt_text=prompt_text,
            version_number=version_number,
            branch_name=branch_name,
            author=author,
            created_at=created_at,
            tags=tags or [],
        )

    # Simulate DB rows already ordered by created_at DESC.
    rows = [
        _version(
            version_number=5,
            prompt_text="exp-v2-archived",
            branch_name="exp",
            created_at=t0 + timedelta(minutes=4),
            tags=["archived"],
        ),
        _version(
            version_number=4,
            prompt_text="exp-v1",
            branch_name="exp",
            created_at=t0 + timedelta(minutes=3),
            author="exp-author",
        ),
        _version(
            version_number=3,
            prompt_text="main-v3-explicit",
            branch_name="main",
            created_at=t0 + timedelta(minutes=2),
            author="explicit-main-author",
        ),
        _version(
            version_number=2,
            prompt_text="main-v2-archived",
            branch_name=None,
            created_at=t0 + timedelta(minutes=1),
            tags=["archived"],
        ),
        _version(
            version_number=1,
            prompt_text="main-v1",
            branch_name=None,
            created_at=t0,
            author="main-author",
        ),
    ]

    fake_db = _FakeDb(rows)
    service = GitBranchService(fake_db)  # type: ignore[arg-type]
    branches = await service.list_branches(family.id)

    assert [branch["name"] for branch in branches] == ["main", "exp"]

    main_branch = branches[0]
    assert main_branch["is_main"] is True
    assert main_branch["commit_count"] == 2
    assert main_branch["latest_version_number"] == 3
    assert main_branch["author"] == "explicit-main-author"

    exp_branch = branches[1]
    assert exp_branch["is_main"] is False
    assert exp_branch["commit_count"] == 1
    assert exp_branch["latest_version_number"] == 4
    assert exp_branch["author"] == "exp-author"
