"""
Prompt program definitions and parsing.
"""

from typing import Dict, Any, List, Optional, Union
from pydantic import BaseModel
import re
import operator


class ConditionExpression(BaseModel):
    """Represents a parsed condition expression."""
    expression: str

    def evaluate(self, vars: Dict[str, Any]) -> bool:
        """
        Evaluate the condition expression against a set of variables.

        Supports:
        - Comparisons: ==, !=, <, <=, >, >=
        - Logical: &&, ||
        - BETWEEN operator
        - Dot notation for nested values
        """
        expr = self.expression.strip()

        # Handle logical operators (simplified - evaluates left to right)
        if " && " in expr:
            parts = expr.split(" && ")
            return all(self._evaluate_simple(p, vars) for p in parts)
        elif " || " in expr:
            parts = expr.split(" || ")
            return any(self._evaluate_simple(p, vars) for p in parts)
        else:
            return self._evaluate_simple(expr, vars)

    def _evaluate_simple(self, expr: str, vars: Dict[str, Any]) -> bool:
        """Evaluate a simple expression without logical operators."""
        expr = expr.strip()

        # BETWEEN operator
        between_match = re.match(r'(\S+)\s+BETWEEN\s+(\S+)\s+AND\s+(\S+)', expr)
        if between_match:
            var_name = between_match.group(1)
            low = self._get_value(between_match.group(2), vars)
            high = self._get_value(between_match.group(3), vars)
            value = self._get_variable(var_name, vars)
            return low <= value <= high

        # Comparison operators
        ops = {
            '>=': operator.ge,
            '<=': operator.le,
            '!=': operator.ne,
            '==': operator.eq,
            '>': operator.gt,
            '<': operator.lt,
        }

        for op_str, op_func in ops.items():
            if op_str in expr:
                parts = expr.split(op_str, 1)
                if len(parts) == 2:
                    left = self._get_value(parts[0].strip(), vars)
                    right = self._get_value(parts[1].strip(), vars)
                    return op_func(left, right)

        # Boolean variable
        value = self._get_variable(expr, vars)
        return bool(value)

    def _get_value(self, token: str, vars: Dict[str, Any]) -> Any:
        """Get the value of a token (variable, number, string, or boolean)."""
        token = token.strip()

        # Boolean literals
        if token.lower() == "true":
            return True
        elif token.lower() == "false":
            return False

        # String literals (quoted)
        if (token.startswith('"') and token.endswith('"')) or \
           (token.startswith("'") and token.endswith("'")):
            return token[1:-1]

        # Numbers
        try:
            if '.' in token:
                return float(token)
            return int(token)
        except ValueError:
            pass

        # Variable
        return self._get_variable(token, vars)

    def _get_variable(self, path: str, vars: Dict[str, Any]) -> Any:
        """Get a variable value using dot notation."""
        # Direct lookup first
        if path in vars:
            return vars[path]

        # Try without dots (for simple variable names)
        if '.' not in path and path in vars:
            return vars[path]

        # Default to 0 for numeric comparisons, False for boolean
        return 0


class MatchCriteria(BaseModel):
    """Criteria for selector matching."""
    intimacy_level: Optional[str] = None
    relationship_tier: Optional[str] = None
    affinity: Optional[Dict[str, float]] = None  # {"min": 60, "max": 100}
    trust: Optional[Dict[str, float]] = None
    chemistry: Optional[Dict[str, float]] = None
    tension: Optional[Dict[str, float]] = None

    def matches(self, vars: Dict[str, Any]) -> bool:
        """Check if the criteria match the given variables."""
        if self.intimacy_level and vars.get("intimacy_level") != self.intimacy_level:
            return False

        if self.relationship_tier and vars.get("relationship_tier") != self.relationship_tier:
            return False

        # Check numeric ranges
        for attr, range_def in [
            ("affinity", self.affinity),
            ("trust", self.trust),
            ("chemistry", self.chemistry),
            ("tension", self.tension)
        ]:
            if range_def:
                value = vars.get(attr, 0)
                if "min" in range_def and value < range_def["min"]:
                    return False
                if "max" in range_def and value > range_def["max"]:
                    return False

        return True


class Condition(BaseModel):
    """A condition with its associated template."""
    test: str
    template: str

    def evaluate(self, vars: Dict[str, Any]) -> Optional[str]:
        """Evaluate the condition and return the template if true."""
        expr = ConditionExpression(expression=self.test)
        if expr.evaluate(vars):
            return self.template
        return None


class Selector(BaseModel):
    """A selector with match criteria and template."""
    match: Dict[str, Any]
    template: str

    def evaluate(self, vars: Dict[str, Any]) -> Optional[str]:
        """Evaluate the selector and return the template if it matches."""
        criteria = MatchCriteria(**self.match)
        if criteria.matches(vars):
            return self.template
        return None


class Formatter(BaseModel):
    """A formatter operation."""
    type: str  # "combine", "append", "prepend"
    template: Optional[str] = None
    separator: Optional[str] = "\n"
    sources: Optional[List[str]] = None


class StageMetadata(BaseModel):
    """Metadata generation configuration."""
    suggested_intents: Optional[List[Dict[str, Any]]] = None
    visual_prompt: Optional[Dict[str, Any]] = None
    expression_hint: Optional[Dict[str, Any]] = None


class PromptStage(BaseModel):
    """A stage in the prompt program."""
    id: str
    type: str  # "template", "conditional", "selector", "formatter"
    description: Optional[str] = None
    template: Optional[str] = None
    conditions: Optional[List[Condition]] = None
    selectors: Optional[List[Selector]] = None
    default: Optional[Dict[str, str]] = None
    formatters: Optional[List[Formatter]] = None
    metadata: Optional[StageMetadata] = None


class PromptProgram(BaseModel):
    """A complete prompt program."""
    id: str
    version: str = "1.0.0"
    description: Optional[str] = None
    inputs: Dict[str, List[str]] = {}
    stages: List[PromptStage] = []

    @classmethod
    def from_json(cls, data: Dict[str, Any]) -> "PromptProgram":
        """Create a PromptProgram from JSON data."""
        # Convert conditions and selectors to proper objects
        stages = []
        for stage_data in data.get("stages", []):
            if "conditions" in stage_data:
                stage_data["conditions"] = [
                    Condition(**c) if isinstance(c, dict) else c
                    for c in stage_data["conditions"]
                ]
            if "selectors" in stage_data:
                stage_data["selectors"] = [
                    Selector(**s) if isinstance(s, dict) else s
                    for s in stage_data["selectors"]
                ]
            if "formatters" in stage_data:
                stage_data["formatters"] = [
                    Formatter(**f) if isinstance(f, dict) else f
                    for f in stage_data["formatters"]
                ]
            stages.append(PromptStage(**stage_data))

        return cls(
            id=data["id"],
            version=data.get("version", "1.0.0"),
            description=data.get("description"),
            inputs=data.get("inputs", {}),
            stages=stages
        )