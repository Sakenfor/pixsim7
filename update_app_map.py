#!/usr/bin/env python3
"""
Update APP_MAP.md with generated content from app_map.sources.json.

Reads the registry file and injects a formatted table into APP_MAP.md
between the <!-- APP_MAP:START --> and <!-- APP_MAP:END --> markers.

Usage:
    python update_app_map.py
"""

import json
import re
import sys
from pathlib import Path


def load_registry(registry_path: Path) -> dict:
    """Load the app map registry JSON file."""
    with open(registry_path, "r", encoding="utf-8") as f:
        return json.load(f)


def format_docs(docs: list[str]) -> str:
    """Format doc paths as plain text (not links to avoid validation issues)."""
    if not docs:
        return "-"
    names = []
    for doc in docs:
        name = Path(doc).name
        names.append(f"`{name}`")
    return ", ".join(names)


def format_frontend(paths: list[str]) -> str:
    """Format frontend paths compactly."""
    if not paths:
        return "-"
    compact = []
    for path in paths:
        # Simplify common prefixes
        if path.startswith("apps/main/src/"):
            compact.append(path.replace("apps/main/src/", ""))
        elif path.startswith("packages/"):
            compact.append(path)
        else:
            compact.append(path)
    return ", ".join(f"`{p}`" for p in compact)


def format_backend(modules: list[str]) -> str:
    """Format backend module paths compactly."""
    if not modules:
        return "-"
    compact = []
    for mod in modules:
        # Simplify pixsim7.backend.main prefix
        if mod.startswith("pixsim7.backend.main."):
            compact.append(mod.replace("pixsim7.backend.main.", ""))
        else:
            compact.append(mod)
    return ", ".join(f"`{m}`" for m in compact)


def format_routes(routes: list[str]) -> str:
    """Format routes as a comma-separated list."""
    if not routes:
        return "-"
    return ", ".join(f"`{r}`" for r in routes)


def generate_table(entries: list[dict]) -> str:
    """Generate a markdown table from registry entries."""
    lines = [
        "| Feature | Routes | Docs | Frontend | Backend |",
        "|---------|--------|------|----------|---------|",
    ]

    for entry in entries:
        label = entry.get("label", entry["id"])
        routes = format_routes(entry.get("routes", []))
        docs = format_docs(entry.get("docs", []))
        frontend = format_frontend(entry.get("frontend", []))
        backend = format_backend(entry.get("backend", []))

        lines.append(f"| {label} | {routes} | {docs} | {frontend} | {backend} |")

    return "\n".join(lines)


def update_app_map(app_map_path: Path, registry_path: Path) -> bool:
    """Update APP_MAP.md with generated content from registry."""
    # Load registry
    registry = load_registry(registry_path)
    entries = registry.get("entries", [])

    if not entries:
        print("Warning: No entries found in registry")
        return False

    # Generate table
    table = generate_table(entries)

    # Read current APP_MAP.md
    with open(app_map_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Pattern to match content between markers
    pattern = r"(<!-- APP_MAP:START -->)\n.*?\n(<!-- APP_MAP:END -->)"
    replacement = f"\\1\n{table}\n\\2"

    # Check if markers exist
    if "<!-- APP_MAP:START -->" not in content:
        print("Error: APP_MAP:START marker not found in APP_MAP.md")
        return False

    if "<!-- APP_MAP:END -->" not in content:
        print("Error: APP_MAP:END marker not found in APP_MAP.md")
        return False

    # Replace content between markers
    updated_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

    # Write updated content
    with open(app_map_path, "w", encoding="utf-8") as f:
        f.write(updated_content)

    return True


def main():
    """Main entry point."""
    project_root = Path(__file__).parent
    app_map_path = project_root / "docs" / "APP_MAP.md"
    registry_path = project_root / "docs" / "app_map.sources.json"

    # Verify files exist
    if not registry_path.exists():
        print(f"Error: Registry file not found: {registry_path}")
        sys.exit(1)

    if not app_map_path.exists():
        print(f"Error: APP_MAP.md not found: {app_map_path}")
        sys.exit(1)

    print(f"Reading registry: {registry_path}")
    print(f"Updating: {app_map_path}")

    if update_app_map(app_map_path, registry_path):
        print("APP_MAP.md updated successfully!")
        sys.exit(0)
    else:
        print("Failed to update APP_MAP.md")
        sys.exit(1)


if __name__ == "__main__":
    main()
