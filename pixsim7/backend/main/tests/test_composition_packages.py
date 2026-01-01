"""
Tests for composition package system.
"""
import pytest


def test_load_composition_package_from_yaml(tmp_path):
    """Loads a package YAML into CompositionPackage and validates fields."""
    yaml_content = """
package:
  id: test.package
  label: Test Package
  description: Test package description
  version: 0.1.0
roles:
  pov_hands:
    label: POV Hands
    description: First-person player hands overlay
    color: amber
    defaultLayer: 2
    tags: [pov, hands]
    slugMappings: [pov:hands]
    namespaceMappings: [pov]
"""
    package_path = tmp_path / "composition-package.yaml"
    package_path.write_text(yaml_content, encoding="utf-8")

    from pixsim7.backend.main.domain.composition.package_loader import (
        load_composition_package_from_yaml,
    )

    package = load_composition_package_from_yaml(package_path, plugin_id="test-plugin")

    assert package.id == "test.package"
    assert package.plugin_id == "test-plugin"
    assert package.label == "Test Package"
    assert package.description == "Test package description"
    assert package.version == "0.1.0"
    assert len(package.roles) == 1

    role = package.roles[0]
    assert role.id == "pov_hands"
    assert role.label == "POV Hands"
    assert role.default_layer == 2
    assert "pov:hands" in role.slug_mappings
    assert "pov" in role.namespace_mappings


def test_composition_response_dto_mapping():
    """Tests that domain models convert correctly to API response DTOs."""
    from pixsim7.backend.main.domain.composition import (
        CompositionPackage,
        CompositionRoleDefinition,
    )
    from pixsim7.backend.main.routes.composition.routes import (
        CompositionPackageResponse,
        CompositionRoleResponse,
    )

    # Create domain models
    role = CompositionRoleDefinition(
        id="test_role",
        label="Test Role",
        description="A test role",
        color="blue",
        default_layer=1,
        tags=["test", "example"],
        slug_mappings=["role:test"],
        namespace_mappings=["test"],
    )

    package = CompositionPackage(
        id="test.package",
        label="Test Package",
        description="A test package",
        plugin_id="test-plugin",
        roles=[role],
        recommended_for=["test_game"],
        version="1.0.0",
    )

    # Convert to response DTOs
    role_response = CompositionRoleResponse.from_domain(role)
    package_response = CompositionPackageResponse.from_domain(package)

    # Verify role DTO
    assert role_response.id == "test_role"
    assert role_response.label == "Test Role"
    assert role_response.default_layer == 1
    assert role_response.tags == ["test", "example"]
    assert role_response.slug_mappings == ["role:test"]

    # Verify package DTO
    assert package_response.id == "test.package"
    assert package_response.plugin_id == "test-plugin"
    assert len(package_response.roles) == 1
    assert package_response.roles[0].id == "test_role"
    assert package_response.recommended_for == ["test_game"]


def test_list_packages_includes_core():
    """Tests that core.base package is always available."""
    from pixsim7.backend.main.domain.composition import (
        list_composition_packages,
        register_composition_package,
        clear_composition_packages,
    )
    from pixsim7.backend.main.domain.composition.core_package import (
        register_core_composition_package,
    )

    # Clear and register fresh
    clear_composition_packages()
    register_core_composition_package()

    packages = list_composition_packages()

    assert "core.base" in packages
    core_pkg = packages["core.base"]
    assert core_pkg.label == "Core Composition"
    assert len(core_pkg.roles) > 0

    # Verify core roles exist
    role_ids = [r.id for r in core_pkg.roles]
    assert "main_character" in role_ids
    assert "environment" in role_ids
