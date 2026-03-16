"""Prompt analysis contract metadata endpoint tests."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from pixsim7.backend.main.api.v1.prompts.meta import (
    PROMPT_ANALYSIS_CONTRACT_VERSION,
    PROMPT_AUTHORING_CONTRACT_VERSION,
    get_prompt_analysis_contract,
    get_prompt_authoring_contract,
)


def _user_with_defaults(default_ids: list[str] | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=7,
        username="alice",
        preferences={"analyzer": {"prompt_default_ids": default_ids or []}},
    )


@pytest.mark.asyncio
async def test_prompt_analysis_contract_exposes_endpoint_schema_and_analyzers() -> None:
    result = await get_prompt_analysis_contract(current_user=_user_with_defaults(["prompt:openai"]))

    assert result.version == PROMPT_ANALYSIS_CONTRACT_VERSION
    assert result.endpoint == "/api/v1/prompts/analyze"
    assert "properties" in result.request_schema
    assert "text" in result.request_schema["properties"]
    assert "properties" in result.response_schema
    assert "analysis" in result.response_schema["properties"]
    assert "role_in_sequence" in result.response_schema["properties"]
    assert "sequence_context" in result.response_schema["properties"]
    sequence_ctx_schema = result.response_schema["properties"]["sequence_context"]
    if "$ref" in sequence_ctx_schema:
        ref = sequence_ctx_schema["$ref"]
        assert ref.startswith("#/$defs/")
        sequence_ctx_schema = result.response_schema["$defs"][ref.split("/")[-1]]
    assert "properties" in sequence_ctx_schema
    assert "role_in_sequence" in sequence_ctx_schema["properties"]
    assert "source" in sequence_ctx_schema["properties"]
    assert any(analyzer.id == "prompt:simple" for analyzer in result.prompt_analyzers)


@pytest.mark.asyncio
async def test_prompt_analysis_contract_includes_deprecation_and_user_default_note() -> None:
    result = await get_prompt_analysis_contract(current_user=_user_with_defaults(["prompt:local"]))

    assert any(
        item.get("field") == "provider_hints.prompt_analysis" for item in result.deprecations
    )
    user_default_step = next(
        step for step in result.analyzer_resolution_order
        if step.key == "user.preferences.analyzer.prompt_default_ids"
    )
    assert "prompt:local" in user_default_step.description


@pytest.mark.asyncio
async def test_prompt_contract_deprecation_behavior_is_consistent() -> None:
    analysis = await get_prompt_analysis_contract(current_user=_user_with_defaults())
    authoring = await get_prompt_authoring_contract(current_user=_user_with_defaults())

    analysis_dep = next(
        item for item in analysis.deprecations if item.get("field") == "provider_hints.prompt_analysis"
    )
    authoring_dep = next(
        item for item in authoring.deprecations if item.get("field") == "provider_hints.prompt_analysis"
    )

    assert analysis_dep.get("behavior") == "Rejected by create-version API (HTTP 422)."
    assert authoring_dep.get("behavior") == "Rejected by create-version API (HTTP 422)."


@pytest.mark.asyncio
async def test_prompt_authoring_contract_exposes_family_version_and_analyze_schemas() -> None:
    result = await get_prompt_authoring_contract(current_user=_user_with_defaults())

    assert result.version == PROMPT_AUTHORING_CONTRACT_VERSION
    assert "properties" in result.create_family_request_schema
    assert "title" in result.create_family_request_schema["properties"]
    assert "properties" in result.create_version_request_schema
    assert "prompt_text" in result.create_version_request_schema["properties"]
    assert "properties" in result.apply_edit_request_schema
    assert "edit_ops" in result.apply_edit_request_schema["properties"]
    assert "properties" in result.analyze_request_schema
    assert "text" in result.analyze_request_schema["properties"]
    assert any(endpoint.id == "prompts.create_version" for endpoint in result.endpoints)
    assert any(endpoint.id == "prompts.apply_edit" for endpoint in result.endpoints)


@pytest.mark.asyncio
async def test_prompt_authoring_contract_has_modes_roles_and_deprecation() -> None:
    result = await get_prompt_authoring_contract(current_user=_user_with_defaults())

    assert any(mode.id == "scene_setup" for mode in result.authoring_modes)
    assert any(mode.id == "scene_continuation" for mode in result.authoring_modes)
    assert any(role.id == "initial" for role in result.sequence_roles)
    assert any(role.id == "continuation" for role in result.sequence_roles)
    assert any(
        item.get("field") == "provider_hints.prompt_analysis" for item in result.deprecations
    )
    assert any(item.get("field") == "prompt_text" for item in result.field_ownership)
    assert any(
        item.get("field") == "prompt_analysis.authoring.history[].edit_ops"
        for item in result.field_ownership
    )


@pytest.mark.asyncio
async def test_prompt_authoring_contract_exposes_workflows() -> None:
    result = await get_prompt_authoring_contract(current_user=_user_with_defaults())

    workflow_ids = {wf.id for wf in result.workflows}
    assert {"quick_draft", "analyzed_authoring", "continuation", "iterative_edit"} <= workflow_ids

    # quick_draft should produce family_id then version_id
    quick = next(wf for wf in result.workflows if wf.id == "quick_draft")
    assert len(quick.steps) == 2
    assert quick.steps[0].outputs == ["family_id"]
    assert "family_id" in quick.steps[1].consumes

    # analyzed_authoring has an analyze step that outputs prompt_analysis
    analyzed = next(wf for wf in result.workflows if wf.id == "analyzed_authoring")
    analyze_step = next(s for s in analyzed.steps if s.endpoint_id == "prompts.analyze")
    assert "prompt_analysis" in analyze_step.outputs

    # iterative_edit has a precondition
    edit_wf = next(wf for wf in result.workflows if wf.id == "iterative_edit")
    assert edit_wf.steps[0].precondition is not None

    # all built-in workflows have audience ["agent", "user"]
    for wf in result.workflows:
        assert "agent" in wf.audience
        assert "user" in wf.audience


@pytest.mark.asyncio
async def test_prompt_authoring_contract_filters_workflows_by_audience() -> None:
    from pixsim7.backend.main.services.prompt.authoring_workflow_registry import (
        authoring_workflow_registry,
        AuthoringWorkflow,
        WorkflowStep,
    )

    # Register an agent-only workflow
    agent_only = AuthoringWorkflow(
        id="_test_agent_only",
        label="Test Agent Only",
        description="For testing audience filter.",
        audience=["agent"],
        steps=[WorkflowStep(step=1, endpoint_id="prompts.create_family", outputs=["family_id"])],
    )
    authoring_workflow_registry.register(agent_only.id, agent_only)

    try:
        # No filter — includes it
        result_all = await get_prompt_authoring_contract(current_user=_user_with_defaults())
        assert any(wf.id == "_test_agent_only" for wf in result_all.workflows)

        # agent filter — includes it
        result_agent = await get_prompt_authoring_contract(
            current_user=_user_with_defaults(), audience="agent"
        )
        assert any(wf.id == "_test_agent_only" for wf in result_agent.workflows)

        # user filter — excludes it
        result_user = await get_prompt_authoring_contract(
            current_user=_user_with_defaults(), audience="user"
        )
        assert not any(wf.id == "_test_agent_only" for wf in result_user.workflows)
    finally:
        authoring_workflow_registry.unregister("_test_agent_only")


@pytest.mark.asyncio
async def test_prompt_authoring_contract_normalizes_audience_value() -> None:
    normalized = await get_prompt_authoring_contract(
        current_user=_user_with_defaults(), audience=" Agent "
    )
    explicit = await get_prompt_authoring_contract(
        current_user=_user_with_defaults(), audience="agent"
    )

    assert {wf.id for wf in normalized.workflows} == {wf.id for wf in explicit.workflows}


@pytest.mark.asyncio
async def test_prompt_authoring_contract_rejects_invalid_audience() -> None:
    with pytest.raises(HTTPException) as exc:
        await get_prompt_authoring_contract(current_user=_user_with_defaults(), audience="agents")

    assert exc.value.status_code == 422
    assert "Expected one of: agent, user." in str(exc.value.detail)


@pytest.mark.asyncio
async def test_prompt_authoring_contract_exposes_valid_values() -> None:
    result = await get_prompt_authoring_contract(current_user=_user_with_defaults())

    vv_by_field = {vv.field: vv for vv in result.valid_values}
    assert "prompt_type" in vv_by_field
    assert "visual" in vv_by_field["prompt_type"].values
    assert vv_by_field["prompt_type"].extensible is False

    assert "category" in vv_by_field
    assert vv_by_field["category"].extensible is True


@pytest.mark.asyncio
async def test_prompt_authoring_modes_have_sequence_role_mapping() -> None:
    result = await get_prompt_authoring_contract(current_user=_user_with_defaults())

    setup_mode = next(m for m in result.authoring_modes if m.id == "scene_setup")
    assert setup_mode.sequence_role == "initial"

    continuation_mode = next(m for m in result.authoring_modes if m.id == "scene_continuation")
    assert continuation_mode.sequence_role == "continuation"

    tool_mode = next(m for m in result.authoring_modes if m.id == "tool_edit")
    assert tool_mode.sequence_role is None


@pytest.mark.asyncio
async def test_prompt_authoring_modes_have_generation_hints() -> None:
    result = await get_prompt_authoring_contract(current_user=_user_with_defaults())
    modes_by_id = {m.id: m for m in result.authoring_modes}

    # scene_setup prefers t2i
    setup = modes_by_id["scene_setup"]
    assert len(setup.generation_hints) >= 1
    assert setup.generation_hints[0].operation == "text_to_image"
    assert setup.generation_hints[0].requires_input_asset is False
    assert setup.generation_hints[0].suggested_params == {"aspect_ratio": "16:9"}

    # scene_continuation prefers i2v with auto-bind
    cont = modes_by_id["scene_continuation"]
    assert cont.generation_hints[0].requires_input_asset is True
    assert cont.generation_hints[0].auto_bind == "parent_output"
    assert cont.generation_hints[0].suggested_params == {"duration": 5}

    # patch_edit requires input asset
    patch = modes_by_id["patch_edit"]
    assert len(patch.generation_hints) == 1
    assert patch.generation_hints[0].operation == "image_to_image"
    assert patch.generation_hints[0].requires_input_asset is True
    assert patch.generation_hints[0].auto_bind == "parent_output"

    # variation prefers i2i but can fallback to t2i
    var = modes_by_id["variation"]
    assert var.generation_hints[0].operation == "image_to_image"
    assert var.generation_hints[1].operation == "text_to_image"
    assert var.generation_hints[1].requires_input_asset is False

    # tool_edit auto-binds to viewer_asset
    tool = modes_by_id["tool_edit"]
    assert tool.generation_hints[0].auto_bind == "viewer_asset"

    # character_design prefers t2i, can refine from reference
    char = modes_by_id["character_design"]
    assert char.sequence_role == "initial"
    assert char.generation_hints[0].operation == "text_to_image"
    assert char.generation_hints[0].suggested_params == {"aspect_ratio": "3:4"}
    assert char.generation_hints[1].operation == "image_to_image"
    assert char.generation_hints[1].auto_bind == "viewer_asset"

    # all hints are sorted by priority
    for mode in result.authoring_modes:
        priorities = [h.priority for h in mode.generation_hints]
        assert priorities == sorted(priorities), f"{mode.id} hints not sorted by priority"


@pytest.mark.asyncio
async def test_prompt_authoring_contract_includes_discovery_endpoints() -> None:
    result = await get_prompt_authoring_contract(current_user=_user_with_defaults())

    endpoint_ids = {ep.id for ep in result.endpoints}
    assert "prompts.list_families" in endpoint_ids
    assert "prompts.search_similar" in endpoint_ids


@pytest.mark.asyncio
async def test_prompt_authoring_contract_has_pre_authoring_checks() -> None:
    result = await get_prompt_authoring_contract(current_user=_user_with_defaults())

    checks_by_id = {c.id: c for c in result.pre_authoring_checks}

    # Dedup checks
    assert "dedup_families" in checks_by_id
    dedup = checks_by_id["dedup_families"]
    assert dedup.endpoint.method == "GET"
    assert "/families" in dedup.endpoint.path
    assert dedup.when  # non-empty guidance

    assert "dedup_similar" in checks_by_id
    similar = checks_by_id["dedup_similar"]
    assert similar.example_params is not None
    assert "prompt" in similar.example_params

    # Tag vocabulary discovery
    assert "discover_tags" in checks_by_id
    tags_check = checks_by_id["discover_tags"]
    assert tags_check.endpoint.id == "blocks.tag_dictionary"
    assert "tag-dictionary" in tags_check.endpoint.path

    # Ontology discovery
    assert "discover_ontology" in checks_by_id
    onto_check = checks_by_id["discover_ontology"]
    assert onto_check.endpoint.id == "ontology.usage"


@pytest.mark.asyncio
async def test_prompt_authoring_contract_has_field_constraints() -> None:
    result = await get_prompt_authoring_contract(current_user=_user_with_defaults())

    constraints_by_field = {c.field: c for c in result.constraints}

    # Family constraints
    assert "family.title" in constraints_by_field
    assert constraints_by_field["family.title"].max_length == 255
    assert constraints_by_field["family.title"].required is True

    assert "family.slug" in constraints_by_field
    assert constraints_by_field["family.slug"].max_length == 100

    # Version constraints
    assert "version.prompt_text" in constraints_by_field
    assert constraints_by_field["version.prompt_text"].min_length == 1
    assert constraints_by_field["version.prompt_text"].required is True

    # Analyze constraints
    assert "analyze.text" in constraints_by_field
    assert constraints_by_field["analyze.text"].max_length == 10000


@pytest.mark.asyncio
async def test_prompt_authoring_contract_has_error_schema() -> None:
    result = await get_prompt_authoring_contract(current_user=_user_with_defaults())

    assert "properties" in result.error_schema
    assert "code" in result.error_schema["properties"]
    assert "message" in result.error_schema["properties"]
    assert "detail" in result.error_schema["properties"]
    assert "request_id" in result.error_schema["properties"]
    assert "fields" in result.error_schema["properties"]


@pytest.mark.asyncio
async def test_prompt_authoring_contract_has_idempotency_rules() -> None:
    result = await get_prompt_authoring_contract(current_user=_user_with_defaults())

    rules_by_scope = {r.scope: r for r in result.idempotency}

    assert "create_family" in rules_by_scope
    assert rules_by_scope["create_family"].unique_key == "slug"
    assert "409" in rules_by_scope["create_family"].behavior

    assert "create_version" in rules_by_scope
    assert "NOT deduplicated" in rules_by_scope["create_version"].behavior

    assert "apply_edit" in rules_by_scope
    assert "Not idempotent" in rules_by_scope["apply_edit"].behavior
