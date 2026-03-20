"""
Lightweight CRUD router factory for SimpleRegistry-backed entities.

Usage:
    from pixsim7.backend.main.services.crud.registry import (
        RegistryCrudSpec, mount_registry_crud, spec_to_meta_sub_endpoints,
    )
"""
from .crud_router import RegistryCrudSpec, mount_registry_crud, spec_to_meta_sub_endpoints

__all__ = ["RegistryCrudSpec", "mount_registry_crud", "spec_to_meta_sub_endpoints"]
