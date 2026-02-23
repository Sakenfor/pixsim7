"""
Composition Packages API

Exposes registered composition packages and roles to the frontend.
Packages are loaded from YAML at startup (core + plugins).
"""
from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel, Field

from pixsim7.backend.main.domain.composition import (
    list_composition_packages,
    CompositionPackage,
    CompositionRoleDefinition,
)

router = APIRouter(prefix="/composition", tags=["composition"])


# ===== Response Schemas =====

class CompositionRoleResponse(BaseModel):
    """A composition role contributed by a package."""
    id: str
    label: str
    description: str
    color: str
    default_layer: int = Field(default=0, description="Layer order (0=background, higher=foreground)")
    tags: List[str] = Field(default_factory=list)
    parent: Optional[str] = Field(default=None, description="Parent group ID")
    is_group: bool = Field(default=False, description="Whether this is a group entry")
    slug_mappings: List[str] = Field(default_factory=list, description="Exact tag slugs that map to this role")
    namespace_mappings: List[str] = Field(default_factory=list, description="Tag namespace prefixes for this role")
    aliases: List[str] = Field(default_factory=list, description="Alias role IDs that normalize to this role")
    default_influence: str = Field(default="content", description="Default influence type for lineage tracking")

    @classmethod
    def from_domain(cls, role: CompositionRoleDefinition) -> "CompositionRoleResponse":
        return cls(
            id=role.id,
            label=role.label,
            description=role.description,
            color=role.color,
            default_layer=role.default_layer,
            tags=list(role.tags),
            parent=role.parent,
            is_group=role.is_group,
            slug_mappings=list(role.slug_mappings),
            namespace_mappings=list(role.namespace_mappings),
            aliases=list(role.aliases),
            default_influence=role.default_influence,
        )


class CompositionPackageResponse(BaseModel):
    """A composition package with its roles."""
    id: str
    label: str
    description: str = ""
    plugin_id: Optional[str] = Field(default=None, description="Plugin that registered this package")
    roles: List[CompositionRoleResponse]
    recommended_for: List[str] = Field(default_factory=list, description="Game styles this package suits")
    version: str = "1.0.0"

    @classmethod
    def from_domain(cls, pkg: CompositionPackage) -> "CompositionPackageResponse":
        return cls(
            id=pkg.id,
            label=pkg.label,
            description=pkg.description,
            plugin_id=pkg.plugin_id,
            roles=[CompositionRoleResponse.from_domain(r) for r in pkg.roles],
            recommended_for=list(pkg.recommended_for),
            version=pkg.version,
        )


class CompositionPackagesListResponse(BaseModel):
    """Response containing all registered composition packages."""
    packages: List[CompositionPackageResponse]
    total: int


# ===== Endpoints =====

@router.get("/packages", response_model=CompositionPackagesListResponse)
async def list_packages():
    """
    List all registered composition packages.

    Returns packages from core and all enabled plugins.
    Each package contains its role definitions with full metadata.

    Frontend can filter by active package IDs using the helper:
    `getAvailableRoles(packages, world.meta.generation.compositionPackages)`
    """
    packages = list_composition_packages()
    response_packages = [
        CompositionPackageResponse.from_domain(pkg)
        for pkg in packages.values()
    ]

    return CompositionPackagesListResponse(
        packages=response_packages,
        total=len(response_packages),
    )
