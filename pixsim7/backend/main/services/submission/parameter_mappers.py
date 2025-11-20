"""Canonical parameter mapping stubs (Phase 1)

These mappers will evolve to:
- Normalize user-supplied params (trim whitespace, enforce defaults)
- Provide operation-specific validation beyond JobService basic checks
- Emit a "canonical" dict used for provider mapping and persistence

Right now they are lightweight placeholders to anchor future tests.
"""
from __future__ import annotations
from typing import Dict, Any
from pixsim7.backend.main.domain import OperationType


class BaseMapper:
    operation_type: OperationType

    def __init__(self, operation_type: OperationType):
        self.operation_type = operation_type

    def canonicalize(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Return minimally canonical params.
        - Strips prompt whitespace
        - Applies default duration if missing
        Future: model/quality normalization, aspect ratio parsing, seed handling.
        """
        out = dict(params)
        prompt = out.get("prompt")
        if isinstance(prompt, str):
            out["prompt"] = prompt.strip()
        # Apply a default duration (seconds) if not provided and operation supports it
        if "duration" not in out:
            out["duration"] = 5
        out["operation_type"] = self.operation_type.value
        return out


class TextToVideoMapper(BaseMapper):
    def __init__(self):
        super().__init__(OperationType.TEXT_TO_VIDEO)


class ImageToVideoMapper(BaseMapper):
    def __init__(self):
        super().__init__(OperationType.IMAGE_TO_VIDEO)

    def canonicalize(self, params: Dict[str, Any]) -> Dict[str, Any]:
        out = super().canonicalize(params)
        # Ensure image_url present for image_to_video
        if "image_url" not in out:
            raise ValueError("image_url required for image_to_video canonicalization")
        return out


MAPPER_REGISTRY = {
    OperationType.TEXT_TO_VIDEO: TextToVideoMapper(),
    OperationType.IMAGE_TO_VIDEO: ImageToVideoMapper(),
}


def get_mapper(op: OperationType) -> BaseMapper:
    mapper = MAPPER_REGISTRY.get(op)
    if not mapper:
        raise ValueError(f"No mapper registered for operation {op.value}")
    return mapper
