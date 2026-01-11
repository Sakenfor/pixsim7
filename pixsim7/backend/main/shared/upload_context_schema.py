# Auto-generated from upload-context.yaml - DO NOT EDIT
# Re-run: pnpm upload-context:gen

from __future__ import annotations

import json
from typing import Any, Dict, Optional

UPLOAD_CONTEXT_SPEC: dict[str, Any] = json.loads(r'''{
  "version": 1,
  "common": {
    "fields": {
      "client": {
        "type": "string",
        "label": "Client",
        "description": "Source client identifier (e.g., chrome_extension)"
      },
      "feature": {
        "type": "string",
        "label": "Feature",
        "description": "Feature or flow that initiated the upload"
      },
      "source": {
        "type": "string",
        "label": "Source",
        "description": "Sub-source or tool identifier (e.g., video_player)"
      }
    }
  },
  "upload_methods": {
    "web": {
      "label": "Web Import",
      "fields": {
        "source_url": {
          "type": "string",
          "label": "Source URL",
          "description": "Full page URL where the asset was found"
        },
        "source_site": {
          "type": "string",
          "label": "Domain",
          "description": "Website domain (e.g., twitter.com)",
          "filterable": true
        }
      }
    },
    "local": {
      "label": "Local",
      "fields": {
        "source_folder_id": {
          "type": "string",
          "label": "Source Folder",
          "description": "Local folder ID"
        },
        "source_relative_path": {
          "type": "string",
          "label": "Source Path",
          "description": "Relative file path within the folder"
        }
      }
    },
    "video_capture": {
      "label": "Video Capture",
      "fields": {
        "source_url": {
          "type": "string",
          "label": "Source URL",
          "description": "Original video URL (if captured from web)"
        },
        "source_site": {
          "type": "string",
          "label": "Source Site",
          "description": "Website domain (e.g., twitter.com)",
          "filterable": true
        },
        "source_folder": {
          "type": "string",
          "label": "Source Folder",
          "description": "Top-level folder for local video captures",
          "filterable": true
        },
        "source_filename": {
          "type": "string",
          "label": "Source Video",
          "description": "Source video file name",
          "filterable": true
        },
        "source_asset_id": {
          "type": "number",
          "label": "Source Asset",
          "description": "Asset ID captured from the library"
        },
        "frame_time": {
          "type": "number",
          "label": "Frame Time",
          "description": "Timestamp in seconds"
        },
        "has_region": {
          "type": "boolean",
          "label": "Has Region",
          "description": "True if a crop/region was selected"
        }
      }
    }
  }
}''')


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
