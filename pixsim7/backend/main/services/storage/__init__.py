"""
Storage service module for media file storage.

Provides an abstraction layer over file storage that can be swapped
between local filesystem and cloud storage (S3/MinIO) without changing
application code.
"""
from .storage_service import StorageService, get_storage_service

__all__ = ["StorageService", "get_storage_service"]
