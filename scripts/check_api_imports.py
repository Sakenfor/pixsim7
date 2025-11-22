#!/usr/bin/env python3
"""
Route Import Self-Check

Tests that each api/v1 module can be imported independently.
This catches import errors early in development before they break
plugin loading or other dependent systems.

Usage:
    python scripts/check_api_imports.py
"""
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def check_api_imports():
    """Test that each api/v1 module imports successfully."""
    # List of all api/v1 modules (from api/v1/__init__.py)
    modules = [
        "auth", "users", "assets", "admin", "services", "accounts",
        "automation", "prompts", "generations", "websocket",
        "dialogue", "actions", "generation", "npc_state",
        "llm_cache", "analytics", "dev_architecture", "dev_info"
    ]

    failed = []
    succeeded = []

    print("Testing API v1 module imports...\n")

    for module_name in modules:
        try:
            module_path = f"pixsim7.backend.main.api.v1.{module_name}"
            __import__(module_path)
            print(f"✓ {module_name}")
            succeeded.append(module_name)
        except Exception as e:
            print(f"✗ {module_name}: {e.__class__.__name__}: {e}")
            failed.append((module_name, e))

    print("\n" + "="*60)
    print(f"Results: {len(succeeded)} succeeded, {len(failed)} failed")
    print("="*60)

    if failed:
        print("\nFailed modules:")
        for module_name, error in failed:
            print(f"  - {module_name}: {error.__class__.__name__}")
        sys.exit(1)
    else:
        print("\n✓ All API v1 modules can be imported successfully!")
        sys.exit(0)


if __name__ == "__main__":
    check_api_imports()
