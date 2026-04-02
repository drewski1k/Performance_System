"""Tests for the grade scale calculation and grading logic."""
from app.services.grade_scales import (
    assign_grade,
    compute_dynamic_thresholds,
    grade_to_non_channel_score,
    grade_to_points,
    remove_outliers_iqr,
)


def test_grade_points():
    assert grade_to_points("A") == 4
    assert grade_to_points("B") == 3
    assert grade_to_points("C") == 2
    assert grade_to_points("D") == 1
    assert grade_to_points("F") == 0


def test_non_channel_scores():
    assert grade_to_non_channel_score("A") == 100
    assert grade_to_non_channel_score("B") == 87.5
    assert grade_to_non_channel_score("C") == 75
    assert grade_to_non_channel_score("D") == 62.5
    assert grade_to_non_channel_score("F") == 50


def test_iqr_outlier_removal():
    values = [100, 200, 300, 400, 500, 10000]  # 10000 is outlier
    cleaned = remove_outliers_iqr(values, 1.5)
    assert 10000 not in cleaned
    assert 300 in cleaned


def test_dynamic_thresholds_higher_better():
    # Productivity percentages around 0.85
    values = [0.80, 0.82, 0.85, 0.87, 0.90, 0.88, 0.83, 0.86]
    result = compute_dynamic_thresholds(values, "higher_better", "none")
    # A should be highest, D should be lowest
    assert result["grade_a"] > result["grade_b"]
    assert result["grade_b"] > result["grade_c"]
    assert result["grade_c"] > result["grade_d"]
    assert result["agent_count"] == 8


def test_dynamic_thresholds_lower_better():
    # AHT values in seconds around 300
    values = [250, 280, 300, 320, 350, 290, 310, 275]
    result = compute_dynamic_thresholds(values, "lower_better", "none")
    # A should be lowest (best), D should be highest (worst)
    assert result["grade_a"] < result["grade_b"]
    assert result["grade_b"] < result["grade_c"]
    assert result["grade_c"] < result["grade_d"]


def test_assign_grade_higher_better():
    thresholds = {"grade_a": 95, "grade_b": 85, "grade_c": 75, "grade_d": 65}
    assert assign_grade(98, "higher_better", thresholds) == "A"
    assert assign_grade(90, "higher_better", thresholds) == "B"
    assert assign_grade(80, "higher_better", thresholds) == "C"
    assert assign_grade(70, "higher_better", thresholds) == "D"
    assert assign_grade(50, "higher_better", thresholds) == "F"


def test_assign_grade_lower_better():
    thresholds = {"grade_a": 200, "grade_b": 300, "grade_c": 400, "grade_d": 500}
    assert assign_grade(150, "lower_better", thresholds) == "A"
    assert assign_grade(250, "lower_better", thresholds) == "B"
    assert assign_grade(350, "lower_better", thresholds) == "C"
    assert assign_grade(450, "lower_better", thresholds) == "D"
    assert assign_grade(600, "lower_better", thresholds) == "F"


def test_assign_grade_boundary_higher():
    thresholds = {"grade_a": 90, "grade_b": 80, "grade_c": 70, "grade_d": 60}
    # Exact boundary = gets that grade
    assert assign_grade(90, "higher_better", thresholds) == "A"
    assert assign_grade(80, "higher_better", thresholds) == "B"
    assert assign_grade(70, "higher_better", thresholds) == "C"
    assert assign_grade(60, "higher_better", thresholds) == "D"
    assert assign_grade(59.9, "higher_better", thresholds) == "F"


def test_assign_grade_boundary_lower():
    thresholds = {"grade_a": 200, "grade_b": 300, "grade_c": 400, "grade_d": 500}
    assert assign_grade(200, "lower_better", thresholds) == "A"
    assert assign_grade(300, "lower_better", thresholds) == "B"
    assert assign_grade(400, "lower_better", thresholds) == "C"
    assert assign_grade(500, "lower_better", thresholds) == "D"
    assert assign_grade(501, "lower_better", thresholds) == "F"
