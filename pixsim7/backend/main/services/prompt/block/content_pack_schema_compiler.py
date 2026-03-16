"""Schema-first block compiler extracted from content_pack_loader."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from pixsim7.backend.main.services.prompt.block.capabilities import normalize_capability_ids
from pixsim7.backend.main.services.prompt.block.family_contract_validation import (
    load_prompt_block_tag_keys,
)
from pixsim7.backend.main.services.prompt.block.op_signatures import (
    get_op_signature,
    validate_signature_contract,
)
from pixsim7.backend.main.services.prompt.block.tag_dictionary import (
    get_block_tag_value_alias_map,
)


class SchemaCompilerValidationError(ValueError):
    """Raised when schema-first block definitions are invalid."""


def _normalize_tag_value_with_aliases(
    *,
    tag_key: str,
    value: Any,
    value_alias_map: Dict[str, Dict[str, str]],
) -> Any:
    aliases = value_alias_map.get(tag_key) or {}
    if not aliases:
        return value

    def _normalize_scalar(item: Any) -> Any:
        if isinstance(item, str):
            return aliases.get(item, item)
        return item

    if isinstance(value, list):
        return [_normalize_scalar(item) for item in value]
    return _normalize_scalar(value)


def _derive_variant_tags_from_op_args(
    *,
    schema_params: List[Dict[str, Any]],
    effective_op_args: Dict[str, Any],
    src: Path,
    variant_index: int,
    known_tag_keys: frozenset[str],
    value_alias_map: Dict[str, Dict[str, str]],
) -> Dict[str, Any]:
    derived_tags: Dict[str, Any] = {}
    for param in schema_params:
        param_key = str(param.get("key") or "").strip()
        if not param_key:
            continue

        raw_tag_key = param.get("tag_key")
        explicit_tag_key = isinstance(raw_tag_key, str)
        if explicit_tag_key:
            tag_key = str(raw_tag_key).strip()
        elif known_tag_keys and param_key in known_tag_keys:
            tag_key = param_key
        elif not known_tag_keys:
            # Registry unavailable: fall back to key-name mapping.
            tag_key = param_key
        else:
            # No explicit tag mapping and param key is not a canonical tag key.
            continue
        if not tag_key:
            continue

        if explicit_tag_key and known_tag_keys and tag_key not in known_tag_keys:
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.op.params key '{param_key}' references unknown tag_key '{tag_key}' "
                f"(not registered in prompt_block_tags)"
            )

        if param_key not in effective_op_args:
            continue
        raw_value = effective_op_args.get(param_key)
        if raw_value is None:
            continue
        if isinstance(raw_value, (dict, set, tuple)):
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.variants[{variant_index}].op_args.{param_key} "
                f"cannot map to tags because value type '{type(raw_value).__name__}' is unsupported"
            )
        if isinstance(raw_value, list):
            for item_index, item in enumerate(raw_value):
                if isinstance(item, (dict, set, tuple)):
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.variants[{variant_index}].op_args.{param_key}[{item_index}] "
                        f"cannot map to tags because value type '{type(item).__name__}' is unsupported"
                    )

        derived_tags[tag_key] = _normalize_tag_value_with_aliases(
            tag_key=tag_key,
            value=raw_value,
            value_alias_map=value_alias_map,
        )
    return derived_tags


def _compile_schema_blocks(*, block_schema: Any, src: Path) -> List[Dict[str, Any]]:
    """Compile schema-first block definitions into normalized block objects.

    Supported shape:
      block_schema:
        id_prefix: core.camera.motion
        text_template: "Camera motion token: {variant}."
        category: camera
        role: camera
        capabilities: [camera.motion]
        tags: {modifier_family: camera_motion}
        variants:
          - key: zoom
            tags: {camera_motion: zoom}
    """
    def _normalize_op_modalities(*, value: Any, field: str) -> List[str]:
        if value is None:
            return []
        if not isinstance(value, list) or not value:
            raise SchemaCompilerValidationError(f"{src}: {field} must be a non-empty list")

        normalized: List[str] = []
        for idx, raw in enumerate(value):
            if not isinstance(raw, str) or not raw.strip():
                raise SchemaCompilerValidationError(
                    f"{src}: {field}[{idx}] must be a non-empty string"
                )
            token = raw.strip().lower()
            if token not in {"image", "video", "both"}:
                raise SchemaCompilerValidationError(
                    f"{src}: {field}[{idx}] must be one of: image, video, both"
                )
            if token == "both":
                for expanded in ("image", "video"):
                    if expanded not in normalized:
                        normalized.append(expanded)
            elif token not in normalized:
                normalized.append(token)
        return normalized

    def _derive_modality_support_tag(modalities: List[str]) -> str | None:
        has_image = "image" in modalities
        has_video = "video" in modalities
        if has_image and has_video:
            return "both"
        if has_image:
            return "image"
        if has_video:
            return "video"
        return None

    def _normalize_block_mode(*, value: Any) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str) or not value.strip():
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.mode must be one of: surface, hybrid, op"
            )
        mode = value.strip().lower()
        if mode not in {"surface", "hybrid", "op"}:
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.mode must be one of: surface, hybrid, op"
            )
        return mode

    def _normalize_descriptors_map(*, value: Any, field: str) -> Dict[str, Any]:
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise SchemaCompilerValidationError(f"{src}: {field} must be an object")
        normalized: Dict[str, Any] = {}
        for raw_key, raw_value in value.items():
            key_text = str(raw_key).strip()
            if not key_text:
                raise SchemaCompilerValidationError(
                    f"{src}: {field} keys must be non-empty strings"
                )
            normalized[key_text] = raw_value
        return normalized

    def _normalize_schema_op(*, value: Any) -> Dict[str, Any] | None:
        if value is None:
            return None
        if not isinstance(value, dict):
            raise SchemaCompilerValidationError(f"{src}: block_schema.op must be an object")

        op_id = value.get("op_id")
        if op_id is not None and (not isinstance(op_id, str) or not op_id.strip()):
            raise SchemaCompilerValidationError(f"{src}: block_schema.op.op_id must be a non-empty string")
        op_id_text = op_id.strip() if isinstance(op_id, str) else None

        op_id_template = value.get("op_id_template")
        if op_id_template is not None and (not isinstance(op_id_template, str) or not op_id_template.strip()):
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.op.op_id_template must be a non-empty string"
            )
        op_id_template_text = op_id_template.strip() if isinstance(op_id_template, str) else None

        if bool(op_id_text) == bool(op_id_template_text):
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.op requires exactly one of op_id or op_id_template"
            )

        signature_id = value.get("signature_id")
        if signature_id is not None and (not isinstance(signature_id, str) or not signature_id.strip()):
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.op.signature_id must be a non-empty string"
            )
        signature_id_text = signature_id.strip() if isinstance(signature_id, str) else None

        refs = value.get("refs")
        normalized_refs: List[Dict[str, Any]] = []
        if refs is not None:
            if not isinstance(refs, list):
                raise SchemaCompilerValidationError(f"{src}: block_schema.op.refs must be a list")
            for idx, raw_ref in enumerate(refs):
                if not isinstance(raw_ref, dict):
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.refs[{idx}] must be an object"
                    )
                ref_key = raw_ref.get("key")
                if not isinstance(ref_key, str) or not ref_key.strip():
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.refs[{idx}].key must be a non-empty string"
                    )
                ref_capability = raw_ref.get("capability")
                if not isinstance(ref_capability, str) or not ref_capability.strip():
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.refs[{idx}].capability must be a non-empty string"
                    )
                required = raw_ref.get("required", False)
                if not isinstance(required, bool):
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.refs[{idx}].required must be a boolean"
                    )
                many = raw_ref.get("many", False)
                if not isinstance(many, bool):
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.refs[{idx}].many must be a boolean"
                    )
                description = raw_ref.get("description")
                if description is not None and not isinstance(description, str):
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.refs[{idx}].description must be a string"
                    )

                normalized_ref = dict(raw_ref)
                normalized_ref["key"] = ref_key.strip()
                normalized_ref["capability"] = ref_capability.strip()
                normalized_ref["required"] = required
                normalized_ref["many"] = many
                normalized_refs.append(normalized_ref)

        params = value.get("params")
        normalized_params: List[Dict[str, Any]] = []
        if params is not None:
            if not isinstance(params, list):
                raise SchemaCompilerValidationError(f"{src}: block_schema.op.params must be a list")
            for idx, raw_param in enumerate(params):
                if not isinstance(raw_param, dict):
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.params[{idx}] must be an object"
                    )

                param_key = raw_param.get("key")
                if not isinstance(param_key, str) or not param_key.strip():
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.params[{idx}].key must be a non-empty string"
                    )
                param_type = raw_param.get("type")
                if not isinstance(param_type, str) or not param_type.strip():
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.params[{idx}].type must be a non-empty string"
                    )
                param_type = param_type.strip().lower()
                if param_type not in {"string", "number", "integer", "boolean", "enum", "ref"}:
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.params[{idx}].type must be one of: string, number, integer, boolean, enum, ref"
                    )

                required = raw_param.get("required", False)
                if not isinstance(required, bool):
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.params[{idx}].required must be a boolean"
                    )
                description = raw_param.get("description")
                if description is not None and not isinstance(description, str):
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.params[{idx}].description must be a string"
                    )
                tag_key = raw_param.get("tag_key")
                if tag_key is not None and (not isinstance(tag_key, str) or not tag_key.strip()):
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.params[{idx}].tag_key must be a non-empty string when provided"
                    )

                enum_values = raw_param.get("enum")
                if enum_values is not None:
                    if not isinstance(enum_values, list) or not enum_values:
                        raise SchemaCompilerValidationError(
                            f"{src}: block_schema.op.params[{idx}].enum must be a non-empty list"
                        )
                    for enum_index, enum_item in enumerate(enum_values):
                        if not isinstance(enum_item, str) or not enum_item.strip():
                            raise SchemaCompilerValidationError(
                                f"{src}: block_schema.op.params[{idx}].enum[{enum_index}] must be a non-empty string"
                            )

                if param_type == "enum" and enum_values is None:
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.params[{idx}] type=enum requires enum values"
                    )

                ref_capability = raw_param.get("ref_capability")
                if param_type == "ref":
                    if not isinstance(ref_capability, str) or not ref_capability.strip():
                        raise SchemaCompilerValidationError(
                            f"{src}: block_schema.op.params[{idx}] type=ref requires ref_capability"
                        )
                elif ref_capability is not None and not isinstance(ref_capability, str):
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.params[{idx}].ref_capability must be a string"
                    )

                minimum = raw_param.get("minimum")
                if minimum is not None and not isinstance(minimum, (int, float)):
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.params[{idx}].minimum must be a number"
                    )
                maximum = raw_param.get("maximum")
                if maximum is not None and not isinstance(maximum, (int, float)):
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.params[{idx}].maximum must be a number"
                    )

                normalized_param = dict(raw_param)
                normalized_param["key"] = param_key.strip()
                normalized_param["type"] = param_type
                normalized_param["required"] = required
                if isinstance(tag_key, str):
                    normalized_param["tag_key"] = tag_key.strip()
                if enum_values is not None:
                    normalized_param["enum"] = [str(item).strip() for item in enum_values]
                if isinstance(ref_capability, str):
                    normalized_param["ref_capability"] = ref_capability.strip()
                normalized_params.append(normalized_param)

        default_args = value.get("default_args")
        if default_args is None:
            normalized_default_args: Dict[str, Any] = {}
        else:
            if not isinstance(default_args, dict):
                raise SchemaCompilerValidationError(f"{src}: block_schema.op.default_args must be an object")
            normalized_default_args = {}
            for raw_key, raw_value in default_args.items():
                key_text = str(raw_key).strip()
                if not key_text:
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.default_args keys must be non-empty strings"
                    )
                normalized_default_args[key_text] = raw_value

        modalities = _normalize_op_modalities(value=value.get("modalities"), field="block_schema.op.modalities")
        if signature_id_text is not None:
            signature = get_op_signature(signature_id_text)
            if signature is None:
                raise SchemaCompilerValidationError(
                    f"{src}: block_schema.op.signature_id '{signature_id_text}' is not registered"
                )
            signature_errors = validate_signature_contract(
                signature=signature,
                op_id=op_id_text,
                op_id_template=op_id_template_text,
                params=normalized_params,
                refs=normalized_refs,
                modalities=modalities,
            )
            if signature_errors:
                details = "; ".join(signature_errors)
                raise SchemaCompilerValidationError(
                    f"{src}: block_schema.op does not satisfy signature '{signature_id_text}': {details}"
                )

        normalized_op: Dict[str, Any] = {}
        for key, entry in value.items():
            if key in {"op_id", "op_id_template", "signature_id", "modalities", "refs", "params", "default_args"}:
                continue
            normalized_op[key] = entry

        if op_id_text is not None:
            normalized_op["op_id"] = op_id_text
        if op_id_template_text is not None:
            normalized_op["op_id_template"] = op_id_template_text
        if signature_id_text is not None:
            normalized_op["signature_id"] = signature_id_text

        if modalities:
            normalized_op["modalities"] = modalities
        if normalized_refs:
            normalized_op["refs"] = normalized_refs
        if normalized_params:
            normalized_op["params"] = normalized_params
        if normalized_default_args:
            normalized_op["default_args"] = normalized_default_args
        return normalized_op

    if block_schema is None:
        return []
    if not isinstance(block_schema, dict):
        raise SchemaCompilerValidationError(f"{src}: block_schema must be an object")

    id_prefix = block_schema.get("id_prefix")
    if not isinstance(id_prefix, str) or not id_prefix.strip():
        raise SchemaCompilerValidationError(f"{src}: block_schema.id_prefix must be a non-empty string")
    id_prefix = id_prefix.strip().rstrip(".")
    if not id_prefix:
        raise SchemaCompilerValidationError(f"{src}: block_schema.id_prefix must not be empty")

    text_template = block_schema.get("text_template")
    if text_template is not None and not isinstance(text_template, str):
        raise SchemaCompilerValidationError(f"{src}: block_schema.text_template must be a string")

    base_descriptors = _normalize_descriptors_map(
        value=block_schema.get("descriptors"),
        field="block_schema.descriptors",
    )

    base_tags = block_schema.get("tags", {})
    if base_tags is None:
        base_tags = {}
    if not isinstance(base_tags, dict):
        raise SchemaCompilerValidationError(f"{src}: block_schema.tags must be an object")

    variants = block_schema.get("variants")
    if not isinstance(variants, list) or not variants:
        raise SchemaCompilerValidationError(f"{src}: block_schema.variants must be a non-empty list")

    schema_op = _normalize_schema_op(value=block_schema.get("op"))
    block_mode = _normalize_block_mode(value=block_schema.get("mode"))
    if block_mode is None:
        declares_ops = schema_op is not None or any(
            isinstance(item, dict)
            and any(field in item for field in ("op_id", "op_modalities", "op_args", "ref_bindings"))
            for item in variants
        )
        if declares_ops:
            has_text_template = isinstance(text_template, str)
            has_variant_text = any(
                isinstance(item, dict)
                and isinstance(item.get("text"), str)
                and bool(item.get("text").strip())
                for item in variants
            )
            block_mode = "hybrid" if has_text_template or has_variant_text else "op"
        else:
            block_mode = "surface"

    reserved_schema_keys = {"id_prefix", "mode", "text_template", "descriptors", "tags", "variants", "op"}
    base_block = {k: v for k, v in block_schema.items() if k not in reserved_schema_keys}
    known_tag_keys = load_prompt_block_tag_keys()
    tag_value_alias_map = get_block_tag_value_alias_map()

    compiled: List[Dict[str, Any]] = []
    for i, variant in enumerate(variants):
        if not isinstance(variant, dict):
            raise SchemaCompilerValidationError(f"{src}: block_schema.variants[{i}] must be an object")

        variant_key_raw = variant.get("key", variant.get("id"))
        if not isinstance(variant_key_raw, str) or not variant_key_raw.strip():
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.variants[{i}].key is required and must be a non-empty string"
            )
        variant_key = variant_key_raw.strip()

        explicit_block_id = variant.get("block_id")
        if explicit_block_id is not None and (not isinstance(explicit_block_id, str) or not explicit_block_id.strip()):
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.variants[{i}].block_id must be a non-empty string when provided"
            )
        block_id = explicit_block_id.strip() if isinstance(explicit_block_id, str) else f"{id_prefix}.{variant_key}"

        variant_tags = variant.get("tags", {})
        if variant_tags is None:
            variant_tags = {}
        if not isinstance(variant_tags, dict):
            raise SchemaCompilerValidationError(f"{src}: block_schema.variants[{i}].tags must be an object")
        variant_descriptors = _normalize_descriptors_map(
            value=variant.get("descriptors"),
            field=f"block_schema.variants[{i}].descriptors",
        )

        text = variant.get("text")
        if text is not None and not isinstance(text, str):
            raise SchemaCompilerValidationError(f"{src}: block_schema.variants[{i}].text must be a string")
        if text is None and text_template is not None:
            try:
                text = text_template.format(variant=variant_key)
            except Exception as exc:
                raise SchemaCompilerValidationError(
                    f"{src}: block_schema.text_template failed for variant '{variant_key}': {exc}"
                ) from exc

        variant_op_id = variant.get("op_id")
        if variant_op_id is not None and (not isinstance(variant_op_id, str) or not variant_op_id.strip()):
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.variants[{i}].op_id must be a non-empty string"
            )
        variant_op_id_text = variant_op_id.strip() if isinstance(variant_op_id, str) else None

        variant_op_args_raw = variant.get("op_args")
        if variant_op_args_raw is None:
            variant_op_args: Dict[str, Any] = {}
        elif not isinstance(variant_op_args_raw, dict):
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.variants[{i}].op_args must be an object"
            )
        else:
            variant_op_args = {}
            for raw_key, raw_value in variant_op_args_raw.items():
                arg_key = str(raw_key).strip()
                if not arg_key:
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.variants[{i}].op_args keys must be non-empty strings"
                    )
                variant_op_args[arg_key] = raw_value

        variant_ref_bindings_raw = variant.get("ref_bindings")
        if variant_ref_bindings_raw is None:
            variant_ref_bindings: Dict[str, str] = {}
        elif not isinstance(variant_ref_bindings_raw, dict):
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.variants[{i}].ref_bindings must be an object"
            )
        else:
            variant_ref_bindings = {}
            for raw_key, raw_value in variant_ref_bindings_raw.items():
                ref_key = str(raw_key).strip()
                if not ref_key:
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.variants[{i}].ref_bindings keys must be non-empty strings"
                    )
                if not isinstance(raw_value, str) or not raw_value.strip():
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.variants[{i}].ref_bindings.{ref_key} must be a non-empty string"
                    )
                variant_ref_bindings[ref_key] = raw_value.strip()

        variant_op_modalities = _normalize_op_modalities(
            value=variant.get("op_modalities"),
            field=f"block_schema.variants[{i}].op_modalities",
        )

        reserved_variant_keys = {
            "key", "id", "block_id", "text", "tags",
            "op_id", "op_modalities", "op_args", "ref_bindings", "descriptors",
        }
        block = dict(base_block)
        for key, value in variant.items():
            if key in reserved_variant_keys:
                continue
            block[key] = value

        tags = dict(base_tags)
        tags.update(variant_tags)
        tags.setdefault("variant", variant_key)
        effective_descriptors = dict(base_descriptors)
        effective_descriptors.update(variant_descriptors)

        effective_op_id: str | None = variant_op_id_text
        if effective_op_id is None and schema_op is not None:
            template_id = schema_op.get("op_id_template")
            fixed_op_id = schema_op.get("op_id")
            if isinstance(template_id, str) and template_id:
                try:
                    effective_op_id = template_id.format(variant=variant_key)
                except Exception as exc:
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.op.op_id_template failed for variant '{variant_key}': {exc}"
                    ) from exc
            elif isinstance(fixed_op_id, str) and fixed_op_id:
                effective_op_id = fixed_op_id

        has_variant_op_fields = any(
            field in variant
            for field in ("op_id", "op_modalities", "op_args", "ref_bindings")
        )
        if effective_op_id is None and has_variant_op_fields:
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.variants[{i}] defines op fields but no op_id could be resolved"
            )

        has_text = isinstance(text, str) and bool(text.strip())
        has_op = isinstance(effective_op_id, str) and bool(effective_op_id.strip())
        if block_mode == "surface" and not has_text:
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.variants[{i}] mode=surface requires text or text_template output"
            )
        if block_mode == "hybrid":
            if not has_text:
                raise SchemaCompilerValidationError(
                    f"{src}: block_schema.variants[{i}] mode=hybrid requires text or text_template output"
                )
            if not has_op:
                raise SchemaCompilerValidationError(
                    f"{src}: block_schema.variants[{i}] mode=hybrid requires op_id resolution"
                )
        if block_mode == "op" and not has_op:
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.variants[{i}] mode=op requires op_id resolution"
            )
        # Compile-time renderability guard:
        # hybrid/op blocks should keep at least one human-inspectable surface.
        image_surface_tag = tags.get("image_surface")
        video_surface_tag = tags.get("video_surface")
        has_surface_hint = (
            (isinstance(image_surface_tag, str) and bool(image_surface_tag.strip()))
            or (isinstance(video_surface_tag, str) and bool(video_surface_tag.strip()))
        )
        if block_mode in {"hybrid", "op"} and not (has_text or has_surface_hint):
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.variants[{i}] mode={block_mode} requires text or image_surface/video_surface tags"
            )

        schema_modalities: List[str] = []
        if schema_op is not None:
            schema_modalities = list(schema_op.get("modalities") or [])

        effective_modalities = variant_op_modalities or schema_modalities

        schema_default_args: Dict[str, Any] = {}
        if schema_op is not None and isinstance(schema_op.get("default_args"), dict):
            schema_default_args = dict(schema_op.get("default_args") or {})
        effective_op_args = dict(schema_default_args)
        effective_op_args.update(variant_op_args)

        schema_refs: List[Dict[str, Any]] = []
        if schema_op is not None and isinstance(schema_op.get("refs"), list):
            schema_refs = [dict(item) for item in schema_op.get("refs") or [] if isinstance(item, dict)]

        schema_params: List[Dict[str, Any]] = []
        if schema_op is not None and isinstance(schema_op.get("params"), list):
            schema_params = [dict(item) for item in schema_op.get("params") or [] if isinstance(item, dict)]

        derived_op_tags = _derive_variant_tags_from_op_args(
            schema_params=schema_params,
            effective_op_args=effective_op_args,
            src=src,
            variant_index=i,
            known_tag_keys=known_tag_keys,
            value_alias_map=tag_value_alias_map,
        )
        for tag_key, derived_value in derived_op_tags.items():
            if tag_key in tags:
                existing_value = _normalize_tag_value_with_aliases(
                    tag_key=tag_key,
                    value=tags[tag_key],
                    value_alias_map=tag_value_alias_map,
                )
                if existing_value != derived_value:
                    raise SchemaCompilerValidationError(
                        f"{src}: block_schema.variants[{i}].tags.{tag_key} "
                        f"conflicts with op_args-derived value"
                    )
            tags[tag_key] = derived_value

        block_metadata = block.get("block_metadata")
        if block_metadata is None:
            normalized_metadata: Dict[str, Any] = {}
        elif not isinstance(block_metadata, dict):
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.variants[{i}].block_metadata must be an object"
            )
        else:
            normalized_metadata = dict(block_metadata)
        normalized_metadata.setdefault("mode", block_mode)
        existing_descriptors = normalized_metadata.get("descriptors")
        if existing_descriptors is not None and not isinstance(existing_descriptors, dict):
            raise SchemaCompilerValidationError(
                f"{src}: block_schema.variants[{i}].block_metadata.descriptors must be an object"
            )
        merged_descriptors: Dict[str, Any] = {}
        if isinstance(existing_descriptors, dict):
            merged_descriptors.update(existing_descriptors)
        merged_descriptors.update(effective_descriptors)
        if merged_descriptors:
            normalized_metadata["descriptors"] = merged_descriptors

        if effective_op_id is not None:
            op_payload: Dict[str, Any] = {"op_id": effective_op_id}
            if schema_op is not None and isinstance(schema_op.get("signature_id"), str):
                op_payload["signature_id"] = str(schema_op.get("signature_id"))
            if effective_modalities:
                op_payload["modalities"] = effective_modalities
            if schema_refs:
                op_payload["refs"] = schema_refs
            if schema_params:
                op_payload["params"] = schema_params
            if effective_op_args:
                op_payload["args"] = effective_op_args
            if variant_ref_bindings:
                op_payload["ref_bindings"] = variant_ref_bindings

            normalized_metadata["op"] = op_payload

            tags.setdefault("op_id", effective_op_id)
            op_namespace = effective_op_id.split(".", 1)[0].strip()
            if op_namespace:
                tags.setdefault("op_namespace", op_namespace)
            if effective_modalities:
                tags.setdefault("op_modalities", ",".join(effective_modalities))
                modality_support_tag = _derive_modality_support_tag(effective_modalities)
                if modality_support_tag:
                    tags.setdefault("modality_support", modality_support_tag)

            op_capabilities = [f"op:{effective_op_id}"]
            ref_capabilities: List[str] = []
            for ref in schema_refs:
                capability = ref.get("capability")
                if isinstance(capability, str) and capability.strip():
                    ref_cap = capability.strip()
                    ref_capabilities.append(ref_cap)
                    op_capabilities.append(f"ref:{ref_cap}")
            if ref_capabilities:
                tags.setdefault("op_ref_capabilities", ",".join(ref_capabilities))
            existing_caps = normalize_capability_ids(block.get("capabilities"))
            block["capabilities"] = normalize_capability_ids(existing_caps + op_capabilities)

        block["block_id"] = block_id
        block["tags"] = tags
        tags.setdefault("block_mode", block_mode)
        block["block_metadata"] = normalized_metadata
        if text is not None:
            block["text"] = text

        compiled.append(block)

    return compiled
