"""Safe formula evaluator for custom metrics.

Supports: +, -, *, /, parentheses, metric keys, numbers.
Metric keys reference other MetricDefinition.key values.
Custom metrics can reference other custom metrics (evaluated in dependency order).
"""
import ast
import operator
import re
from typing import Any

# Allowed operators
_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.USub: operator.neg,
}

# Valid identifier pattern for metric keys
_METRIC_KEY_RE = re.compile(r"^[a-z][a-z0-9_]*$")


def extract_metric_keys(formula: str) -> set[str]:
    """Extract all metric key references from a formula string."""
    keys = set()
    try:
        tree = ast.parse(formula, mode="eval")
    except SyntaxError:
        return keys

    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            keys.add(node.id)
    return keys


def validate_formula(formula: str, available_keys: set[str]) -> list[str]:
    """Validate a formula. Returns list of error strings (empty = valid)."""
    errors = []

    try:
        tree = ast.parse(formula, mode="eval")
    except SyntaxError as e:
        return [f"Invalid formula syntax: {e}"]

    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            if node.id not in available_keys:
                errors.append(f"Unknown metric: '{node.id}'")
        elif isinstance(node, (ast.Constant, ast.Expression, ast.BinOp, ast.UnaryOp)):
            if isinstance(node, ast.Constant) and not isinstance(node.value, (int, float)):
                errors.append(f"Only numbers allowed, got: {type(node.value).__name__}")
        elif isinstance(node, ast.BinOp):
            if type(node.op) not in _OPS:
                errors.append(f"Unsupported operator: {type(node.op).__name__}")
        elif isinstance(node, ast.UnaryOp):
            if type(node.op) not in _OPS:
                errors.append(f"Unsupported operator: {type(node.op).__name__}")

    return errors


def evaluate_formula(formula: str, values: dict[str, float]) -> float | None:
    """Safely evaluate a formula with the given metric values.

    Returns None if evaluation fails (missing values, division by zero, etc.)
    """
    try:
        tree = ast.parse(formula, mode="eval")
        return _eval_node(tree.body, values)
    except Exception:
        return None


def _eval_node(node: ast.AST, values: dict[str, float]) -> float:
    """Recursively evaluate an AST node."""
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return float(node.value)
        raise ValueError(f"Unsupported constant: {node.value}")

    if isinstance(node, ast.Name):
        if node.id in values:
            return float(values[node.id])
        raise ValueError(f"Missing value for: {node.id}")

    if isinstance(node, ast.BinOp):
        left = _eval_node(node.left, values)
        right = _eval_node(node.right, values)
        op_func = _OPS.get(type(node.op))
        if op_func is None:
            raise ValueError(f"Unsupported op: {type(node.op).__name__}")
        if isinstance(node.op, ast.Div) and right == 0:
            return 0.0  # Division by zero returns 0 instead of erroring
        return op_func(left, right)

    if isinstance(node, ast.UnaryOp):
        operand = _eval_node(node.operand, values)
        op_func = _OPS.get(type(node.op))
        if op_func is None:
            raise ValueError(f"Unsupported op: {type(node.op).__name__}")
        return op_func(operand)

    raise ValueError(f"Unsupported node type: {type(node).__name__}")


def resolve_evaluation_order(
    custom_metrics: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Topologically sort custom metrics so dependencies are evaluated first.

    Each item should have 'key' and 'formula' fields.
    Returns ordered list. Raises ValueError on circular dependencies.
    """
    # Build dependency graph
    custom_keys = {m["key"] for m in custom_metrics}
    deps: dict[str, set[str]] = {}
    by_key = {m["key"]: m for m in custom_metrics}

    for m in custom_metrics:
        referenced = extract_metric_keys(m["formula"])
        # Only track deps on OTHER custom metrics
        deps[m["key"]] = referenced & custom_keys - {m["key"]}

    # Topological sort (Kahn's algorithm)
    in_degree = {k: len(v) for k, v in deps.items()}
    queue = [k for k, d in in_degree.items() if d == 0]
    ordered = []

    while queue:
        key = queue.pop(0)
        ordered.append(by_key[key])
        for other_key, other_deps in deps.items():
            if key in other_deps:
                in_degree[other_key] -= 1
                if in_degree[other_key] == 0:
                    queue.append(other_key)

    if len(ordered) != len(custom_metrics):
        raise ValueError("Circular dependency detected in custom metrics")

    return ordered
