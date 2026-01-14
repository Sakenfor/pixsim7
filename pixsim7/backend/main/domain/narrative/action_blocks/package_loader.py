"""
Package loader system for dynamic action block content.
Allows loading JSON packages without modifying Python code.
"""

import json
import os
from typing import Dict, Any, List, Optional
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass

from .types_unified import (
    ActionBlock,
    ActionBlockTags,
    CameraMovement,
    ConsistencyFlags,
    ContentRating,
)
from .concepts import CreatureType, CreatureProperties, MovementType, InteractionType
from .generation_templates import GenerationTemplate, TemplateType


@dataclass
class PackageInfo:
    """Information about a loaded package."""
    name: str
    version: str
    author: str
    description: str
    content_rating_max: str
    loaded_at: datetime
    file_path: str


@dataclass
class PackageContent:
    """Content loaded from a package."""
    info: PackageInfo
    creatures: Dict[str, Any]
    templates: Dict[str, Any]
    action_blocks: List[Dict[str, Any]]


class PackageLoader:
    """Loads and manages action block packages."""

    def __init__(self, package_dir: Optional[str] = None):
        """
        Initialize the package loader.

        Args:
            package_dir: Directory containing packages (defaults to ./packages)
        """
        if package_dir:
            self.package_dir = Path(package_dir)
        else:
            # Default to packages subdirectory
            self.package_dir = Path(__file__).parent / "packages"

        # Create packages directory if it doesn't exist
        self.package_dir.mkdir(exist_ok=True)

        # Track loaded packages
        self.loaded_packages: Dict[str, PackageContent] = {}

        # References to system components (would be injected in production)
        self.action_blocks: Dict[str, Any] = {}
        self.custom_creatures: Dict[str, CreatureProperties] = {}
        self.custom_templates: Dict[str, GenerationTemplate] = {}

    def load_package(self, package_name: str) -> PackageContent:
        """
        Load a package from a JSON file.

        Args:
            package_name: Name of the package file (with or without .json)

        Returns:
            PackageContent with loaded data

        Raises:
            FileNotFoundError: If package file doesn't exist
            ValueError: If package format is invalid
        """
        # Ensure .json extension
        if not package_name.endswith('.json'):
            package_name += '.json'

        package_path = self.package_dir / package_name

        if not package_path.exists():
            raise FileNotFoundError(f"Package not found: {package_path}")

        try:
            with open(package_path, 'r') as f:
                package_data = json.load(f)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in package: {e}")

        # Validate package structure
        if 'package_info' not in package_data:
            raise ValueError("Package missing 'package_info' section")

        # Create package info
        info = PackageInfo(
            name=package_data['package_info'].get('name', 'unnamed'),
            version=package_data['package_info'].get('version', '1.0.0'),
            author=package_data['package_info'].get('author', 'unknown'),
            description=package_data['package_info'].get('description', ''),
            content_rating_max=package_data['package_info'].get('content_rating_max', 'sfw'),
            loaded_at=datetime.now(),
            file_path=str(package_path)
        )

        # Create package content
        content = PackageContent(
            info=info,
            creatures=package_data.get('creatures', {}),
            templates=package_data.get('templates', {}),
            action_blocks=package_data.get('action_blocks', [])
        )

        # Process and inject content
        self._process_creatures(content.creatures, info.name)
        self._process_templates(content.templates, info.name)
        self._process_action_blocks(content.action_blocks, info.name)

        # Store loaded package
        self.loaded_packages[info.name] = content

        print(f"✓ Loaded package '{info.name}' v{info.version}")
        print(f"  - {len(content.creatures)} creatures")
        print(f"  - {len(content.templates)} templates")
        print(f"  - {len(content.action_blocks)} action blocks")

        return content

    def _process_creatures(self, creatures: Dict[str, Any], package_name: str):
        """Process and inject creature definitions."""
        for creature_id, creature_data in creatures.items():
            # Create creature ID with package namespace
            full_id = f"{package_name}:{creature_id}"

            # Parse creature properties
            base_type = creature_data.get('base_type', 'custom')

            # Create creature properties object
            creature_props = CreatureProperties(
                type=base_type,  # This would need custom type handling in production
                movement_types=[MovementType.WALKING],  # Default, should parse from data
                special_features=creature_data.get('special_features', []),
                texture_descriptors=creature_data.get('texture_descriptors', []),
                size_category=creature_data.get('size_category', 'medium'),
                interaction_capabilities=[InteractionType.PHYSICAL],  # Default
                unique_actions=creature_data.get('unique_actions', [])
            )

            # Store in custom creatures
            self.custom_creatures[full_id] = creature_props

    def _process_templates(self, templates: Dict[str, Any], package_name: str):
        """Process and inject template definitions."""
        for template_id, template_data in templates.items():
            # Create template ID with package namespace
            full_id = f"{package_name}:{template_id}"

            # Create generation template
            template = GenerationTemplate(
                id=full_id,
                type=TemplateType.CREATURE_INTERACTION,  # Default, should be configurable
                name=template_data.get('name', template_id),
                template=template_data.get('template', ''),
                required_params=template_data.get('required_params', []),
                optional_params=template_data.get('optional_params', []),
                camera_template=template_data.get('camera_template'),
                consistency_defaults=template_data.get('consistency_defaults'),
                supports_creatures=template_data.get('supports_creatures'),
                content_rating_range=template_data.get('content_rating_range', ('sfw', 'restricted'))
            )

            # Store in custom templates
            self.custom_templates[full_id] = template

    def _process_action_blocks(self, blocks: List[Dict[str, Any]], package_name: str):
        """Process and inject action blocks."""
        for block_data in blocks:
            # Add package namespace to ID
            original_id = block_data.get('id', 'unnamed')
            full_id = f"{package_name}:{original_id}"
            block_data['id'] = full_id

            # Ensure required fields
            if 'kind' not in block_data:
                block_data['kind'] = 'single_state'
            if 'tags' not in block_data:
                block_data['tags'] = {}
            if 'durationSec' not in block_data:
                block_data['durationSec'] = 6.0

            # Process tags to ensure they're properly formatted
            tags = block_data['tags']
            if 'custom' not in tags:
                tags['custom'] = []
            tags['custom'].append(f"package:{package_name}")

            # Store action block
            self.action_blocks[full_id] = block_data

    def load_all_packages(self):
        """Load all packages from the packages directory."""
        package_files = list(self.package_dir.glob("*.json"))

        print(f"Found {len(package_files)} packages to load")

        for package_file in package_files:
            try:
                self.load_package(package_file.name)
            except Exception as e:
                print(f"✗ Failed to load {package_file.name}: {e}")

    def list_packages(self) -> List[Dict[str, Any]]:
        """List all available packages."""
        packages = []

        # List loaded packages
        for name, content in self.loaded_packages.items():
            packages.append({
                'name': content.info.name,
                'version': content.info.version,
                'author': content.info.author,
                'description': content.info.description,
                'status': 'loaded',
                'loaded_at': content.info.loaded_at.isoformat(),
                'content': {
                    'creatures': len(content.creatures),
                    'templates': len(content.templates),
                    'action_blocks': len(content.action_blocks)
                }
            })

        # List available but not loaded packages
        for package_file in self.package_dir.glob("*.json"):
            package_name = package_file.stem
            if package_name not in [p['name'] for p in packages]:
                packages.append({
                    'name': package_name,
                    'file': package_file.name,
                    'status': 'available',
                    'size': package_file.stat().st_size
                })

        return packages

    def unload_package(self, package_name: str) -> bool:
        """
        Unload a package and remove its content.

        Args:
            package_name: Name of the package to unload

        Returns:
            True if successfully unloaded, False if not found
        """
        if package_name not in self.loaded_packages:
            return False

        content = self.loaded_packages[package_name]

        # Remove action blocks
        for block in content.action_blocks:
            block_id = block.get('id')
            if block_id in self.action_blocks:
                del self.action_blocks[block_id]

        # Remove templates
        for template_id in content.templates.keys():
            full_id = f"{package_name}:{template_id}"
            if full_id in self.custom_templates:
                del self.custom_templates[full_id]

        # Remove creatures
        for creature_id in content.creatures.keys():
            full_id = f"{package_name}:{creature_id}"
            if full_id in self.custom_creatures:
                del self.custom_creatures[full_id]

        # Remove from loaded packages
        del self.loaded_packages[package_name]

        print(f"✓ Unloaded package '{package_name}'")
        return True

    def export_package(
        self,
        package_name: str,
        blocks: List[Dict[str, Any]],
        creatures: Optional[Dict[str, Any]] = None,
        templates: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Export content as a new package.

        Args:
            package_name: Name for the package
            blocks: List of action blocks to include
            creatures: Optional creature definitions
            templates: Optional template definitions
            metadata: Optional package metadata

        Returns:
            Path to the created package file
        """
        # Create package structure
        package = {
            "package_info": {
                "name": package_name,
                "version": metadata.get('version', '1.0.0') if metadata else '1.0.0',
                "author": metadata.get('author', 'Generated') if metadata else 'Generated',
                "description": metadata.get('description', '') if metadata else '',
                "content_rating_max": metadata.get('content_rating_max', 'sfw') if metadata else 'sfw',
                "created_date": datetime.now().isoformat()
            },
            "creatures": creatures or {},
            "templates": templates or {},
            "action_blocks": blocks
        }

        # Save to file
        package_path = self.package_dir / f"{package_name}.json"

        with open(package_path, 'w') as f:
            json.dump(package, f, indent=2)

        print(f"✓ Exported package to {package_path}")
        return str(package_path)


# Example usage functions
def create_example_package():
    """Create an example package for demonstration."""
    example_package = {
        "package_info": {
            "name": "example_creatures",
            "version": "1.0.0",
            "author": "System",
            "description": "Example creature interactions",
            "content_rating_max": "romantic"
        },
        "creatures": {
            "shadow_beast": {
                "base_type": "custom",
                "special_features": ["incorporeal", "shape-shifting", "darkness-manipulation"],
                "unique_actions": ["phasing", "enveloping", "draining"],
                "size_category": "variable"
            }
        },
        "templates": {
            "shadow_interaction": {
                "name": "Shadow Beast Interaction",
                "template": "{{character}} {{position}}. The shadow beast {{manifestation}}. {{primary_interaction}}. {{shadow_effects}}.",
                "required_params": ["character", "position", "manifestation", "primary_interaction"],
                "optional_params": ["shadow_effects"]
            }
        },
        "action_blocks": [
            {
                "id": "shadow_embrace",
                "kind": "single_state",
                "prompt": "She stands still as shadows coalesce around her. The darkness takes shape, wrapping around her form like living smoke. Tendrils of shadow caress her skin, leaving trails of cool sensation. Camera slowly orbits, capturing the interplay of light and darkness.",
                "tags": {
                    "creature": "shadow_beast",
                    "mood": "mysterious",
                    "intensity": 5,
                    "content_rating": "romantic"
                },
                "cameraMovement": {
                    "type": "rotation",
                    "speed": "slow",
                    "path": "circular",
                    "focus": "shadow_interaction"
                },
                "durationSec": 7.0
            }
        ]
    }

    # Save example package
    package_dir = Path(__file__).parent / "packages"
    package_dir.mkdir(exist_ok=True)

    example_path = package_dir / "example_creatures.json"
    with open(example_path, 'w') as f:
        json.dump(example_package, f, indent=2)

    return str(example_path)


if __name__ == "__main__":
    # Create example package
    example_path = create_example_package()
    print(f"Created example package: {example_path}")

    # Test loading
    loader = PackageLoader()
    content = loader.load_package("example_creatures.json")

    # List packages
    packages = loader.list_packages()
    print("\nAvailable packages:")
    for pkg in packages:
        print(f"  - {pkg['name']} ({pkg['status']})")
