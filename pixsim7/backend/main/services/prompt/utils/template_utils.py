"""Template validation utilities for prompt versioning

Provides template parsing, variable validation, and substitution.
"""
import re
from typing import Dict, Any, List, Optional, Set
from dataclasses import dataclass


@dataclass
class VariableDefinition:
    """Definition of a template variable"""
    name: str
    type: str = "string"  # string, int, float, bool, enum
    required: bool = True
    default: Optional[Any] = None
    enum_values: Optional[List[str]] = None
    description: Optional[str] = None


class TemplateValidationError(ValueError):
    """Raised when template validation fails"""
    pass


def extract_variables(template: str) -> Set[str]:
    """Extract variable names from template

    Args:
        template: Template text with {{variable}} placeholders

    Returns:
        Set of variable names found in template

    Example:
        >>> extract_variables("{{character}} at {{location}}")
        {'character', 'location'}
    """
    # Match {{variable_name}} pattern
    pattern = r'\{\{(\w+)\}\}'
    matches = re.findall(pattern, template)
    return set(matches)


def validate_template(
    template: str,
    variable_defs: Dict[str, VariableDefinition]
) -> tuple[bool, List[str]]:
    """Validate a template against variable definitions

    Args:
        template: Template text
        variable_defs: Dictionary of variable definitions

    Returns:
        Tuple of (is_valid, list of error messages)
    """
    errors = []
    template_vars = extract_variables(template)

    # Check for required variables
    for var_name, var_def in variable_defs.items():
        if var_def.required and var_name not in template_vars:
            errors.append(f"Required variable '{{{{ {var_name} }}}}' not found in template")

    # Check for undefined variables
    defined_vars = set(variable_defs.keys())
    undefined_vars = template_vars - defined_vars
    if undefined_vars:
        for var in undefined_vars:
            errors.append(f"Variable '{{{{ {var} }}}}' used in template but not defined")

    return (len(errors) == 0, errors)


def substitute_variables(
    template: str,
    variables: Dict[str, Any],
    variable_defs: Optional[Dict[str, VariableDefinition]] = None,
    strict: bool = True
) -> str:
    """Substitute variables in template

    Args:
        template: Template text
        variables: Values to substitute
        variable_defs: Optional variable definitions for validation
        strict: Raise error on missing variables (vs use default/empty)

    Returns:
        Template with variables substituted

    Raises:
        TemplateValidationError: If validation fails in strict mode
    """
    # Validate if definitions provided
    if variable_defs and strict:
        # Check required variables are provided
        for var_name, var_def in variable_defs.items():
            if var_def.required and var_name not in variables:
                if var_def.default is None:
                    raise TemplateValidationError(
                        f"Required variable '{var_name}' not provided"
                    )

        # Validate types and enum values
        for var_name, value in variables.items():
            if var_name in variable_defs:
                var_def = variable_defs[var_name]

                # Type validation
                if var_def.type == "int" and not isinstance(value, int):
                    raise TemplateValidationError(
                        f"Variable '{var_name}' must be int, got {type(value).__name__}"
                    )
                elif var_def.type == "float" and not isinstance(value, (int, float)):
                    raise TemplateValidationError(
                        f"Variable '{var_name}' must be float, got {type(value).__name__}"
                    )
                elif var_def.type == "bool" and not isinstance(value, bool):
                    raise TemplateValidationError(
                        f"Variable '{var_name}' must be bool, got {type(value).__name__}"
                    )

                # Enum validation
                if var_def.enum_values and value not in var_def.enum_values:
                    raise TemplateValidationError(
                        f"Variable '{var_name}' must be one of {var_def.enum_values}, "
                        f"got '{value}'"
                    )

    # Merge with defaults
    final_vars = {}
    if variable_defs:
        for var_name, var_def in variable_defs.items():
            if var_name in variables:
                final_vars[var_name] = variables[var_name]
            elif var_def.default is not None:
                final_vars[var_name] = var_def.default
    else:
        final_vars = variables.copy()

    # Perform substitution
    result = template
    for var_name, value in final_vars.items():
        pattern = r'\{\{' + re.escape(var_name) + r'\}\}'
        result = re.sub(pattern, str(value), result)

    # Check for unsubstituted variables
    if strict:
        remaining_vars = extract_variables(result)
        if remaining_vars:
            raise TemplateValidationError(
                f"Variables not substituted: {remaining_vars}"
            )

    return result


def parse_variable_definitions(
    variables_dict: Dict[str, Dict[str, Any]]
) -> Dict[str, VariableDefinition]:
    """Parse variable definitions from dict format

    Args:
        variables_dict: Dictionary of variable configs

    Returns:
        Dictionary of VariableDefinition objects

    Example:
        >>> defs = parse_variable_definitions({
        ...     "character": {
        ...         "type": "string",
        ...         "required": True,
        ...         "description": "Character name"
        ...     },
        ...     "lighting": {
        ...         "type": "enum",
        ...         "enum_values": ["golden hour", "sunset", "dramatic"],
        ...         "default": "golden hour"
        ...     }
        ... })
    """
    result = {}
    for var_name, config in variables_dict.items():
        result[var_name] = VariableDefinition(
            name=var_name,
            type=config.get("type", "string"),
            required=config.get("required", True),
            default=config.get("default"),
            enum_values=config.get("enum_values"),
            description=config.get("description")
        )
    return result


def generate_template_examples(
    template: str,
    variable_defs: Dict[str, VariableDefinition],
    num_examples: int = 3
) -> List[str]:
    """Generate example prompts from template

    Args:
        template: Template text
        variable_defs: Variable definitions
        num_examples: Number of examples to generate

    Returns:
        List of example prompts
    """
    examples = []

    # For simplicity, use defaults and first enum value
    base_vars = {}
    for var_name, var_def in variable_defs.items():
        if var_def.enum_values:
            base_vars[var_name] = var_def.enum_values[0]
        elif var_def.default is not None:
            base_vars[var_name] = var_def.default
        else:
            base_vars[var_name] = f"<{var_name}>"

    try:
        example = substitute_variables(template, base_vars, variable_defs, strict=False)
        examples.append(example)
    except Exception:
        pass

    # Generate variations if enum values exist
    for var_name, var_def in variable_defs.items():
        if var_def.enum_values and len(var_def.enum_values) > 1 and len(examples) < num_examples:
            for enum_value in var_def.enum_values[1:]:
                if len(examples) >= num_examples:
                    break
                vars_copy = base_vars.copy()
                vars_copy[var_name] = enum_value
                try:
                    example = substitute_variables(template, vars_copy, variable_defs, strict=False)
                    examples.append(example)
                except Exception:
                    pass

    return examples[:num_examples]


def extract_template_variables(template: str) -> List[str]:
    """Return template variable names as a sorted list."""
    return sorted(extract_variables(template))


def render_template(
    template: str,
    variables: Dict[str, Any],
    variable_defs: Optional[Dict[str, Any]] = None,
    strict: bool = True,
) -> str:
    """Backward-compatible wrapper for template substitution."""
    parsed_defs: Optional[Dict[str, VariableDefinition]] = None
    if variable_defs:
        first_value = next(iter(variable_defs.values()), None)
        if isinstance(first_value, VariableDefinition):
            parsed_defs = variable_defs  # type: ignore[assignment]
        else:
            parsed_defs = parse_variable_definitions(variable_defs)
    return substitute_variables(template, variables, parsed_defs, strict)


def validate_prompt_text(
    prompt_text: str,
    variable_defs: Optional[Dict[str, VariableDefinition]] = None
) -> Dict[str, Any]:
    """Validate prompt text and return analysis

    Args:
        prompt_text: Prompt text to validate
        variable_defs: Optional variable definitions

    Returns:
        Dictionary with validation results
    """
    variables = extract_variables(prompt_text)

    result = {
        "is_template": len(variables) > 0,
        "variables": list(variables),
        "variable_count": len(variables),
        "errors": [],
        "warnings": []
    }

    if variable_defs:
        is_valid, errors = validate_template(prompt_text, variable_defs)
        result["is_valid"] = is_valid
        result["errors"] = errors
    else:
        result["is_valid"] = True

    # Check for common issues
    if not prompt_text.strip():
        result["warnings"].append("Prompt is empty")
    if len(prompt_text) > 1000:
        result["warnings"].append("Prompt is very long (>1000 chars)")

    return result
