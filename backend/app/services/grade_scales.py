"""Dynamic grade scale calculation with outlier removal.

Replicates the Excel logic:
- For "lower_better" metrics (AHT): A <= mean-1.5*sd, B <= mean-0.5*sd, C <= mean+0.5*sd, D <= mean+1.5*sd
- For "higher_better" metrics (CPH): A >= mean+1.5*sd, B >= mean+0.5*sd, C >= mean-0.5*sd, D >= mean-1.5*sd
"""
import math
from decimal import Decimal
from typing import Sequence


def remove_outliers_iqr(values: list[float], multiplier: float = 1.5) -> list[float]:
    if len(values) < 4:
        return values
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    q1 = sorted_vals[n // 4]
    q3 = sorted_vals[(3 * n) // 4]
    iqr = q3 - q1
    lower = q1 - multiplier * iqr
    upper = q3 + multiplier * iqr
    return [v for v in values if lower <= v <= upper]


def remove_outliers_std_dev(values: list[float], num_std: float = 2.0) -> list[float]:
    if len(values) < 3:
        return values
    mean = sum(values) / len(values)
    variance = sum((v - mean) ** 2 for v in values) / len(values)
    std = math.sqrt(variance)
    if std == 0:
        return values
    lower = mean - num_std * std
    upper = mean + num_std * std
    return [v for v in values if lower <= v <= upper]


def remove_outliers_percentile(values: list[float], trim_pct: float = 0.05) -> list[float]:
    if len(values) < 10:
        return values
    sorted_vals = sorted(values)
    trim_count = max(1, int(len(sorted_vals) * trim_pct))
    return sorted_vals[trim_count:-trim_count]


def remove_outliers(values: list[float], method: str, iqr_multiplier: float = 1.5) -> list[float]:
    if method == "none" or len(values) < 3:
        return values
    if method == "iqr":
        return remove_outliers_iqr(values, iqr_multiplier)
    if method == "2_std_dev":
        return remove_outliers_std_dev(values, 2.0)
    if method == "3_std_dev":
        return remove_outliers_std_dev(values, 3.0)
    if method == "percentile_trim":
        return remove_outliers_percentile(values, 0.05)
    return values


def compute_dynamic_thresholds(
    values: list[float],
    direction: str,
    outlier_method: str = "iqr",
    iqr_multiplier: float = 1.5,
) -> dict:
    """Compute A/B/C/D grade thresholds from group data.

    Returns dict with keys: mean, std_dev, grade_a, grade_b, grade_c, grade_d, agent_count
    """
    cleaned = remove_outliers(values, outlier_method, iqr_multiplier)
    if not cleaned:
        cleaned = values
    n = len(cleaned)
    mean = sum(cleaned) / n if n > 0 else 0
    variance = sum((v - mean) ** 2 for v in cleaned) / n if n > 1 else 0
    std = math.sqrt(variance)

    if direction == "lower_better":
        # Lower is better: A is the lowest threshold
        grade_a = max(0, mean - 1.5 * std) if std > 0 else mean * 0.5
        grade_b = mean - 0.5 * std if std > 0 else mean * 0.8
        grade_c = mean + 0.5 * std if std > 0 else mean * 1.2
        grade_d = mean + 1.5 * std if std > 0 else mean * 1.5
    else:
        # Higher is better: A is the highest threshold
        grade_a = min(1.0 if mean <= 1 else mean * 1.5, mean + 1.5 * std) if std > 0 else (0.95 if mean <= 1 else mean * 1.5)
        grade_b = mean + 0.5 * std if std > 0 else (0.85 if mean <= 1 else mean * 1.2)
        grade_c = mean - 0.5 * std if std > 0 else (0.70 if mean <= 1 else mean * 0.8)
        grade_d = max(0, mean - 1.5 * std) if std > 0 else (0.60 if mean <= 1 else mean * 0.5)

    return {
        "mean": round(mean, 4),
        "std_dev": round(std, 4),
        "grade_a": round(grade_a, 4),
        "grade_b": round(grade_b, 4),
        "grade_c": round(grade_c, 4),
        "grade_d": round(grade_d, 4),
        "agent_count": len(values),
    }


def assign_grade(value: float, direction: str, thresholds: dict) -> str:
    """Assign A/B/C/D/F grade based on value and thresholds.

    thresholds must have keys: grade_a, grade_b, grade_c, grade_d
    """
    a = float(thresholds["grade_a"])
    b = float(thresholds["grade_b"])
    c = float(thresholds["grade_c"])
    d = float(thresholds["grade_d"])

    if direction == "lower_better":
        # A <= a threshold, B <= b, C <= c, D <= d, else F
        if value <= a:
            return "A"
        if value <= b:
            return "B"
        if value <= c:
            return "C"
        if value <= d:
            return "D"
        return "F"
    else:
        # A >= a threshold, B >= b, C >= c, D >= d, else F
        if value >= a:
            return "A"
        if value >= b:
            return "B"
        if value >= c:
            return "C"
        if value >= d:
            return "D"
        return "F"


GRADE_POINTS = {"A": 4, "B": 3, "C": 2, "D": 1, "F": 0}
NON_CHANNEL_GRADE_SCORES = {"A": 100, "B": 87.5, "C": 75, "D": 62.5, "F": 50}


def grade_to_points(grade: str) -> int:
    return GRADE_POINTS.get(grade, 0)


def grade_to_non_channel_score(grade: str) -> float:
    return NON_CHANNEL_GRADE_SCORES.get(grade, 50)
