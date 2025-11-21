#!/usr/bin/env python3
"""
Check for missing type annotation imports in Python files.

This script scans Python files and identifies type annotations that are used
but not imported. This helps catch NameError issues before runtime.

Usage:
    python scripts/check_missing_imports.py [path]

    If no path provided, scans pixsim7/backend/main/
"""
import os
import ast
import sys
from pathlib import Path
from typing import Set, Tuple, List, Optional


# Type names that are built-in or from typing module (usually auto-imported)
BUILTIN_TYPES = {
    'int', 'str', 'bool', 'float', 'None', 'list', 'dict', 'tuple', 'set',
    'Any', 'List', 'Dict', 'Optional', 'Union', 'Tuple', 'Set', 'Callable',
}


class TypeAnnotationCollector(ast.NodeVisitor):
    """Collect all type annotation names from an AST"""

    def __init__(self):
        self.annotations: Set[str] = set()

    def visit_arg(self, node: ast.arg) -> None:
        """Visit function argument annotations"""
        if node.annotation:
            self._collect_annotation(node.annotation)
        self.generic_visit(node)

    def visit_AnnAssign(self, node: ast.AnnAssign) -> None:
        """Visit annotated assignments (e.g., x: int = 5)"""
        if node.annotation:
            self._collect_annotation(node.annotation)
        self.generic_visit(node)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        """Visit function return type annotations"""
        if node.returns:
            self._collect_annotation(node.returns)
        self.generic_visit(node)

    def _collect_annotation(self, node: ast.AST) -> None:
        """Recursively collect type names from an annotation node"""
        if isinstance(node, ast.Name):
            self.annotations.add(node.id)
        elif isinstance(node, ast.Subscript):
            # Handle Optional[Type], List[Type], etc.
            if isinstance(node.value, ast.Name):
                self.annotations.add(node.value.id)
            self._collect_annotation(node.value)
            if isinstance(node.slice, ast.Name):
                self.annotations.add(node.slice.id)
            elif hasattr(node.slice, 'elts'):  # Tuple of types
                for elt in node.slice.elts:
                    self._collect_annotation(elt)
        elif isinstance(node, ast.Attribute):
            # Handle module.Type annotations
            pass  # These are usually fine
        elif isinstance(node, ast.Constant):
            # Handle string annotations (forward references)
            if isinstance(node.value, str):
                # Don't add string annotations - they're forward refs
                pass


class ImportCollector(ast.NodeVisitor):
    """Collect all imported names from an AST"""

    def __init__(self):
        self.imported: Set[str] = set()

    def visit_Import(self, node: ast.Import) -> None:
        """Visit import statements"""
        for alias in node.names:
            # For 'import foo.bar', add 'foo'
            self.imported.add(alias.asname or alias.name.split('.')[0])

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        """Visit from...import statements"""
        for alias in node.names:
            # For 'from foo import bar', add 'bar'
            self.imported.add(alias.asname or alias.name)


def check_file(filepath: Path) -> Optional[Tuple[Path, Set[str]]]:
    """
    Check a Python file for missing type annotation imports.

    Returns:
        Tuple of (filepath, missing_imports) if issues found, None otherwise
    """
    try:
        content = filepath.read_text()
        tree = ast.parse(content, filename=str(filepath))

        # Collect imports and annotations
        import_collector = ImportCollector()
        import_collector.visit(tree)

        annotation_collector = TypeAnnotationCollector()
        annotation_collector.visit(tree)

        # Find missing imports
        missing = (
            annotation_collector.annotations
            - import_collector.imported
            - BUILTIN_TYPES
        )

        if missing:
            return (filepath, missing)
        return None

    except Exception as e:
        # Silently skip files that can't be parsed
        return None


def scan_directory(path: Path, pattern: str = "*.py") -> List[Tuple[Path, Set[str]]]:
    """
    Scan a directory for Python files with missing imports.

    Args:
        path: Directory to scan
        pattern: File pattern to match (default: *.py)

    Returns:
        List of (filepath, missing_imports) tuples
    """
    issues = []

    for py_file in path.rglob(pattern):
        # Skip __pycache__ and test files
        if '__pycache__' in str(py_file) or py_file.name.startswith('test_'):
            continue

        result = check_file(py_file)
        if result:
            issues.append(result)

    return issues


def main():
    """Main entry point"""
    # Determine path to scan
    if len(sys.argv) > 1:
        scan_path = Path(sys.argv[1])
    else:
        # Default to backend/main
        scan_path = Path(__file__).parent.parent / "pixsim7" / "backend" / "main"

    if not scan_path.exists():
        print(f"Error: Path does not exist: {scan_path}")
        sys.exit(1)

    print(f"Scanning: {scan_path}")
    print()

    # Scan for issues
    issues = scan_directory(scan_path)

    if not issues:
        print("✓ No missing type annotation imports found")
        return 0

    # Report issues
    print(f"⚠ Found {len(issues)} files with potentially missing imports:")
    print()

    for filepath, missing in sorted(issues):
        try:
            rel_path = filepath.relative_to(Path.cwd())
        except ValueError:
            rel_path = filepath
        print(f"  {rel_path}")
        print(f"    Missing: {', '.join(sorted(missing))}")
        print()

    print(f"Note: Some of these may be false positives (e.g., Pydantic schemas")
    print(f"defined in the same file). Focus on domain models and enums first.")

    return 1


if __name__ == "__main__":
    sys.exit(main())
