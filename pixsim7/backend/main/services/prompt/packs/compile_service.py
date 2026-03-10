"""Backend CUE validation/compile service for prompt pack drafts."""
from __future__ import annotations

import json
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Optional

from pixsim7.backend.main.services.command_runtime import run_subprocess_text

DEFAULT_CUE_TIMEOUT_SECONDS = 8
DEFAULT_MAX_SOURCE_BYTES = 256_000
DEFAULT_MAX_OUTPUT_BYTES = 1_000_000

_CUE_DIAGNOSTIC_LINE_RE = re.compile(
    r"^(?P<source>.+?):(?P<line>\d+):(?P<column>\d+):\s*(?P<message>.+)$"
)


@dataclass(frozen=True)
class PromptPackCompileResult:
    ok: bool
    status: str
    diagnostics: list[dict[str, Any]]
    pack_yaml: Optional[str] = None
    manifest_yaml: Optional[str] = None
    pack_json: Optional[dict[str, Any]] = None
    blocks_json: Optional[list[dict[str, Any]]] = None


class PromptPackCompileService:
    """Validate and compile user-authored prompt-pack CUE source."""

    def __init__(
        self,
        *,
        repo_root: Optional[Path] = None,
        cue_timeout_seconds: int = DEFAULT_CUE_TIMEOUT_SECONDS,
        max_source_bytes: int = DEFAULT_MAX_SOURCE_BYTES,
        max_output_bytes: int = DEFAULT_MAX_OUTPUT_BYTES,
    ) -> None:
        self.repo_root = repo_root or _resolve_repo_root()
        self.cue_root = self.repo_root / "tools" / "cue"
        self.schema_file = self.cue_root / "prompt_packs" / "schema_v1.cue"
        self.cue_binary = _resolve_cue_binary(self.cue_root)
        self.cue_timeout_seconds = cue_timeout_seconds
        self.max_source_bytes = max_source_bytes
        self.max_output_bytes = max_output_bytes

    async def validate_source(
        self,
        *,
        cue_source: str,
        namespace: str,
    ) -> PromptPackCompileResult:
        preflight_error = self._preflight(cue_source=cue_source, namespace=namespace)
        if preflight_error is not None:
            return _compile_failed([preflight_error])

        with TemporaryDirectory(prefix="prompt-pack-validate-") as temp_dir:
            cue_file = Path(temp_dir) / "draft.cue"
            cue_file.write_text(cue_source, encoding="utf-8")

            pack_json = await self._export_json(
                cue_file=cue_file,
                expression="pack",
            )
            if isinstance(pack_json, PromptPackCompileResult):
                return pack_json

            manifest_json = await self._export_json(
                cue_file=cue_file,
                expression="manifest",
            )
            if isinstance(manifest_json, PromptPackCompileResult):
                return manifest_json
            _ = pack_json, manifest_json

        return PromptPackCompileResult(
            ok=True,
            status="compile_ok",
            diagnostics=[],
        )

    async def compile_source(
        self,
        *,
        cue_source: str,
        namespace: str,
    ) -> PromptPackCompileResult:
        preflight_error = self._preflight(cue_source=cue_source, namespace=namespace)
        if preflight_error is not None:
            return _compile_failed([preflight_error])

        with TemporaryDirectory(prefix="prompt-pack-compile-") as temp_dir:
            cue_file = Path(temp_dir) / "draft.cue"
            cue_file.write_text(cue_source, encoding="utf-8")

            pack_json = await self._export_json(
                cue_file=cue_file,
                expression="pack",
            )
            if isinstance(pack_json, PromptPackCompileResult):
                return pack_json

            manifest_json = await self._export_json(
                cue_file=cue_file,
                expression="manifest",
            )
            if isinstance(manifest_json, PromptPackCompileResult):
                return manifest_json
            _ = manifest_json

            pack_yaml = await self._export_yaml(
                cue_file=cue_file,
                expression="pack",
            )
            if isinstance(pack_yaml, PromptPackCompileResult):
                return pack_yaml

            manifest_yaml = await self._export_yaml(
                cue_file=cue_file,
                expression="manifest",
            )
            if isinstance(manifest_yaml, PromptPackCompileResult):
                return manifest_yaml

        blocks = pack_json.get("blocks")
        blocks_json = (
            [dict(item) for item in blocks if isinstance(item, dict)]
            if isinstance(blocks, list)
            else []
        )
        return PromptPackCompileResult(
            ok=True,
            status="compile_ok",
            diagnostics=[],
            pack_yaml=pack_yaml,
            manifest_yaml=manifest_yaml,
            pack_json=pack_json,
            blocks_json=blocks_json,
        )

    def _preflight(self, *, cue_source: str, namespace: str) -> Optional[dict[str, Any]]:
        if not self.schema_file.exists():
            return _diag(
                code="cue.schema_missing",
                message=f"Prompt pack schema file not found: {self.schema_file}",
            )

        source = cue_source or ""
        if not source.strip():
            return _diag(
                code="cue.empty_source",
                message="cue_source is empty",
            )

        source_size = len(source.encode("utf-8"))
        if source_size > self.max_source_bytes:
            return _diag(
                code="cue.source_too_large",
                message=f"cue_source exceeds {self.max_source_bytes} bytes",
            )

        ns = str(namespace or "").strip().lower()
        if ns == "system" or ns.startswith("system.") or ns == "core" or ns.startswith("core."):
            return _diag(
                code="namespace.reserved",
                message="namespace cannot use reserved system/core prefixes",
            )
        if not ns.startswith("user."):
            return _diag(
                code="namespace.invalid",
                message="namespace must start with 'user.'",
            )

        return None

    async def _export_json(
        self,
        *,
        cue_file: Path,
        expression: str,
    ) -> dict[str, Any] | PromptPackCompileResult:
        command = self._cue_export_command(
            cue_file=cue_file,
            expression=expression,
            out_format="json",
        )
        raw_output = await self._run_command(
            command=command,
            stage=f"{expression}.json",
            cue_file=cue_file,
        )
        if isinstance(raw_output, PromptPackCompileResult):
            return raw_output

        try:
            parsed = json.loads(raw_output)
        except json.JSONDecodeError as exc:
            return _compile_failed(
                [
                    _diag(
                        code="cue.invalid_json_output",
                        message=f"Could not parse CUE JSON output for '{expression}': {exc}",
                    )
                ]
            )

        if not isinstance(parsed, dict):
            return _compile_failed(
                [
                    _diag(
                        code="cue.unexpected_json_output",
                        message=f"CUE expression '{expression}' must resolve to an object",
                    )
                ]
            )
        return parsed

    async def _export_yaml(
        self,
        *,
        cue_file: Path,
        expression: str,
    ) -> str | PromptPackCompileResult:
        command = self._cue_export_command(
            cue_file=cue_file,
            expression=expression,
            out_format="yaml",
        )
        raw_output = await self._run_command(
            command=command,
            stage=f"{expression}.yaml",
            cue_file=cue_file,
        )
        if isinstance(raw_output, PromptPackCompileResult):
            return raw_output
        return raw_output

    async def _run_command(
        self,
        *,
        command: list[str],
        stage: str,
        cue_file: Path,
    ) -> str | PromptPackCompileResult:
        try:
            result = await run_subprocess_text(
                command,
                input_text="",
                timeout=self.cue_timeout_seconds,
            )
        except subprocess.TimeoutExpired:
            return _compile_failed(
                [
                    _diag(
                        code="cue.timeout",
                        message=f"CUE command timed out after {self.cue_timeout_seconds}s",
                        source=cue_file.name,
                    )
                ]
            )
        except FileNotFoundError:
            return _compile_failed(
                [
                    _diag(
                        code="cue.binary_not_found",
                        message=f"CUE binary not found: {self.cue_binary}",
                        source=cue_file.name,
                    )
                ]
            )
        except PermissionError:
            return _compile_failed(
                [
                    _diag(
                        code="cue.binary_permission_denied",
                        message=f"Permission denied while running CUE binary: {self.cue_binary}",
                        source=cue_file.name,
                    )
                ]
            )

        output = (result.stdout or "").strip()
        if len(output.encode("utf-8")) > self.max_output_bytes:
            return _compile_failed(
                [
                    _diag(
                        code="cue.output_too_large",
                        message=f"CUE output exceeded {self.max_output_bytes} bytes for stage '{stage}'",
                        source=cue_file.name,
                    )
                ]
            )

        if result.returncode != 0:
            error_text = "\n".join(
                line for line in [result.stderr.strip(), result.stdout.strip()] if line
            ).strip()
            diagnostics = _parse_cue_diagnostics(
                text=error_text,
                fallback_code=_fallback_error_code(error_text),
            )
            if not diagnostics:
                diagnostics = [
                    _diag(
                        code="cue.export_failed",
                        message=f"CUE export failed for stage '{stage}'",
                        source=cue_file.name,
                    )
                ]
            return _compile_failed(diagnostics)

        return result.stdout or ""

    def _cue_export_command(
        self,
        *,
        cue_file: Path,
        expression: str,
        out_format: str,
    ) -> list[str]:
        return [
            str(self.cue_binary),
            "export",
            str(self.schema_file),
            str(cue_file),
            "-e",
            expression,
            "--out",
            out_format,
        ]


def _resolve_repo_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "tools" / "cue" / "prompt_packs" / "schema_v1.cue").exists():
            return parent
    return here.parents[7] if len(here.parents) > 7 else here.parent


def _resolve_cue_binary(cue_root: Path) -> str:
    env_bin = os.getenv("CUE_BIN", "").strip()
    if env_bin:
        return env_bin

    candidates = [
        cue_root / "cue.exe",
        cue_root / "cue",
        cue_root / "bin" / "cue.exe",
        cue_root / "bin" / "cue",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    return "cue"


def _fallback_error_code(raw_text: str) -> str:
    message = raw_text.lower()
    if "expected" in message or "syntax" in message or "invalid character" in message:
        return "cue.syntax_error"
    if "incomplete value" in message or "conflicting values" in message or "field not allowed" in message:
        return "cue.contract_error"
    return "cue.export_failed"


def _parse_cue_diagnostics(text: str, *, fallback_code: str) -> list[dict[str, Any]]:
    if not text:
        return []

    diagnostics: list[dict[str, Any]] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        match = _CUE_DIAGNOSTIC_LINE_RE.match(line)
        if not match:
            diagnostics.append(
                _diag(
                    code=fallback_code,
                    message=line,
                )
            )
            continue

        message = match.group("message").strip()
        diagnostics.append(
            _diag(
                code=fallback_code,
                message=message,
                line=int(match.group("line")),
                column=int(match.group("column")),
                source=Path(match.group("source")).name,
            )
        )
    return diagnostics


def _diag(
    *,
    code: str,
    message: str,
    line: Optional[int] = None,
    column: Optional[int] = None,
    source: Optional[str] = None,
) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "severity": "error",
        "line": line,
        "column": column,
        "source": source,
    }


def _compile_failed(diagnostics: list[dict[str, Any]]) -> PromptPackCompileResult:
    return PromptPackCompileResult(
        ok=False,
        status="compile_failed",
        diagnostics=diagnostics,
    )
