"""Built-in prompt contract surfaces."""
from __future__ import annotations

from ..models import MetaContract, MetaContractEndpoint
from ..helpers import _inject_focus_tags


def _builtin_prompts_analysis(version: str = "unknown") -> MetaContract:
    return MetaContract(
        id="prompts.analysis",
        name="Prompt Analysis Contract",
        endpoint="/api/v1/prompts/meta/analysis-contract",
        version=version,
        auth_required=True,
        owner="prompt-analyzer lane",
        summary=(
            "Analyzer selection order, request/response schema, prompt analyzer "
            "catalog, deprecations, and examples."
        ),
        provides=["prompt_analysis", "analyzer_catalog", "analyzer_presets"],
        relates_to=["prompts.authoring", "plans.management"],
    )


def _builtin_prompts_authoring(version: str = "unknown") -> MetaContract:
    # Auto-generate authoring-mode CRUD sub-endpoints from the spec
    try:
        from pixsim7.backend.main.api.v1.prompts.meta import authoring_mode_crud_spec
        from pixsim7.backend.main.services.crud.registry import spec_to_meta_sub_endpoints
        auto_endpoints = spec_to_meta_sub_endpoints(authoring_mode_crud_spec)
    except ImportError:
        auto_endpoints = []

    all_endpoints = [
        # -- Family CRUD --
        MetaContractEndpoint(
            id="prompts.list_families",
            method="GET",
            path="/api/v1/prompts/families",
            summary="List prompt families. Filter by prompt_type, category, is_active.",
            tags=["families", "read"],
        ),
        MetaContractEndpoint(
            id="prompts.get_family",
            method="GET",
            path="/api/v1/prompts/families/{family_id}",
            summary="Get a single family by ID with version count.",
            tags=["families", "read"],
        ),
        MetaContractEndpoint(
            id="prompts.create_family",
            method="POST",
            path="/api/v1/prompts/families",
            summary="Create a prompt family container.",
            tags=["families", "write"],
        ),
        MetaContractEndpoint(
            id="prompts.update_family",
            method="PATCH",
            path="/api/v1/prompts/families/{family_id}",
            summary=(
                "Partial update on a family. Send only fields to change: "
                "title, description, category, tags, is_active."
            ),
            tags=["families", "write"],
        ),
        # -- Version CRUD --
        MetaContractEndpoint(
            id="prompts.list_versions",
            method="GET",
            path="/api/v1/prompts/families/{family_id}/versions",
            summary="List versions for a family.",
            tags=["versions", "read"],
        ),
        MetaContractEndpoint(
            id="prompts.get_version",
            method="GET",
            path="/api/v1/prompts/versions/{version_id}",
            summary="Get a single version with full prompt_text.",
            tags=["versions", "read"],
        ),
        MetaContractEndpoint(
            id="prompts.create_version",
            method="POST",
            path="/api/v1/prompts/families/{family_id}/versions",
            summary="Create a version under a family with optional prompt_analysis.",
            tags=["versions", "write"],
        ),
        MetaContractEndpoint(
            id="prompts.apply_edit",
            method="POST",
            path="/api/v1/prompts/versions/{version_id}/apply-edit",
            summary="Apply edits to a version, creating a child version.",
            tags=["versions", "write"],
        ),
        # -- Analysis & discovery --
        MetaContractEndpoint(
            id="prompts.analyze",
            method="POST",
            path="/api/v1/prompts/analyze",
            summary="Analyze raw prompt text before persistence.",
            tags=["analysis"],
        ),
        MetaContractEndpoint(
            id="prompts.search_similar",
            method="GET",
            path="/api/v1/prompts/search/similar",
            summary="Find similar prompts by text similarity.",
            tags=["discovery"],
        ),
        # -- Authoring mode CRUD (auto-generated from spec) --
        *auto_endpoints,
    ]

    # Consolidate bare tags into focus groups for the user.assistant UI
    _PROMPT_GROUP_CONSOLIDATION = {
        "authoring-modes": "modes",
    }
    child_groups = _inject_focus_tags(
        all_endpoints, "prompt_authoring",
        group_consolidation=_PROMPT_GROUP_CONSOLIDATION,
    )

    return MetaContract(
        id="prompts.authoring",
        name="Prompt Authoring Contract",
        endpoint="/api/v1/prompts/meta/authoring-contract",
        version=version,
        auth_required=True,
        owner="prompt-authoring lane",
        summary=(
            "Prompt family/version authoring workflows, request schemas, "
            "pre-authoring checks, constraints, idempotency, and examples. "
            "Includes CRUD for families (create, read, update) and versions "
            "(create, read, apply-edit), generation hints per authoring mode, "
            "and category-driven mode resolution."
        ),
        audience=["user", "dev", "agent"],
        provides=[
            "prompt_authoring",
            *child_groups,
            "prompt_families",
            "prompt_family_crud",
            "prompt_versions",
            "authoring_workflows",
            "authoring_modes",
            "authoring_mode_crud",
            "generation_hints",
            "valid_values",
        ],
        relates_to=["prompts.analysis", "blocks.discovery", "user.assistant"],
        sub_endpoints=all_endpoints,
    )


def _builtin_blocks_discovery() -> MetaContract:
    all_endpoints = [
        MetaContractEndpoint(
            id="blocks.tag_dictionary",
            method="GET",
            path="/api/v1/block-templates/meta/blocks/tag-dictionary",
            summary="Canonical tag dictionary with keys, values, and usage stats.",
            tags=["vocabulary"],
        ),
        MetaContractEndpoint(
            id="blocks.catalog",
            method="GET",
            path="/api/v1/block-templates/meta/blocks/catalog",
            summary="High-level catalog of all primitives by category.",
            tags=["catalog"],
        ),
        MetaContractEndpoint(
            id="blocks.matrix",
            method="GET",
            path="/api/v1/block-templates/meta/blocks/matrix",
            summary="Category x role matrix showing what slots are populated.",
            tags=["catalog"],
        ),
        MetaContractEndpoint(
            id="blocks.content_packs",
            method="GET",
            path="/api/v1/block-templates/meta/content-packs/manifests",
            summary="Loaded content pack manifests with block counts.",
            tags=["catalog"],
        ),
        MetaContractEndpoint(
            id="blocks.roles",
            method="GET",
            path="/api/v1/block-templates/blocks/roles",
            summary="Available composition roles for block primitives.",
            tags=["catalog"],
        ),
        MetaContractEndpoint(
            id="blocks.tags",
            method="GET",
            path="/api/v1/block-templates/blocks/tags",
            summary="Compact tag key to values index.",
            tags=["vocabulary"],
        ),
        MetaContractEndpoint(
            id="blocks.vocabulary_validate",
            method="POST",
            path="/api/v1/block-templates/meta/vocabulary/validate",
            summary="Validate tags and ontology IDs against canonical vocabulary.",
            tags=["vocabulary"],
        ),
        MetaContractEndpoint(
            id="blocks.vocabulary_suggest",
            method="GET",
            path="/api/v1/block-templates/meta/vocabulary/suggest",
            summary="Suggest canonical tags based on partial input.",
            tags=["vocabulary"],
        ),
    ]

    # Blocks serve prompt authoring — surface as prompt_authoring:vocabulary,
    # prompt_authoring:catalog children so the focus drill-down works.
    child_groups = _inject_focus_tags(all_endpoints, "prompt_authoring")

    return MetaContract(
        id="blocks.discovery",
        name="Block Primitives Discovery",
        endpoint=None,
        version="1.0.0",
        auth_required=True,
        owner="block-templates lane",
        summary=(
            "Discovery surface for block primitives: tag vocabulary, catalog, "
            "category/role matrix, content packs, and composition roles."
        ),
        provides=[
            *child_groups,
            "tag_vocabulary",
            "block_catalog",
            "block_matrix",
            "content_packs",
            "composition_roles",
            "vocabulary_governance",
            "planning_ir",
            "primitive_effectiveness",
        ],
        relates_to=["prompts.authoring", "prompts.analysis", "plans.management"],
        sub_endpoints=all_endpoints,
    )
