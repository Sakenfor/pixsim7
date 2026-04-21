from __future__ import annotations

from pathlib import Path
from typing import Protocol


class PathRegistry(Protocol):
    """Filesystem locations automation needs to write to.

    Narrow by design — only exposes paths automation actually writes. Backend
    keeps owning the path_registry; adapter just forwards the one field.
    """

    @property
    def automation_screenshots_root(self) -> Path:
        """Root directory under which per-execution screenshot dirs are created.

        Automation does `screenshots_root / f"exec-{execution_id}"` itself.
        """
        ...
