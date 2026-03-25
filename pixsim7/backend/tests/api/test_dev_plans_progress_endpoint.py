"""API tests for /dev/plans/progress/{plan_id} checkpoint progress updates."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from pixsim7.backend.main.api.dependencies import (
        get_current_principal,
        get_database,
    )
    from pixsim7.backend.main.api.v1.dev_plans import router
    from pixsim7.backend.main.shared.actor import RequestPrincipal

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _app(*, authenticated: bool = True, principal=None) -> "FastAPI":
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _db():
        yield SimpleNamespace()

    app.dependency_overrides[get_database] = _db

    if not authenticated:
        async def _deny():
            raise HTTPException(status_code=401, detail="Not authenticated")

        app.dependency_overrides[get_current_principal] = _deny
    else:
        principal_obj = principal or RequestPrincipal(
            id=123, role="user", username="user123",
        )
        app.dependency_overrides[get_current_principal] = lambda: principal_obj

    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestDevPlansProgressEndpoint:
    @pytest.mark.asyncio
    async def test_progress_updates_checkpoint_points_and_metadata(self):
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[
                    {
                        "id": "phase_1",
                        "label": "Phase 1",
                        "status": "pending",
                        "points_total": 5,
                        "points_done": 1,
                        "evidence": ["existing-proof"],
                    }
                ]
            )
        )
        update_result = SimpleNamespace(
            plan_id="plan-a",
            changes=[{"field": "checkpoints"}],
            commit_sha="abc123",
            new_scope=None,
        )

        payload = {
            "checkpoint_id": "phase_1",
            "points_delta": 2,
            "append_evidence": ["new-proof"],
            "note": "Added tests",
            "sync_plan_stage": True,
        }

        with (
            patch(
                "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                new=AsyncMock(return_value=bundle),
            ),
            patch(
                "pixsim7.backend.main.api.v1.dev_plans.update_plan",
                new=AsyncMock(return_value=update_result),
            ) as mock_update,
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 200
        body = response.json()
        assert body["planId"] == "plan-a"
        assert body["checkpointId"] == "phase_1"

        args, kwargs = mock_update.await_args
        updates = args[2]
        checkpoint = updates["checkpoints"][0]
        assert checkpoint["points_done"] == 3
        assert checkpoint["points_total"] == 5
        assert checkpoint["status"] == "active"
        evidence = checkpoint["evidence"]
        if evidence and isinstance(evidence[0], dict):
            refs = [item.get("ref") for item in evidence if isinstance(item, dict)]
            assert refs == ["existing-proof", "new-proof"]
        else:
            assert evidence == ["existing-proof", "new-proof"]
        assert checkpoint["last_update"]["by"] == "user123"
        assert updates["stage"] == "phase_1"
        principal = kwargs["principal"]
        assert principal.source == "user:123"
        assert principal.id == 123

    @pytest.mark.asyncio
    async def test_progress_emits_plan_updated_notification(self):
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[
                    {
                        "id": "phase_1",
                        "label": "Phase 1",
                        "status": "pending",
                        "points_total": 3,
                        "points_done": 0,
                    }
                ]
            ),
            doc=SimpleNamespace(title="Plan A"),
        )
        update_result = SimpleNamespace(
            plan_id="plan-a",
            changes=[{"field": "checkpoints"}],
            commit_sha=None,
            new_scope=None,
        )

        with (
            patch(
                "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                new=AsyncMock(return_value=bundle),
            ),
            patch(
                "pixsim7.backend.main.api.v1.dev_plans.update_plan",
                new=AsyncMock(return_value=update_result),
            ),
            patch(
                "pixsim7.backend.main.api.v1.dev_plans._emit_plan_progress_notification",
                new=AsyncMock(),
            ) as mock_emit,
        ):
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/dev/plans/progress/plan-a",
                    json={"checkpoint_id": "phase_1", "points_delta": 1},
                )

        assert response.status_code == 200
        kwargs = mock_emit.await_args.kwargs
        assert kwargs["plan_id"] == "plan-a"
        assert kwargs["plan_title"] == "Plan A"
        assert kwargs["checkpoint_id"] == "phase_1"
        assert kwargs["old_summary"] == "phase_1 [pending] 0/3"
        assert kwargs["new_summary"] == "phase_1 [active] 1/3"
        assert kwargs["principal"].source == "user:123"

    @pytest.mark.asyncio
    async def test_progress_requires_action_fields(self):
        app = _app(authenticated=True)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/dev/plans/progress/plan-a",
                json={"checkpoint_id": "phase_1"},
            )

        assert response.status_code == 400
        assert "No progress fields to update" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_progress_returns_404_when_checkpoint_missing(self):
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[{"id": "phase_x", "label": "Phase X", "status": "pending"}]
            )
        )

        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
            new=AsyncMock(return_value=bundle),
        ):
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/dev/plans/progress/plan-a",
                    json={"checkpoint_id": "phase_1", "points_delta": 1},
                )

        assert response.status_code == 404
        assert "Checkpoint not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_progress_commit_sha_added_as_evidence(self):
        """commit_sha field is auto-converted to git_commit evidence."""
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[
                    {"id": "cp1", "label": "CP 1", "status": "active", "points_done": 1, "points_total": 5}
                ]
            )
        )
        update_result = SimpleNamespace(
            plan_id="plan-a", changes=[], commit_sha=None, new_scope=None,
        )

        payload = {
            "checkpoint_id": "cp1",
            "commit_sha": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
            "note": "wired up endpoint",
        }

        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=AsyncMock(return_value=update_result)) as mock_update,
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 200
        args, kwargs = mock_update.await_args
        checkpoint = args[2]["checkpoints"][0]
        evidence = checkpoint["evidence"]
        assert any(
            e["kind"] == "git_commit" and e["ref"] == "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
            for e in evidence
        )
        # evidence_commit_sha passed through for audit events
        assert kwargs["evidence_commit_sha"] == "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

    @pytest.mark.asyncio
    async def test_progress_append_commits_added_as_evidence(self):
        """append_commits list is auto-converted to multiple git_commit evidence items."""
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[
                    {"id": "cp1", "label": "CP 1", "status": "active", "points_done": 0, "points_total": 3}
                ]
            )
        )
        update_result = SimpleNamespace(
            plan_id="plan-a", changes=[], commit_sha=None, new_scope=None,
        )

        payload = {
            "checkpoint_id": "cp1",
            "append_commits": ["abcdef1234567", "1234567890abcdef1234567890abcdef12345678"],
            "note": "two commits",
        }

        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=AsyncMock(return_value=update_result)) as mock_update,
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 200
        checkpoint = mock_update.await_args.args[2]["checkpoints"][0]
        git_evidence = [e for e in checkpoint["evidence"] if e["kind"] == "git_commit"]
        assert len(git_evidence) == 2
        assert git_evidence[0]["ref"] == "abcdef1234567"
        assert git_evidence[1]["ref"] == "1234567890abcdef1234567890abcdef12345678"

    @pytest.mark.asyncio
    async def test_progress_commit_sha_and_append_evidence_merged(self):
        """commit_sha and append_evidence merge together without duplicates."""
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[
                    {
                        "id": "cp1", "label": "CP 1", "status": "active",
                        "evidence": [{"kind": "git_commit", "ref": "aaaaaaa"}],
                    }
                ]
            )
        )
        update_result = SimpleNamespace(
            plan_id="plan-a", changes=[], commit_sha=None, new_scope=None,
        )

        payload = {
            "checkpoint_id": "cp1",
            "commit_sha": "bbbbbbb",
            "append_evidence": [{"kind": "file_path", "ref": "src/foo.py"}],
            "note": "mixed evidence",
        }

        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=AsyncMock(return_value=update_result)) as mock_update,
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 200
        checkpoint = mock_update.await_args.args[2]["checkpoints"][0]
        evidence = checkpoint["evidence"]
        refs = [(e["kind"], e["ref"]) for e in evidence]
        assert ("git_commit", "aaaaaaa") in refs  # existing preserved
        assert ("file_path", "src/foo.py") in refs
        assert ("git_commit", "bbbbbbb") in refs

    @pytest.mark.asyncio
    async def test_progress_invalid_commit_sha_returns_400(self):
        """Invalid commit SHA format is rejected."""
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[
                    {"id": "cp1", "label": "CP 1", "status": "active"}
                ]
            )
        )

        payload = {
            "checkpoint_id": "cp1",
            "commit_sha": "not-a-sha!",
            "note": "bad sha",
        }

        with patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 400
        assert "Invalid commit SHA" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_progress_invalid_append_commits_returns_400(self):
        """Invalid SHA in append_commits list is rejected."""
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[
                    {"id": "cp1", "label": "CP 1", "status": "active"}
                ]
            )
        )

        payload = {
            "checkpoint_id": "cp1",
            "append_commits": ["abcdef1", "xyz"],
            "note": "one bad sha",
        }

        with patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 400
        assert "Invalid commit SHA" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_progress_short_sha_accepted(self):
        """Short SHA (7 chars) is accepted."""
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[
                    {"id": "cp1", "label": "CP 1", "status": "active"}
                ]
            )
        )
        update_result = SimpleNamespace(
            plan_id="plan-a", changes=[], commit_sha=None, new_scope=None,
        )

        payload = {
            "checkpoint_id": "cp1",
            "commit_sha": "abcdef1",
            "note": "short sha ok",
        }

        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=AsyncMock(return_value=update_result)) as mock_update,
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 200
        checkpoint = mock_update.await_args.args[2]["checkpoints"][0]
        git_refs = [e for e in checkpoint["evidence"] if e["kind"] == "git_commit"]
        assert len(git_refs) == 1
        assert git_refs[0]["ref"] == "abcdef1"

    @pytest.mark.asyncio
    async def test_progress_sha_too_short_rejected(self):
        """SHA shorter than 7 chars is rejected."""
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[
                    {"id": "cp1", "label": "CP 1", "status": "active"}
                ]
            )
        )

        payload = {
            "checkpoint_id": "cp1",
            "commit_sha": "abc12",
            "note": "too short",
        }

        with patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_progress_without_commits_backward_compatible(self):
        """Existing payloads without commit fields still work unchanged."""
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[
                    {"id": "cp1", "label": "CP 1", "status": "pending", "points_done": 0, "points_total": 3}
                ]
            )
        )
        update_result = SimpleNamespace(
            plan_id="plan-a", changes=[], commit_sha=None, new_scope=None,
        )

        payload = {
            "checkpoint_id": "cp1",
            "points_delta": 1,
            "note": "no commits",
        }

        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=AsyncMock(return_value=update_result)) as mock_update,
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 200
        checkpoint = mock_update.await_args.args[2]["checkpoints"][0]
        # No evidence key added when no evidence provided
        assert "evidence" not in checkpoint
        # evidence_commit_sha should be None
        assert mock_update.await_args.kwargs.get("evidence_commit_sha") is None

    @pytest.mark.asyncio
    async def test_progress_commit_sha_deduplicates(self):
        """Duplicate commit SHA is deduplicated in evidence."""
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[
                    {
                        "id": "cp1", "label": "CP 1", "status": "active",
                        "evidence": [{"kind": "git_commit", "ref": "abcdef1"}],
                    }
                ]
            )
        )
        update_result = SimpleNamespace(
            plan_id="plan-a", changes=[], commit_sha=None, new_scope=None,
        )

        payload = {
            "checkpoint_id": "cp1",
            "commit_sha": "ABCDEF1",  # same SHA, different case
            "note": "dup",
        }

        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=AsyncMock(return_value=update_result)) as mock_update,
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 200
        checkpoint = mock_update.await_args.args[2]["checkpoints"][0]
        git_refs = [e for e in checkpoint["evidence"] if e["kind"] == "git_commit"]
        assert len(git_refs) == 1  # deduplicated

    @pytest.mark.asyncio
    async def test_progress_auto_head_resolves_and_adds_evidence(self):
        """auto_head=True resolves HEAD and adds it as git_commit evidence."""
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[{"id": "cp1", "label": "CP 1", "status": "active"}]
            )
        )
        update_result = SimpleNamespace(
            plan_id="plan-a", changes=[], commit_sha=None, new_scope=None,
        )

        payload = {
            "checkpoint_id": "cp1",
            "auto_head": True,
            "note": "auto head",
        }

        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=AsyncMock(return_value=update_result)) as mock_update,
            patch("pixsim7.backend.main.api.v1.dev_plans.git_resolve_head", return_value="aabbccdd11223344556677889900aabbccddeeff"),
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 200
        checkpoint = mock_update.await_args.args[2]["checkpoints"][0]
        git_refs = [e for e in checkpoint["evidence"] if e["kind"] == "git_commit"]
        assert len(git_refs) == 1
        assert git_refs[0]["ref"] == "aabbccdd11223344556677889900aabbccddeeff"

    @pytest.mark.asyncio
    async def test_progress_auto_head_noop_when_git_unavailable(self):
        """auto_head=True with no git doesn't fail — just no commit evidence."""
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[{"id": "cp1", "label": "CP 1", "status": "active"}]
            )
        )
        update_result = SimpleNamespace(
            plan_id="plan-a", changes=[], commit_sha=None, new_scope=None,
        )

        payload = {
            "checkpoint_id": "cp1",
            "auto_head": True,
            "note": "no git",
        }

        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=AsyncMock(return_value=update_result)) as mock_update,
            patch("pixsim7.backend.main.api.v1.dev_plans.git_resolve_head", return_value=None),
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 200
        checkpoint = mock_update.await_args.args[2]["checkpoints"][0]
        assert "evidence" not in checkpoint

    @pytest.mark.asyncio
    async def test_progress_commit_range_expands_to_evidence(self):
        """commit_range='sha1..sha2' expands to individual commit evidence items."""
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[{"id": "cp1", "label": "CP 1", "status": "active"}]
            )
        )
        update_result = SimpleNamespace(
            plan_id="plan-a", changes=[], commit_sha=None, new_scope=None,
        )
        expanded = ["aaaaaaa1111111aaaaaaa1111111aaaaaaa1111111", "bbbbbbb2222222bbbbbbb2222222bbbbbbb2222222"]

        payload = {
            "checkpoint_id": "cp1",
            "commit_range": "aaaaaaa..bbbbbbb",
            "note": "range",
        }

        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=AsyncMock(return_value=update_result)) as mock_update,
            patch("pixsim7.backend.main.api.v1.dev_plans.git_rev_list", return_value=expanded),
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 200
        checkpoint = mock_update.await_args.args[2]["checkpoints"][0]
        git_refs = [e for e in checkpoint["evidence"] if e["kind"] == "git_commit"]
        assert len(git_refs) == 2

    @pytest.mark.asyncio
    async def test_progress_commit_range_invalid_format_returns_400(self):
        """Invalid commit range format is rejected."""
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[{"id": "cp1", "label": "CP 1", "status": "active"}]
            )
        )

        payload = {
            "checkpoint_id": "cp1",
            "commit_range": "not..valid!!",
            "note": "bad range",
        }

        with patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 400
        assert "Invalid commit range format" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_progress_commit_range_empty_expansion_returns_400(self):
        """commit_range that expands to nothing returns 400."""
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[{"id": "cp1", "label": "CP 1", "status": "active"}]
            )
        )

        payload = {
            "checkpoint_id": "cp1",
            "commit_range": "aaaaaaa..bbbbbbb",
            "note": "empty",
        }

        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.git_rev_list", return_value=[]),
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 400
        assert "Could not expand commit range" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_progress_verify_commits_rejects_missing_sha(self):
        """verify_commits=True with a non-existent SHA returns 400."""
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[{"id": "cp1", "label": "CP 1", "status": "active"}]
            )
        )

        payload = {
            "checkpoint_id": "cp1",
            "commit_sha": "abcdef1234567",
            "verify_commits": True,
            "note": "verify fails",
        }

        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.git_verify_commit", return_value=False),
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 400
        assert "Commit not found in repository" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_progress_verify_commits_passes_when_valid(self):
        """verify_commits=True with an existing SHA succeeds."""
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[{"id": "cp1", "label": "CP 1", "status": "active"}]
            )
        )
        update_result = SimpleNamespace(
            plan_id="plan-a", changes=[], commit_sha=None, new_scope=None,
        )

        payload = {
            "checkpoint_id": "cp1",
            "commit_sha": "abcdef1234567",
            "verify_commits": True,
            "note": "verify ok",
        }

        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=AsyncMock(return_value=update_result)),
            patch("pixsim7.backend.main.api.v1.dev_plans.git_verify_commit", return_value=True),
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_progress_agent_test_suite_evidence_requires_registry_entry(self):
        app = _app(
            authenticated=True,
            principal=RequestPrincipal(
                id=0,
                role="agent",
                principal_type="agent",
                agent_id="profile-test-agent",
                username="agent:profile-test-agent",
                on_behalf_of=1,
            ),
        )
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[{"id": "cp1", "label": "CP 1", "status": "pending"}]
            )
        )
        suites_result = SimpleNamespace(
            scalars=lambda: SimpleNamespace(all=lambda: []),
        )
        mock_db = SimpleNamespace(execute=AsyncMock(return_value=suites_result))
        app.dependency_overrides[get_database] = lambda: mock_db

        payload = {
            "checkpoint_id": "cp1",
            "append_evidence": [{"kind": "test_suite", "ref": "missing-suite"}],
            "note": "link tests",
        }

        with patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 400
        detail = response.json()["detail"]
        assert detail["message"] == "Plan authoring policy violation"
        assert detail["contract"] == "/api/v1/dev/plans/meta/authoring-contract"
        assert "missing-suite" in detail["errors"][0]

    @pytest.mark.asyncio
    async def test_progress_agent_test_suite_evidence_accepts_registered_suite(self):
        app = _app(
            authenticated=True,
            principal=RequestPrincipal(
                id=0,
                role="agent",
                principal_type="agent",
                agent_id="profile-test-agent",
                username="agent:profile-test-agent",
                on_behalf_of=1,
            ),
        )
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[{"id": "cp1", "label": "CP 1", "status": "pending"}]
            )
        )
        update_result = SimpleNamespace(
            plan_id="plan-a",
            changes=[{"field": "checkpoints"}],
            commit_sha=None,
            new_scope=None,
        )
        suites_result = SimpleNamespace(
            scalars=lambda: SimpleNamespace(all=lambda: ["suite-registered"]),
        )
        mock_db = SimpleNamespace(execute=AsyncMock(return_value=suites_result))
        app.dependency_overrides[get_database] = lambda: mock_db

        payload = {
            "checkpoint_id": "cp1",
            "append_evidence": [{"kind": "test_suite", "ref": "suite-registered"}],
            "note": "link tests",
        }

        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle", new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=AsyncMock(return_value=update_result)) as mock_update,
            patch("pixsim7.backend.main.api.v1.dev_plans._record_plan_participant_from_principal", new=AsyncMock()),
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 200
        args, _kwargs = mock_update.await_args
        checkpoint = args[2]["checkpoints"][0]
        assert {"kind": "test_suite", "ref": "suite-registered"} in checkpoint["evidence"]

    @pytest.mark.asyncio
    async def test_progress_requires_authentication(self):
        app = _app(authenticated=False)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/dev/plans/progress/plan-a",
                json={"checkpoint_id": "phase_1", "points_delta": 1},
            )

        assert response.status_code == 401
