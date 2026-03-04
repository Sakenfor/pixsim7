"""
Service composition manifest — single source of truth for service descriptors.

Each entry describes a top-level backend service and its sub-service decomposition.
The graph builder reads this manifest instead of hardcoded arrays.
"""

from typing import Dict, List, TypedDict


class SubServiceDescriptor(TypedDict):
    name: str
    file: str
    lines: int
    responsibility: str


class ServiceDescriptor(TypedDict):
    name: str
    file: str
    type: str
    description: str
    sub_services: List[SubServiceDescriptor]


SERVICE_MANIFEST: Dict[str, ServiceDescriptor] = {
    "generation": {
        "name": "GenerationService",
        "file": "generation/generation_service.py",
        "type": "composition",
        "description": "Generation request management",
        "sub_services": [
            {"name": "CreationService", "file": "generation/creation_service.py", "lines": 545, "responsibility": "Creation, validation, canonicalization"},
            {"name": "LifecycleService", "file": "generation/lifecycle_service.py", "lines": 252, "responsibility": "Status transitions & event publishing"},
            {"name": "QueryService", "file": "generation/query_service.py", "lines": 197, "responsibility": "Retrieval & listing operations"},
            {"name": "RetryService", "file": "generation/retry_service.py", "lines": 192, "responsibility": "Retry logic & auto-retry detection"},
        ],
    },
    "prompts": {
        "name": "PromptVersionService",
        "file": "prompts/prompt_version_service.py",
        "type": "composition",
        "description": "Prompt version management",
        "sub_services": [
            {"name": "FamilyService", "file": "prompts/family_service.py", "lines": 280, "responsibility": "Families & versions CRUD"},
            {"name": "VariantService", "file": "prompts/variant_service.py", "lines": 245, "responsibility": "Variant feedback & metrics"},
            {"name": "AnalyticsService", "file": "prompts/analytics_service.py", "lines": 210, "responsibility": "Diff, compare, analytics"},
            {"name": "OperationsService", "file": "prompts/operations_service.py", "lines": 250, "responsibility": "Batch, import/export, inference"},
        ],
    },
    "asset": {
        "name": "AssetService",
        "file": "asset/asset_service.py",
        "type": "composition",
        "description": "Asset management",
        "sub_services": [
            {"name": "CoreService", "file": "asset/core_service.py", "lines": 320, "responsibility": "CRUD, search, listing"},
            {"name": "SyncService", "file": "asset/sync_service.py", "lines": 280, "responsibility": "Download mgmt, sync, providers"},
            {"name": "EnrichmentService", "file": "asset/enrichment_service.py", "lines": 290, "responsibility": "Recognition, extraction"},
            {"name": "QuotaService", "file": "asset/quota_service.py", "lines": 270, "responsibility": "User quotas, storage tracking"},
        ],
    },
}
