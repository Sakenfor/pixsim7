"""
Contract Tests: Composition ↔ Concepts Sync

These tests ensure that the Concepts facade (RoleConceptProvider) stays
in sync with the underlying Composition system.

Why these tests exist:
- Composition is the source of truth for role data
- Concepts wraps Composition via RoleConceptProvider
- Without contract tests, these can drift silently (missing fields, different filtering)

Tests verify:
1. Role IDs match between systems
2. Role labels and tags are correctly mapped
3. Package filtering semantics are identical
4. All Composition role fields are mapped to Concepts
"""

import pytest
from typing import Set


@pytest.fixture(autouse=True)
def setup_registries():
    """Ensure both registries are initialized with core packages."""
    from pixsim7.backend.main.domain.composition import (
        register_core_composition_package,
        clear_composition_packages,
    )
    from pixsim7.backend.main.domain.concepts.providers import reset_providers

    # Clear and reinitialize
    clear_composition_packages()
    register_core_composition_package()
    reset_providers()

    yield

    # Cleanup
    clear_composition_packages()


class TestRoleDataSync:
    """Verify role data stays in sync between Composition and Concepts."""

    def test_role_ids_match(self):
        """Role IDs from Composition should match Concepts."""
        from pixsim7.backend.main.domain.composition import get_available_roles
        from pixsim7.backend.main.domain.concepts import get_provider

        # Get roles from Composition (source of truth)
        composition_roles = get_available_roles()
        composition_ids = {role.id for role in composition_roles}

        # Get roles from Concepts (facade)
        provider = get_provider("role")
        assert provider is not None, "RoleConceptProvider not registered"

        concept_roles = provider.get_concepts()
        concept_ids = {role.id for role in concept_roles}

        # IDs must match exactly
        assert composition_ids == concept_ids, (
            f"Role ID mismatch!\n"
            f"In Composition only: {composition_ids - concept_ids}\n"
            f"In Concepts only: {concept_ids - composition_ids}"
        )

    def test_role_labels_match(self):
        """Role labels should be correctly mapped."""
        from pixsim7.backend.main.domain.composition import get_available_roles
        from pixsim7.backend.main.domain.concepts import get_provider

        composition_roles = {r.id: r.label for r in get_available_roles()}
        concept_roles = {r.id: r.label for r in get_provider("role").get_concepts()}

        for role_id, comp_label in composition_roles.items():
            assert role_id in concept_roles, f"Role {role_id} missing in Concepts"
            assert concept_roles[role_id] == comp_label, (
                f"Label mismatch for {role_id}: "
                f"Composition='{comp_label}', Concepts='{concept_roles[role_id]}'"
            )

    def test_role_tags_match(self):
        """Role tags should be correctly mapped."""
        from pixsim7.backend.main.domain.composition import get_available_roles
        from pixsim7.backend.main.domain.concepts import get_provider

        composition_roles = {r.id: set(r.tags) for r in get_available_roles()}
        concept_roles = {r.id: set(r.tags) for r in get_provider("role").get_concepts()}

        for role_id, comp_tags in composition_roles.items():
            assert role_id in concept_roles, f"Role {role_id} missing in Concepts"
            assert concept_roles[role_id] == comp_tags, (
                f"Tags mismatch for {role_id}: "
                f"Composition={comp_tags}, Concepts={concept_roles[role_id]}"
            )

    def test_role_colors_match(self):
        """Role colors should be correctly mapped."""
        from pixsim7.backend.main.domain.composition import get_available_roles
        from pixsim7.backend.main.domain.concepts import get_provider

        composition_roles = {r.id: r.color for r in get_available_roles()}
        concept_roles = {r.id: r.color for r in get_provider("role").get_concepts()}

        for role_id, comp_color in composition_roles.items():
            assert role_id in concept_roles, f"Role {role_id} missing in Concepts"
            assert concept_roles[role_id] == comp_color, (
                f"Color mismatch for {role_id}: "
                f"Composition='{comp_color}', Concepts='{concept_roles[role_id]}'"
            )


class TestPackageFilteringSync:
    """Verify package filtering behaves identically in both systems."""

    def test_package_filter_returns_same_roles(self):
        """Filtering by package_ids should return same roles in both systems."""
        from pixsim7.backend.main.domain.composition import (
            get_available_roles,
            list_composition_packages,
        )
        from pixsim7.backend.main.domain.concepts import get_provider

        # Get available package IDs
        packages = list_composition_packages()
        if not packages:
            pytest.skip("No composition packages registered")

        # Test with each package
        for pkg_id in packages.keys():
            package_ids = [pkg_id]

            # Get filtered roles from both systems
            composition_ids = {r.id for r in get_available_roles(package_ids)}
            concept_ids = {
                r.id for r in get_provider("role").get_concepts(package_ids)
            }

            assert composition_ids == concept_ids, (
                f"Package filter mismatch for {pkg_id}!\n"
                f"Composition: {composition_ids}\n"
                f"Concepts: {concept_ids}"
            )

    def test_empty_package_filter_returns_all(self):
        """Empty/None package_ids should return all roles in both systems."""
        from pixsim7.backend.main.domain.composition import get_available_roles
        from pixsim7.backend.main.domain.concepts import get_provider

        # None filter
        comp_none = {r.id for r in get_available_roles(None)}
        concept_none = {r.id for r in get_provider("role").get_concepts(None)}
        assert comp_none == concept_none, "None filter returns different results"

        # No filter (default)
        comp_default = {r.id for r in get_available_roles()}
        concept_default = {r.id for r in get_provider("role").get_concepts()}
        assert comp_default == concept_default, "Default filter returns different results"


class TestFieldMapping:
    """Verify all Composition role fields are mapped to Concepts."""

    def test_metadata_contains_composition_fields(self):
        """Concepts metadata should contain Composition-specific fields."""
        from pixsim7.backend.main.domain.composition import get_available_roles
        from pixsim7.backend.main.domain.concepts import get_provider

        composition_roles = {r.id: r for r in get_available_roles()}
        concept_roles = {r.id: r for r in get_provider("role").get_concepts()}

        for role_id, comp_role in composition_roles.items():
            concept_role = concept_roles.get(role_id)
            assert concept_role is not None, f"Role {role_id} missing in Concepts"

            metadata = concept_role.metadata or {}

            # Check that Composition-specific fields are in metadata
            assert "default_layer" in metadata, (
                f"Role {role_id}: default_layer not in Concepts metadata"
            )
            assert metadata["default_layer"] == comp_role.default_layer, (
                f"Role {role_id}: default_layer mismatch"
            )

            assert "slug_mappings" in metadata, (
                f"Role {role_id}: slug_mappings not in Concepts metadata"
            )
            assert list(metadata["slug_mappings"]) == list(comp_role.slug_mappings), (
                f"Role {role_id}: slug_mappings mismatch"
            )

            assert "namespace_mappings" in metadata, (
                f"Role {role_id}: namespace_mappings not in Concepts metadata"
            )
            assert list(metadata["namespace_mappings"]) == list(comp_role.namespace_mappings), (
                f"Role {role_id}: namespace_mappings mismatch"
            )

    def test_concept_response_has_correct_kind(self):
        """All role concepts should have kind='role'."""
        from pixsim7.backend.main.domain.concepts import get_provider

        for concept in get_provider("role").get_concepts():
            assert concept.kind == "role", f"Role {concept.id} has wrong kind: {concept.kind}"

    def test_concept_response_has_group(self):
        """All role concepts should have a group set."""
        from pixsim7.backend.main.domain.concepts import get_provider

        for concept in get_provider("role").get_concepts():
            assert concept.group, f"Role {concept.id} has no group"


class TestProviderRegistration:
    """Verify provider registration is reliable."""

    def test_role_provider_is_registered(self):
        """RoleConceptProvider should be registered after concepts import."""
        from pixsim7.backend.main.domain.concepts import get_provider, get_all_kinds

        assert "role" in get_all_kinds(), "role kind not registered"
        assert get_provider("role") is not None, "RoleConceptProvider not found"

    def test_role_provider_supports_packages(self):
        """RoleConceptProvider should declare package support."""
        from pixsim7.backend.main.domain.concepts import get_provider

        provider = get_provider("role")
        assert provider.supports_packages is True, (
            "RoleConceptProvider should support package filtering"
        )
