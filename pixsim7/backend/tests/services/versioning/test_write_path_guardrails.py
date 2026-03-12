from __future__ import annotations

import ast
from pathlib import Path


PROTECTED_VERSION_FIELDS = {
    "family_id",
    "version_family_id",
    "version_number",
    "parent_version_id",
    "parent_asset_id",
    "parent_character_id",
    "version_message",
    "commit_message",
}


def _function_name(node: ast.Call) -> str | None:
    if isinstance(node.func, ast.Name):
        return node.func.id
    if isinstance(node.func, ast.Attribute):
        return node.func.attr
    return None


def test_version_metadata_writes_are_guarded_to_canonical_paths() -> None:
    services_root = Path(__file__).resolve().parents[3] / "main" / "services"
    assert services_root.exists(), f"Services root not found: {services_root}"

    allowed_setattr_files = {
        (services_root / "versioning" / "base.py").resolve(),
        (services_root / "prompt" / "git" / "versioning_adapter.py").resolve(),
    }
    allowed_ctor_files: set[Path] = set()

    violations: list[str] = []

    for path in services_root.rglob("*.py"):
        source = path.read_text(encoding="utf-8-sig")
        tree = ast.parse(source)
        resolved_path = path.resolve()
        rel_path = path.as_posix()

        for node in ast.walk(tree):
            if isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
                if isinstance(node, ast.Assign):
                    targets = node.targets
                else:
                    targets = [node.target]
                for target in targets:
                    if (
                        isinstance(target, ast.Attribute)
                        and target.attr in PROTECTED_VERSION_FIELDS
                        and resolved_path not in allowed_setattr_files
                    ):
                        violations.append(
                            f"{rel_path}:{node.lineno} direct attribute assignment to '{target.attr}'"
                        )

            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "setattr"
                and len(node.args) >= 2
            ):
                field_name = node.args[1]
                if (
                    isinstance(field_name, ast.Constant)
                    and isinstance(field_name.value, str)
                    and field_name.value in PROTECTED_VERSION_FIELDS
                    and resolved_path not in allowed_setattr_files
                ):
                    violations.append(
                        f"{rel_path}:{node.lineno} setattr write to '{field_name.value}'"
                    )

            if isinstance(node, ast.Call):
                func_name = _function_name(node)
                if func_name in {"PromptVersion", "Asset", "Character"}:
                    for keyword in node.keywords:
                        if (
                            keyword.arg in PROTECTED_VERSION_FIELDS
                            and resolved_path not in allowed_ctor_files
                        ):
                            violations.append(
                                f"{rel_path}:{node.lineno} constructor kw '{keyword.arg}' on {func_name}"
                            )

    assert not violations, (
        "Found direct version metadata writes outside canonical versioning paths:\n"
        + "\n".join(sorted(violations))
    )
