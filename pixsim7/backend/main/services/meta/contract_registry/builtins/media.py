"""Built-in media contract surfaces."""
from __future__ import annotations

from ..models import MetaContract, MetaContractEndpoint
from ..helpers import _inject_focus_tags


def _builtin_assets_management() -> MetaContract:
    all_endpoints = [
        # -- Search & browse --
        MetaContractEndpoint(
            id="assets.search",
            method="POST",
            path="/api/v1/assets/search",
            summary="Search assets with filters, sorting, and pagination.",
            tags=["search"],
        ),
        MetaContractEndpoint(
            id="assets.groups",
            method="POST",
            path="/api/v1/assets/groups",
            summary="Grouped asset listing (by generation, date, etc.).",
            tags=["search"],
        ),
        MetaContractEndpoint(
            id="assets.filter_options",
            method="POST",
            path="/api/v1/assets/filter-options",
            summary="Available filter options for the current result set.",
            tags=["search"],
        ),
        MetaContractEndpoint(
            id="assets.autocomplete",
            method="GET",
            path="/api/v1/assets/autocomplete",
            summary="Autocomplete suggestions for asset search.",
            tags=["search"],
        ),
        # -- CRUD --
        MetaContractEndpoint(
            id="assets.get",
            method="GET",
            path="/api/v1/assets/{asset_id}",
            summary="Get asset details by ID.",
            tags=["crud"],
        ),
        MetaContractEndpoint(
            id="assets.delete",
            method="DELETE",
            path="/api/v1/assets/{asset_id}",
            summary="Delete an asset.",
            tags=["crud"],
        ),
        MetaContractEndpoint(
            id="assets.archive",
            method="PATCH",
            path="/api/v1/assets/{asset_id}/archive",
            summary="Archive or unarchive an asset.",
            tags=["crud"],
        ),
        # -- Upload --
        MetaContractEndpoint(
            id="assets.upload",
            method="POST",
            path="/api/v1/assets/upload",
            summary="Upload a new asset (file or URL).",
            tags=["upload"],
        ),
        MetaContractEndpoint(
            id="assets.upload_from_url",
            method="POST",
            path="/api/v1/assets/upload-from-url",
            summary="Upload asset from a remote URL.",
            tags=["upload"],
        ),
        MetaContractEndpoint(
            id="assets.reupload",
            method="POST",
            path="/api/v1/assets/{asset_id}/reupload",
            summary="Re-upload / replace an asset's file.",
            tags=["upload"],
        ),
        # -- Tags --
        MetaContractEndpoint(
            id="assets.tags_assign",
            method="POST",
            path="/api/v1/assets/{asset_id}/tags/assign",
            summary="Assign tags to an asset.",
            tags=["tags"],
        ),
        MetaContractEndpoint(
            id="assets.tags_suggest",
            method="GET",
            path="/api/v1/assets/{asset_id}/tags/suggest",
            summary="AI-suggested tags for an asset.",
            tags=["tags"],
        ),
        MetaContractEndpoint(
            id="assets.bulk_tags",
            method="POST",
            path="/api/v1/assets/bulk/tags",
            summary="Bulk tag assignment across multiple assets.",
            tags=["tags"],
        ),
        # -- Enrichment --
        MetaContractEndpoint(
            id="assets.enrich",
            method="POST",
            path="/api/v1/assets/{asset_id}/enrich",
            summary="Run AI enrichment (captioning, tagging) on an asset.",
            tags=["enrichment"],
        ),
        # -- Versioning --
        MetaContractEndpoint(
            id="assets.versions",
            method="GET",
            path="/api/v1/assets/{asset_id}/versions",
            summary="List version history for an asset.",
            tags=["versioning"],
        ),
        MetaContractEndpoint(
            id="assets.ancestry",
            method="GET",
            path="/api/v1/assets/{asset_id}/ancestry",
            summary="Get full ancestry chain for an asset.",
            tags=["versioning"],
        ),
        MetaContractEndpoint(
            id="assets.version_family",
            method="GET",
            path="/api/v1/assets/versions/families/{family_id}",
            summary="Get version family details.",
            tags=["versioning"],
        ),
        # -- Generation context --
        MetaContractEndpoint(
            id="assets.generation_context",
            method="GET",
            path="/api/v1/assets/{asset_id}/generation-context",
            summary="Retrieve the generation context that produced this asset.",
            tags=["context"],
        ),
    ]

    child_groups = _inject_focus_tags(all_endpoints, "asset_management")

    return MetaContract(
        id="assets.management",
        name="Asset Management",
        endpoint=None,
        version="1.0.0",
        auth_required=True,
        owner="asset lane",
        summary=(
            "Asset CRUD, search, upload, tagging, enrichment, versioning, "
            "and generation-context retrieval."
        ),
        provides=[
            "asset_management",
            *child_groups,
        ],
        relates_to=["user.assistant"],
        sub_endpoints=all_endpoints,
    )


def _builtin_generation_assistance() -> MetaContract:
    all_endpoints = [
        # -- Create --
        MetaContractEndpoint(
            id="generations.create",
            method="POST",
            path="/api/v1/generations",
            summary="Create a new generation request.",
            tags=["create"],
        ),
        MetaContractEndpoint(
            id="generations.simple_i2v",
            method="POST",
            path="/api/v1/generations/simple-image-to-video",
            summary="Quick image-to-video generation shortcut.",
            tags=["create"],
        ),
        MetaContractEndpoint(
            id="generations.validate",
            method="POST",
            path="/api/v1/generations/validate",
            summary="Validate generation parameters before submitting.",
            tags=["create"],
        ),
        # -- Status --
        MetaContractEndpoint(
            id="generations.get",
            method="GET",
            path="/api/v1/generations/{generation_id}",
            summary="Get generation status and details.",
            tags=["status"],
        ),
        MetaContractEndpoint(
            id="generations.list",
            method="GET",
            path="/api/v1/generations",
            summary="List generations with filters and pagination.",
            tags=["status"],
        ),
        MetaContractEndpoint(
            id="generations.operations",
            method="GET",
            path="/api/v1/generation-operations",
            summary="Available generation operation types and metadata.",
            tags=["status"],
        ),
        # -- Lifecycle --
        MetaContractEndpoint(
            id="generations.cancel",
            method="POST",
            path="/api/v1/generations/{generation_id}/cancel",
            summary="Cancel a running generation.",
            tags=["lifecycle"],
        ),
        MetaContractEndpoint(
            id="generations.retry",
            method="POST",
            path="/api/v1/generations/{generation_id}/retry",
            summary="Retry a failed generation.",
            tags=["lifecycle"],
        ),
        MetaContractEndpoint(
            id="generations.pause",
            method="POST",
            path="/api/v1/generations/{generation_id}/pause",
            summary="Pause a running generation.",
            tags=["lifecycle"],
        ),
        MetaContractEndpoint(
            id="generations.resume",
            method="POST",
            path="/api/v1/generations/{generation_id}/resume",
            summary="Resume a paused generation.",
            tags=["lifecycle"],
        ),
        MetaContractEndpoint(
            id="generations.delete",
            method="DELETE",
            path="/api/v1/generations/{generation_id}",
            summary="Delete a generation record.",
            tags=["lifecycle"],
        ),
        # -- Batches --
        MetaContractEndpoint(
            id="generations.batches_list",
            method="GET",
            path="/api/v1/generation-batches",
            summary="List generation batches.",
            tags=["batches"],
        ),
        MetaContractEndpoint(
            id="generations.batch_detail",
            method="GET",
            path="/api/v1/generation-batches/{batch_id}",
            summary="Get batch details with generation breakdown.",
            tags=["batches"],
        ),
        # -- Chains --
        MetaContractEndpoint(
            id="generations.chains_list",
            method="GET",
            path="/api/v1/generation-chains",
            summary="List generation chains.",
            tags=["chains"],
        ),
        MetaContractEndpoint(
            id="generations.chain_create",
            method="POST",
            path="/api/v1/generation-chains",
            summary="Create a generation chain definition.",
            tags=["chains"],
        ),
        MetaContractEndpoint(
            id="generations.chain_execute",
            method="POST",
            path="/api/v1/generation-chains/{chain_id}/execute",
            summary="Execute a saved generation chain.",
            tags=["chains"],
        ),
    ]

    child_groups = _inject_focus_tags(all_endpoints, "generation_assistance")

    return MetaContract(
        id="generation.assistance",
        name="Generation Assistance",
        endpoint=None,
        version="1.0.0",
        auth_required=True,
        owner="generation lane",
        summary=(
            "Generation creation, status tracking, lifecycle management, "
            "batch operations, and chain workflows."
        ),
        provides=[
            "generation_assistance",
            *child_groups,
        ],
        relates_to=["user.assistant"],
        sub_endpoints=all_endpoints,
    )
