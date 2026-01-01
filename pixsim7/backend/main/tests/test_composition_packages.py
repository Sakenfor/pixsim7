"""
Tests for composition package YAML loading.
"""


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
