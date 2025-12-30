"""
Multi-image edit prompt schemas.

Supports prompts with named input references like:
    "Replace woman in {{image_1}} with woman in {{image_2}},
     incorporate animal parts of {{image_3}} as creatures"

These schemas enable:
- Binding ref_names to assets
- Tracking influence per input
- Round-trip lineage from prompt to generation to asset
"""
from typing import Dict, List, Optional, Set
from pydantic import BaseModel, Field, field_validator, model_validator

from pixsim7.backend.main.shared.schemas.entity_ref import AssetRef


class InputBinding(BaseModel):
    """Binds a prompt reference name to an asset with optional influence hints."""

    ref_name: str = Field(
        ...,
        min_length=1,
        max_length=64,
        pattern=r"^[a-zA-Z_][a-zA-Z0-9_]*$",
        description="Reference token used in prompt: 'image_1', 'woman_ref', 'animal_source'",
    )
    asset: AssetRef = Field(..., description="Asset reference")

    # Optional semantic role
    role: Optional[str] = Field(
        default=None,
        description="Expected role: 'subject', 'replacement', 'style_ref', 'background'",
    )

    # Influence hints (propagated to lineage)
    influence_type: Optional[str] = Field(
        default=None,
        pattern="^(content|style|structure|mask|blend|replacement|reference)$",
        description="Expected influence: content, style, structure, mask, blend, replacement, reference",
    )
    influence_region: Optional[str] = Field(
        default=None,
        description="Target region: full, foreground, background, subject:<id>, mask:<label>",
    )


class ImageEditInstruction(BaseModel):
    """Structured instruction for a single edit operation (optional parsing aid)."""

    action: str = Field(
        ...,
        pattern="^(replace|incorporate|blend|remove|add|transfer|merge)$",
        description="Action verb: replace, incorporate, blend, remove, add, transfer, merge",
    )
    source_ref: Optional[str] = Field(
        default=None,
        description="Source input ref: 'image_1' (the base being edited)",
    )
    target_ref: Optional[str] = Field(
        default=None,
        description="Target/replacement ref: 'image_2' (provides replacement content)",
    )
    target_aspect: Optional[str] = Field(
        default=None,
        description="What to affect: 'woman', 'background', 'creatures', 'style'",
    )
    region: Optional[str] = Field(
        default=None,
        description="Where: 'foreground', 'background', 'full'",
    )


class InfluenceEdge(BaseModel):
    """Describes one influence relationship for lineage creation."""

    parent_ref: str = Field(..., description="Input binding ref_name: 'image_1'")
    influence_type: str = Field(
        ...,
        pattern="^(content|style|structure|mask|blend|replacement|reference)$",
        description="How this input influenced the output",
    )
    influence_weight: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Contribution weight 0.0-1.0",
    )
    influence_region: str = Field(
        default="full",
        description="Affected region: full, foreground, background, subject:<id>, mask:<label>",
    )
    target_aspect: Optional[str] = Field(
        default=None,
        description="What was affected: 'woman', 'creatures', 'style'",
    )


class MultiImageEditPrompt(BaseModel):
    """
    Complete multi-image edit prompt configuration.

    Example:
        input_bindings:
          - ref_name: "image_1", asset: "asset:123"
          - ref_name: "image_2", asset: "asset:456"
          - ref_name: "image_3", asset: "asset:789"

        instruction_text: "Replace woman in {{image_1}} with woman in {{image_2}},
                          incorporate animal parts of {{image_3}} as creatures"

        instructions:  # Optional structured breakdown
          - action: "replace", source_ref: "image_1", target_ref: "image_2",
            target_aspect: "woman"
          - action: "incorporate", source_ref: "image_3", target_aspect: "creatures",
            region: "foreground"
    """

    # Input bindings - map ref names to assets
    input_bindings: List[InputBinding] = Field(
        ...,
        min_length=1,
        description="Map ref names to assets (at least one required)",
    )

    # The edit instruction with {{ref_name}} placeholders
    instruction_text: str = Field(
        ...,
        min_length=1,
        description="Natural language instruction with {{ref_name}} tokens",
    )

    # Optional structured instruction breakdown (for better lineage)
    instructions: Optional[List[ImageEditInstruction]] = Field(
        default=None,
        description="Parsed/structured instructions for precise lineage tracking",
    )

    # Generation hints
    base_image_ref: Optional[str] = Field(
        default=None,
        description="Which input is the 'base' to edit (default: first binding)",
    )
    output_style_ref: Optional[str] = Field(
        default=None,
        description="Which input provides style reference",
    )

    # Provider-returned or computed influence edges
    influence_edges: Optional[List[InfluenceEdge]] = Field(
        default=None,
        description="Influence breakdown (from provider or computed)",
    )

    @field_validator("input_bindings")
    @classmethod
    def validate_unique_ref_names(cls, v: List[InputBinding]) -> List[InputBinding]:
        """Ensure ref_names are unique."""
        seen: Set[str] = set()
        for binding in v:
            if binding.ref_name in seen:
                raise ValueError(f"Duplicate ref_name: '{binding.ref_name}'")
            seen.add(binding.ref_name)
        return v

    @model_validator(mode="after")
    def validate_instruction_refs(self) -> "MultiImageEditPrompt":
        """Ensure instructions only reference declared bindings."""
        binding_names = {b.ref_name for b in self.input_bindings}

        # Validate base_image_ref
        if self.base_image_ref and self.base_image_ref not in binding_names:
            raise ValueError(
                f"base_image_ref '{self.base_image_ref}' not in input_bindings"
            )

        # Validate output_style_ref
        if self.output_style_ref and self.output_style_ref not in binding_names:
            raise ValueError(
                f"output_style_ref '{self.output_style_ref}' not in input_bindings"
            )

        # Validate structured instructions
        if self.instructions:
            for idx, instr in enumerate(self.instructions):
                if instr.source_ref and instr.source_ref not in binding_names:
                    raise ValueError(
                        f"instructions[{idx}].source_ref '{instr.source_ref}' not in input_bindings"
                    )
                if instr.target_ref and instr.target_ref not in binding_names:
                    raise ValueError(
                        f"instructions[{idx}].target_ref '{instr.target_ref}' not in input_bindings"
                    )

        # Validate influence edges
        if self.influence_edges:
            for idx, edge in enumerate(self.influence_edges):
                if edge.parent_ref not in binding_names:
                    raise ValueError(
                        f"influence_edges[{idx}].parent_ref '{edge.parent_ref}' not in input_bindings"
                    )

        return self

    def get_binding(self, ref_name: str) -> Optional[InputBinding]:
        """Get binding by ref_name."""
        for binding in self.input_bindings:
            if binding.ref_name == ref_name:
                return binding
        return None

    def get_base_binding(self) -> InputBinding:
        """Get the base image binding (explicit or first)."""
        if self.base_image_ref:
            binding = self.get_binding(self.base_image_ref)
            if binding:
                return binding
        return self.input_bindings[0]

    def to_ref_name_to_asset_map(self) -> Dict[str, AssetRef]:
        """Convert bindings to a simple ref_name → AssetRef map."""
        return {b.ref_name: b.asset for b in self.input_bindings}
