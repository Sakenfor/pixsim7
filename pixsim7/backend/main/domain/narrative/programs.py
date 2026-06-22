"""
Prompt program definitions and parsing.
"""

from typing import Dict, Any, List, Optional, Union, Tuple
from pydantic import BaseModel
import logging
import re
import operator


logger = logging.getLogger(__name__)


# Comparison operators, longest-match first so ``>=`` is read before ``>``.
_COMPARISONS = {
    '>=': operator.ge,
    '<=': operator.le,
    '!=': operator.ne,
    '==': operator.eq,
    '>': operator.gt,
    '<': operator.lt,
}

# Tokenizer for condition expressions. Two-char operators are listed before
# their single-char prefixes so ``>=`` / ``!=`` win over ``>`` / ``!``.
_TOKEN_RE = re.compile(
    r"""\s*(?:
        (?P<lparen>\() |
        (?P<rparen>\)) |
        (?P<op><=|>=|==|!=|<|>) |
        (?P<and>&&) |
        (?P<or>\|\|) |
        (?P<not>!) |
        (?P<num>-?\d+(?:\.\d+)?) |
        (?P<str>"[^"]*"|'[^']*') |
        (?P<word>[A-Za-z_][A-Za-z0-9_.]*)
    )""",
    re.VERBOSE,
)


class ConditionExpression(BaseModel):
    """Represents a parsed condition expression.

    Evaluates expressions via a small recursive-descent parser supporting:
    - Comparisons: ==, !=, <, <=, >, >=
    - Logical operators with precedence and grouping: && (AND), || (OR), ! (NOT),
      and parenthesised sub-expressions
    - BETWEEN: ``affinity BETWEEN 60 AND 80``
    - Dot-notation variable paths (``flags.hasMet``, ``arcs.romance.stage``)

    Operator precedence is NOT < comparison/BETWEEN < AND < OR, so
    ``affinity > 50 && (trust > 30 || !hasMet)`` parses as intended. Empty
    expressions are truthy; any parse/lookup error fails closed (False).

    This is the runtime-of-record evaluator: it backs both the prompt-program
    selectors here and the narrative-runtime branch/choice/edge conditions
    (``domain/narrative/schema.py`` delegates to it). Ported from the retired
    frontend ``conditionEvaluator.ts`` so the backend is the capability superset.
    """
    expression: str

    # Parser state (excluded from the pydantic model surface).
    _tokens: List[Tuple[str, str]] = []
    _pos: int = 0

    def evaluate(self, vars: Dict[str, Any]) -> bool:
        """Evaluate the condition expression against a set of variables."""
        expr = (self.expression or "").strip()
        if not expr:
            return True  # Empty condition = always true (parity with frontend)

        try:
            self._tokens = self._tokenize(expr)
            self._pos = 0
            result = self._parse_or(vars)
            if self._peek()[0] != 'eof':
                raise ValueError(f"Unexpected token: {self._peek()[1]!r}")
            return bool(result)
        except Exception:
            logger.debug("condition_evaluation_failed expression=%r", expr, exc_info=True)
            return False  # Fail closed

    # --- Tokenizer ---------------------------------------------------------

    def _tokenize(self, expr: str) -> List[Tuple[str, str]]:
        tokens: List[Tuple[str, str]] = []
        pos = 0
        for match in _TOKEN_RE.finditer(expr):
            # Any non-whitespace gap means an unrecognised character.
            if match.start() != pos and expr[pos:match.start()].strip():
                raise ValueError(f"Unexpected character near {expr[pos:match.start()]!r}")
            pos = match.end()
            kind = match.lastgroup
            text = match.group(kind)
            if kind == 'word':
                upper = text.upper()
                if upper == 'AND':
                    tokens.append(('and', text))
                elif upper == 'OR':
                    tokens.append(('or', text))
                elif upper == 'NOT':
                    tokens.append(('not', text))
                elif upper == 'BETWEEN':
                    tokens.append(('between', text))
                else:
                    tokens.append(('operand', text))
            elif kind in ('num', 'str'):
                tokens.append(('operand', text))
            else:
                tokens.append((kind, text))
        if pos != len(expr) and expr[pos:].strip():
            raise ValueError(f"Unexpected trailing token {expr[pos:]!r}")
        tokens.append(('eof', ''))
        return tokens

    def _peek(self) -> Tuple[str, str]:
        return self._tokens[self._pos]

    def _advance(self) -> Tuple[str, str]:
        token = self._tokens[self._pos]
        self._pos += 1
        return token

    # --- Recursive-descent parser -----------------------------------------

    def _parse_or(self, vars: Dict[str, Any]) -> Any:
        left = self._parse_and(vars)
        while self._peek()[0] == 'or':
            self._advance()
            right = self._parse_and(vars)
            left = bool(left) or bool(right)
        return left

    def _parse_and(self, vars: Dict[str, Any]) -> Any:
        left = self._parse_not(vars)
        while self._peek()[0] == 'and':
            self._advance()
            right = self._parse_not(vars)
            left = bool(left) and bool(right)
        return left

    def _parse_not(self, vars: Dict[str, Any]) -> Any:
        if self._peek()[0] == 'not':
            self._advance()
            return not bool(self._parse_not(vars))
        return self._parse_comparison(vars)

    def _parse_comparison(self, vars: Dict[str, Any]) -> Any:
        left = self._parse_primary(vars)

        if self._peek()[0] == 'between':
            self._advance()
            low = self._parse_primary(vars)
            if self._peek()[0] != 'and':
                raise ValueError("Expected AND in BETWEEN expression")
            self._advance()
            high = self._parse_primary(vars)
            try:
                return low <= left <= high
            except TypeError:
                return False

        if self._peek()[0] == 'op':
            op_text = self._advance()[1]
            right = self._parse_primary(vars)
            return self._compare(left, op_text, right)

        return left

    def _parse_primary(self, vars: Dict[str, Any]) -> Any:
        token = self._peek()
        if token[0] == 'lparen':
            self._advance()
            result = self._parse_or(vars)
            if self._peek()[0] != 'rparen':
                raise ValueError("Expected closing parenthesis")
            self._advance()
            return result
        if token[0] == 'operand':
            self._advance()
            return self._get_value(token[1], vars)
        raise ValueError(f"Unexpected token: {token[1]!r}")

    def _compare(self, left: Any, op_text: str, right: Any) -> bool:
        func = _COMPARISONS.get(op_text)
        if func is None:
            raise ValueError(f"Unknown operator: {op_text}")
        try:
            return func(left, right)
        except TypeError:
            # Ordered comparison across mismatched types fails closed; equality
            # still has well-defined semantics in Python.
            if op_text == '==':
                return left == right
            if op_text == '!=':
                return left != right
            return False

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
        """Get a variable value using dot notation.

        Exact-key match wins first (backward compatible with flat variable maps);
        otherwise the path is walked through nested dicts so ``flags.hasMet`` /
        ``arcs.romance.stage`` resolve when the container dict is in ``vars``.
        """
        # Exact-key match first (preserves flat-map behavior for keys with dots).
        if path in vars:
            return vars[path]

        # Walk nested dicts for dotted paths (e.g. flags.hasMet).
        if '.' in path:
            current: Any = vars
            for part in path.split('.'):
                if isinstance(current, dict) and part in current:
                    current = current[part]
                else:
                    current = None
                    break
            if current is not None:
                return current

        # Default to 0 for numeric comparisons, falsy for boolean.
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