#!/usr/bin/env tsx
/**
 * Generates upload context schema/types from upload-context.yaml
 *
 * Source:  pixsim7/backend/main/shared/upload-context.yaml (single source of truth)
 * Outputs:
 *   - pixsim7/backend/main/shared/upload_context_schema.py
 *   - packages/shared/types/src/upload-context.generated.ts
 *
 * Usage:
 *   pnpm upload-context:gen       # Generate files
 *   pnpm upload-context:check     # Verify generated files are current (CI)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';

const CHECK_MODE = process.argv.includes('--check');

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const normalizedDir = process.platform === 'win32' && SCRIPT_DIR.startsWith('/')
  ? SCRIPT_DIR.slice(1)
  : SCRIPT_DIR;

const YAML_PATH = path.resolve(normalizedDir, '../pixsim7/backend/main/shared/upload-context.yaml');
const OUT_PY = path.resolve(normalizedDir, '../pixsim7/backend/main/shared/upload_context_schema.py');
const OUT_TS = path.resolve(normalizedDir, '../packages/shared/types/src/upload-context.generated.ts');

if (!fs.existsSync(YAML_PATH)) {
  console.error(`Missing upload context spec: ${YAML_PATH}`);
  process.exit(1);
}

let spec: Record<string, unknown>;
try {
  spec = yaml.parse(fs.readFileSync(YAML_PATH, 'utf8'));
} catch (err) {
  console.error(`Failed to parse ${YAML_PATH}:`);
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

if (!spec || typeof spec !== 'object') {
  console.error('upload-context.yaml must parse to an object.');
  process.exit(1);
}

if (!('upload_methods' in spec)) {
  console.error('upload-context.yaml must include upload_methods.');
  process.exit(1);
}

const specJson = JSON.stringify(spec, null, 2);

const pyOutput = `# Auto-generated from upload-context.yaml - DO NOT EDIT
# Re-run: pnpm upload-context:gen

from __future__ import annotations

import json
from typing import Any, Dict, Optional

UPLOAD_CONTEXT_SPEC: dict[str, Any] = json.loads(r'''${specJson}''')


def _collect_fields(section: Optional[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    if not section:
        return {}
    fields = section.get("fields", {})
    if not isinstance(fields, dict):
        return {}
    return fields


def get_upload_context_fields(upload_method: Optional[str]) -> dict[str, dict[str, Any]]:
    fields = dict(_collect_fields(UPLOAD_CONTEXT_SPEC.get("common")))
    if upload_method:
        methods = UPLOAD_CONTEXT_SPEC.get("upload_methods", {})
        method_spec = methods.get(upload_method) if isinstance(methods, dict) else None
        if isinstance(method_spec, dict):
            fields.update(_collect_fields(method_spec))
    return fields


def get_upload_context_filter_specs() -> list[dict[str, Any]]:
    specs: list[dict[str, Any]] = []
    methods = UPLOAD_CONTEXT_SPEC.get("upload_methods", {})
    if not isinstance(methods, dict):
        return specs
    for method_key, method_spec in methods.items():
        if not isinstance(method_spec, dict):
            continue
        for field_key, field_spec in _collect_fields(method_spec).items():
            if not isinstance(field_spec, dict):
                continue
            if not field_spec.get("filterable"):
                continue
            label = field_spec.get("label") or field_key.replace("_", " ").title()
            specs.append(
                {
                    "key": field_key,
                    "label": label,
                    "description": field_spec.get("description"),
                    "upload_method": method_key,
                }
            )
    return specs


def _coerce_value(value: Any, field_type: str) -> Any:
    if value is None:
        return None
    if field_type == "string":
        return str(value)
    if field_type == "number":
        if isinstance(value, (int, float)):
            return value
        if isinstance(value, str):
            try:
                return float(value) if "." in value else int(value)
            except ValueError:
                return None
        return None
    if field_type == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in ("true", "1", "yes", "y"):
                return True
            if normalized in ("false", "0", "no", "n"):
                return False
        return None
    return value


def normalize_upload_context(
    upload_method: Optional[str],
    context: Optional[Dict[str, Any]],
    *,
    strict: bool = False,
) -> Dict[str, Any]:
    if context is None:
        return {}
    if not isinstance(context, dict):
        raise ValueError("upload_context must be a JSON object")

    fields = get_upload_context_fields(upload_method)
    allowed = set(fields.keys())
    unknown = [key for key in context.keys() if key not in allowed]
    if unknown and strict:
        raise ValueError(f"Unknown upload_context keys: {', '.join(sorted(unknown))}")

    normalized: Dict[str, Any] = {}
    for key, field_spec in fields.items():
        if key not in context:
            continue
        if not isinstance(field_spec, dict):
            continue
        value = context.get(key)
        if value is None:
            continue
        field_type = field_spec.get("type", "string")
        coerced = _coerce_value(value, field_type)
        if coerced is None:
            continue
        normalized[key] = coerced
    return normalized
`;

const tsOutput = `// Auto-generated from upload-context.yaml - DO NOT EDIT
// Re-run: pnpm upload-context:gen

export type UploadContextFieldType = 'string' | 'number' | 'boolean';

export interface UploadContextFieldSpec {
  type: UploadContextFieldType;
  label?: string;
  description?: string;
  filterable?: boolean;
}

export interface UploadContextMethodSpec {
  label?: string;
  fields: Record<string, UploadContextFieldSpec>;
}

export interface UploadContextSpec {
  version: number;
  common?: {
    fields: Record<string, UploadContextFieldSpec>;
  };
  upload_methods: Record<string, UploadContextMethodSpec>;
}

export const uploadContextSpec: UploadContextSpec = ${specJson} as const;

export type UploadContextMethod = keyof typeof uploadContextSpec.upload_methods;
export type UploadContextFieldValue = string | number | boolean;
export type UploadContextMap = Record<string, UploadContextFieldValue>;
`;

function checkOutput(filePath: string, content: string): void {
  if (!fs.existsSync(filePath)) {
    console.error(`Generated file missing: ${filePath}`);
    process.exit(1);
  }
  const existing = fs.readFileSync(filePath, 'utf8');
  if (existing !== content) {
    console.error(`Generated file out of date: ${filePath}`);
    process.exit(1);
  }
}

if (CHECK_MODE) {
  checkOutput(OUT_PY, pyOutput);
  checkOutput(OUT_TS, tsOutput);
  console.log(`Generated files are current: ${OUT_PY}, ${OUT_TS}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT_PY), { recursive: true });
fs.mkdirSync(path.dirname(OUT_TS), { recursive: true });

fs.writeFileSync(OUT_PY, pyOutput, 'utf8');
fs.writeFileSync(OUT_TS, tsOutput, 'utf8');

console.log(`Generated: ${OUT_PY}`);
console.log(`Generated: ${OUT_TS}`);
