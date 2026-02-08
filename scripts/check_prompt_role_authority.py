#!/usr/bin/env python3
"""
Prompt Role Authority Checker

Prints prompt-role authority ownership from:
1. Pack manifests (`pack.owns_roles`)
2. Pack prompt_roles.yaml authority entries (keywords/action_verbs)
3. Loaded registry effective owners (`PromptRoleDef.source`)

Use `--check` to fail when drift is detected.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import yaml


PROJECT_ROOT = Path(__file__).parent.parent
PLUGINS_ROOT = PROJECT_ROOT / "pixsim7" / "backend" / "main" / "plugins"

# Add project root for local script execution.
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@dataclass(frozen=True)
class PackAuthority:
    plugin: str
    manifest_roles: List[str]
    yaml_roles: List[str]


def _read_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def _normalize_roles(values: List[str]) -> List[str]:
    out: List[str] = []
    for value in values:
        role = str(value).strip().lower()
        if not role:
            continue
        if role not in out:
            out.append(role)
    return out


def _collect_pack_authorities() -> List[PackAuthority]:
    packs: List[PackAuthority] = []
    if not PLUGINS_ROOT.exists():
        return packs

    for plugin_dir in sorted(PLUGINS_ROOT.iterdir(), key=lambda p: p.name):
        if not plugin_dir.is_dir():
            continue
        vocab_dir = plugin_dir / "vocabularies"
        if not vocab_dir.exists():
            continue

        manifest = _read_yaml(vocab_dir / "manifest.yaml")
        pack_meta = manifest.get("pack", {}) if isinstance(manifest, dict) else {}
        pack_kind = str(pack_meta.get("kind", "")).strip().lower()
        manifest_roles = _normalize_roles(pack_meta.get("owns_roles") or [])

        prompt_roles_data = _read_yaml(vocab_dir / "prompt_roles.yaml")
        roles_obj = prompt_roles_data.get("roles", {}) if isinstance(prompt_roles_data, dict) else {}

        yaml_roles: List[str] = []
        if isinstance(roles_obj, dict):
            for role_id, role_data in roles_obj.items():
                if not isinstance(role_data, dict):
                    continue
                keywords = role_data.get("keywords") or []
                action_verbs = role_data.get("action_verbs") or role_data.get("actionVerbs") or []
                if keywords or action_verbs:
                    role = str(role_id).strip().lower()
                    if role and role not in yaml_roles:
                        yaml_roles.append(role)

        # Include only explicit prompt-role packs or packs with prompt-role authority data.
        if pack_kind == "prompt_role_keywords" or manifest_roles or yaml_roles:
            packs.append(
                PackAuthority(
                    plugin=plugin_dir.name,
                    manifest_roles=manifest_roles,
                    yaml_roles=yaml_roles,
                )
            )

    return packs


def _invert_roles(packs: List[PackAuthority], field: str) -> Tuple[Dict[str, str], Dict[str, List[str]]]:
    owner: Dict[str, str] = {}
    duplicates: Dict[str, List[str]] = {}

    for pack in packs:
        roles = getattr(pack, field)
        for role in roles:
            prev = owner.get(role)
            if prev and prev != pack.plugin:
                values = sorted({prev, pack.plugin, *(duplicates.get(role) or [])})
                duplicates[role] = values
            else:
                owner[role] = pack.plugin

    return owner, duplicates


def _load_registry_authority() -> Tuple[Dict[str, str], str | None]:
    try:
        from pixsim7.backend.main.shared.ontology.vocabularies import get_registry, reset_registry

        reset_registry()
        registry = get_registry(reload=True, strict_mode=False)
        result: Dict[str, str] = {}
        for role in registry.all_prompt_roles():
            role_id = str(getattr(role, "id", "")).strip().lower()
            if not role_id:
                continue
            keywords = getattr(role, "keywords", []) or []
            action_verbs = getattr(role, "action_verbs", []) or []
            if not keywords and not action_verbs:
                continue
            source = str(getattr(role, "source", "") or "").strip()
            result[role_id] = source
        return result, None
    except Exception as exc:  # pragma: no cover - explicit reporting path
        return {}, f"{exc.__class__.__name__}: {exc}"


def _source_plugin(source: str) -> str:
    if source.startswith("plugin:"):
        return source.split(":", 1)[1]
    return source


def run(check: bool) -> int:
    packs = _collect_pack_authorities()

    manifest_owner, manifest_dupes = _invert_roles(packs, "manifest_roles")
    yaml_owner, yaml_dupes = _invert_roles(packs, "yaml_roles")

    registry_owner, registry_error = _load_registry_authority()

    roles = sorted(set(manifest_owner) | set(yaml_owner) | set(registry_owner))

    print("=" * 72)
    print("Prompt Role Authority Report")
    print("=" * 72)
    print(f"packs_scanned={len(packs)} roles={len(roles)}")
    print()
    print("role                manifest_owner          yaml_owner              registry_source")
    print("-" * 72)
    for role in roles:
        print(
            f"{role:<20}"
            f"{manifest_owner.get(role, '-'): <24}"
            f"{yaml_owner.get(role, '-'): <24}"
            f"{registry_owner.get(role, '-')} "
        )
    print("-" * 72)

    issues: List[str] = []

    for role, owners in sorted(manifest_dupes.items()):
        issues.append(f"manifest duplicate owners for role '{role}': {owners}")
    for role, owners in sorted(yaml_dupes.items()):
        issues.append(f"yaml duplicate owners for role '{role}': {owners}")

    for role, owner in sorted(manifest_owner.items()):
        yaml_for_role = yaml_owner.get(role)
        if yaml_for_role != owner:
            issues.append(
                f"manifest/yaml mismatch for role '{role}': "
                f"manifest={owner} yaml={yaml_for_role or '-'}"
            )

    for role, owner in sorted(yaml_owner.items()):
        manifest_for_role = manifest_owner.get(role)
        if manifest_for_role != owner:
            issues.append(
                f"yaml/manifest mismatch for role '{role}': "
                f"yaml={owner} manifest={manifest_for_role or '-'}"
            )

    if registry_error:
        issues.append(f"registry load failed: {registry_error}")
    else:
        for role, owner in sorted(yaml_owner.items()):
            registry_source = registry_owner.get(role)
            if not registry_source:
                issues.append(f"registry missing role '{role}'")
                continue
            reg_plugin = _source_plugin(registry_source)
            if reg_plugin != owner:
                issues.append(
                    f"registry owner mismatch for role '{role}': "
                    f"expected={owner} actual={registry_source}"
                )

        for role, source in sorted(registry_owner.items()):
            if role not in yaml_owner:
                issues.append(
                    f"registry has authoritative role '{role}' from {source} "
                    f"but no yaml owner declared"
                )

    if issues:
        print("Issues:")
        for issue in issues:
            print(f"  - {issue}")
        if check:
            return 1
        return 0

    print("No authority drift detected.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Report/check prompt-role authority ownership.")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero when authority drift is detected.",
    )
    args = parser.parse_args()
    return run(check=args.check)


if __name__ == "__main__":
    sys.exit(main())
