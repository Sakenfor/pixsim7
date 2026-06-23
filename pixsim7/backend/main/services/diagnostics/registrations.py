"""Side-effect registrations of built-in diagnostics.

Imported once from ``api.v1.dev_testing_diagnostics`` at app startup.  Add
new built-in diagnostics by importing their class here and calling
``diagnostic_registry.register_item``.

Today only the synthetic placeholder is registered; real diagnostics
(early-CDN, status-poller stress, embedding-daemon health, …) are tracked
in follow-ups.
"""

from __future__ import annotations

from .early_cdn_openapi import EarlyCdnOpenapiDiagnostic
from .early_cdn_webapi import EarlyCdnWebapiDiagnostic
from .pixverse_extend_last_frame import PixverseExtendLastFrameDiagnostic
from .pixverse_image_salvage import PixverseImageSalvageDiagnostic
from .registry import diagnostic_registry
from .scan_plan_consistency import ScanPlanConsistencyDiagnostic
from .scan_suspicious_videos import ScanSuspiciousVideosDiagnostic
from .shell_script import ShellScriptDiagnostic
from .synthetic import SyntheticDiagnostic


def _register_builtins() -> None:
    for cls in (
        SyntheticDiagnostic,
        ScanSuspiciousVideosDiagnostic,
        ShellScriptDiagnostic,
        PixverseExtendLastFrameDiagnostic,
        EarlyCdnWebapiDiagnostic,
        EarlyCdnOpenapiDiagnostic,
        PixverseImageSalvageDiagnostic,
        ScanPlanConsistencyDiagnostic,
    ):
        if not diagnostic_registry.has(cls.spec.id):
            diagnostic_registry.register_item(cls())


_register_builtins()
