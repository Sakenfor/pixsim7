"""
Storage service module for media file storage.

Provides an abstraction layer over file storage with pluggable backends per
named root (local filesystem + S3/MinIO), routed by ``Asset.storage_root_id``.
See plan ``media-storage-tiering``.
"""
from .roots import LOCAL_ROOT_ID, RootSpec, get_root_specs, reset_root_specs_cache
from .storage_service import (
    LocalStorageService,
    S3StorageService,
    StorageService,
    TieredStorageService,
    get_storage_service,
    set_storage_service,
)

__all__ = [
    "StorageService",
    "LocalStorageService",
    "S3StorageService",
    "TieredStorageService",
    "get_storage_service",
    "set_storage_service",
    "RootSpec",
    "get_root_specs",
    "reset_root_specs_cache",
    "LOCAL_ROOT_ID",
]
