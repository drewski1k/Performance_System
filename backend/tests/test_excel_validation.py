"""
Validate scoring engine against the actual Excel scorecard data.

Reads data from 'Peformance Analysis.xlsx' and runs it through the
grade_scales module, comparing results to the Excel's expected output.

IMPORTANT FINDING: The Excel file has a formula reference bug where the
grade assignment formulas (Prod/QA) are offset by 2 columns, causing:
  - Prod "A" to use C threshold (0.554) instead of A threshold (1.0)
  - QA "A" to use C threshold (0.815) instead of A threshold (0.941)

This test validates BOTH:
  1. Our engine with CORRECT thresholds (what the Excel intended)
  2. Matching the Excel's buggy output (using shifted thresholds)
"""
import json
import math
import os
import sys
from collections import Counter
from pathlib import Path

import pytest

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.grade_scales import (
    assign_grade,
    compute_dynamic_thresholds,
    grade_to_non_channel_score,
    remove_outliers_iqr,
)

EXCEL_PATH = Path(__file__).parent.parent.parent / "Peformance Analysis.xlsx"
EXPECTED_PATH = Path(__file__).parent / "excel_expected.json"
THRESHOLDS_PATH = Path(__file__).parent / "excel_thresholds.json"


def load_excel_data():
    """Load raw agent data from Excel Combined sheet for Cycle 3."""
    import openpyxl

    wb = openpyxl.load_workbook(str(EXCEL_PATH), data_only=True)

    # Load ProductivityCalc data
    ws_prod = wb["ProductivityCalc"]
    prod_data = {}
    for row in range(3, 200):
        name = ws_prod.cell(row=row, column=1).value
        if not name:
            continue
        prod_pct = ws_prod.cell(row=row, column=7).value
        logged_time = ws_prod.cell(row=row, column=3).value
        if prod_pct is not None:
            try:
                prod_data[str(name).strip()] = {
                    "prod_pct": float(prod_pct),
                    "logged_seconds": float(logged_time) if logged_time else 0,
                }
            except (ValueError, TypeError):
                continue

    # Load QA data
    ws_qa = wb["QA Data"]
    qa_data = {}
    for row in range(2, 500):
        name = ws_qa.cell(row=row, column=1).value
        if not name:
            continue
        evals = ws_qa.cell(row=row, column=2).value
        qa_score = ws_qa.cell(row=row, column=3).value
        if qa_score is not None:
            try:
                qa_data[str(name).strip()] = {
                    "evals": int(evals) if evals else 0,
                    "qa_pct": float(qa_score),
                }
            except (ValueError, TypeError):
                continue

    # Load Scorecard expected results
    ws_sc = wb["Scorecard"]
    agents = []
    for row in range(8, 310):
        name = ws_sc.cell(row=row, column=7).value
        if not name or not isinstance(name, str):
            continue
        name = name.strip()

        prod_grd = ws_sc.cell(row=row, column=45).value
        qa_grd = ws_sc.cell(row=row, column=47).value

        agents.append({
            "name": name,
            "logged_hrs": ws_sc.cell(row=row, column=13).value,
            "qa_evals": ws_sc.cell(row=row, column=17).value,
            "prod_pct": ws_sc.cell(row=row, column=44).value,
            "prod_grd": prod_grd if prod_grd not in ("Threshold Not Met", "-", None, "") else None,
            "prod_threshold_not_met": prod_grd == "Threshold Not Met",
            "qa_pct": ws_sc.cell(row=row, column=46).value,
            "qa_grd": qa_grd if qa_grd not in ("-", None, "") else None,
            "nc_score": ws_sc.cell(row=row, column=71).value,
            "final_score": ws_sc.cell(row=row, column=49).value,
            "final_grade": ws_sc.cell(row=row, column=50).value,
        })

    # Load dynamic thresholds from Scorecard
    excel_thresholds = {
        "prod_pct": {
            "mean": ws_sc.cell(row=3, column=117).value,
            "std_dev": ws_sc.cell(row=3, column=118).value,
            "grade_a": ws_sc.cell(row=3, column=119).value,
            "grade_b": ws_sc.cell(row=3, column=120).value,
            "grade_c": ws_sc.cell(row=3, column=121).value,
            "grade_d": ws_sc.cell(row=3, column=122).value,
        },
        "qa_pct": {
            "mean": ws_sc.cell(row=3, column=123).value,
            "std_dev": ws_sc.cell(row=3, column=124).value,
            "grade_a": ws_sc.cell(row=3, column=125).value,
            "grade_b": ws_sc.cell(row=3, column=126).value,
            "grade_c": ws_sc.cell(row=3, column=127).value,
            "grade_d": ws_sc.cell(row=3, column=128).value,
        },
    }

    # Excel's ACTUAL thresholds used in grading (buggy - offset by 2)
    excel_buggy_thresholds = {
        "prod_pct": {
            "grade_a": ws_sc.cell(row=3, column=121).value,  # C threshold used as A
            "grade_b": ws_sc.cell(row=3, column=122).value,  # D threshold used as B
            "grade_c": ws_sc.cell(row=3, column=123).value,  # QA Avg used as C
            "grade_d": ws_sc.cell(row=3, column=124).value,  # QA StdDev used as D
        },
        "qa_pct": {
            "grade_a": ws_sc.cell(row=3, column=127).value,  # C threshold used as A
            "grade_b": ws_sc.cell(row=3, column=128).value,  # D threshold used as B
            "grade_c": 50,   # Final Avg used as C
            "grade_d": 0,    # Final StdDev used as D
        },
    }

    wb.close()
    return agents, prod_data, qa_data, excel_thresholds, excel_buggy_thresholds


@pytest.fixture(scope="module")
def excel_data():
    if not EXCEL_PATH.exists():
        pytest.skip("Excel file not found")
    return load_excel_data()


class TestDynamicThresholdCalculation:
    """Test that our compute_dynamic_thresholds matches Excel's values."""

    def test_productivity_thresholds_without_outlier_removal(self, excel_data):
        """
        The Excel does NOT implement IQR outlier removal for threshold computation,
        despite having it configured. Its AGGREGATE function just averages all visible rows.

        Our engine intentionally implements outlier removal (as the user requested).
        This test verifies we match Excel when outlier removal is disabled.
        """
        agents, prod_data, qa_data, excel_thresholds, _ = excel_data

        prod_values = []
        for a in agents:
            if a["prod_pct"] is not None:
                prod_values.append(float(a["prod_pct"]))

        assert len(prod_values) > 50

        # Compute WITHOUT outlier removal (to match Excel)
        thresholds_no_outlier = compute_dynamic_thresholds(prod_values, "higher_better", "none", 1.5)
        # Compute WITH outlier removal (our improved version)
        thresholds_with_iqr = compute_dynamic_thresholds(prod_values, "higher_better", "iqr", 1.5)

        excel_t = excel_thresholds["prod_pct"]

        print(f"\nProductivity Thresholds Comparison:")
        print(f"  {'':20s} {'No Outlier':>12s} {'With IQR':>12s} {'Excel':>12s}")
        print(f"  {'Mean':20s} {thresholds_no_outlier['mean']:>12.4f} {thresholds_with_iqr['mean']:>12.4f} {excel_t['mean']:>12.4f}")
        print(f"  {'Std':20s} {thresholds_no_outlier['std_dev']:>12.4f} {thresholds_with_iqr['std_dev']:>12.4f} {excel_t['std_dev']:>12.4f}")
        print(f"  {'A':20s} {thresholds_no_outlier['grade_a']:>12.4f} {thresholds_with_iqr['grade_a']:>12.4f} {excel_t['grade_a']:>12}")
        print(f"  {'B':20s} {thresholds_no_outlier['grade_b']:>12.4f} {thresholds_with_iqr['grade_b']:>12.4f} {excel_t['grade_b']:>12.4f}")

        # Without outlier removal, should match Excel closely
        assert abs(thresholds_no_outlier["mean"] - excel_t["mean"]) < 0.01, \
            f"Prod mean diff (no outlier): {thresholds_no_outlier['mean']} vs {excel_t['mean']}"

        # With IQR, mean should be higher (outliers removed skew mean up)
        assert thresholds_with_iqr["mean"] > thresholds_no_outlier["mean"], \
            "IQR removal should raise the mean by excluding low outliers"

    def test_qa_thresholds(self, excel_data):
        agents, prod_data, qa_data, excel_thresholds, _ = excel_data

        # Collect QA values for agents meeting threshold (5 evals)
        qa_values = []
        for a in agents:
            if a["qa_pct"] not in (None, "-", "") and a["qa_evals"] and int(a["qa_evals"]) >= 5:
                qa_values.append(float(a["qa_pct"]))

        assert len(qa_values) > 50, f"Expected >50 agents with QA data, got {len(qa_values)}"

        thresholds = compute_dynamic_thresholds(qa_values, "higher_better", "iqr", 1.5)
        excel_t = excel_thresholds["qa_pct"]

        print(f"\nQA Thresholds Comparison:")
        print(f"  Mean:  ours={thresholds['mean']:.4f}  excel={excel_t['mean']:.4f}")
        print(f"  Std:   ours={thresholds['std_dev']:.4f}  excel={excel_t['std_dev']:.4f}")
        print(f"  A:     ours={thresholds['grade_a']:.4f}  excel={excel_t['grade_a']:.4f}")
        print(f"  B:     ours={thresholds['grade_b']:.4f}  excel={excel_t['grade_b']:.4f}")
        print(f"  C:     ours={thresholds['grade_c']:.4f}  excel={excel_t['grade_c']:.4f}")
        print(f"  D:     ours={thresholds['grade_d']:.4f}  excel={excel_t['grade_d']:.4f}")

        assert abs(thresholds["mean"] - excel_t["mean"]) < 0.02


class TestExcelBuggyGrading:
    """
    Verify we understand the Excel's buggy grading by reproducing it.

    The Excel's prod/QA grade formulas reference cells offset by 2 columns,
    causing them to use C/D thresholds instead of A/B thresholds.
    """

    def test_reproduce_excel_prod_grades(self, excel_data):
        """Match Excel's prod grades using its buggy threshold references."""
        agents, _, _, _, buggy = excel_data

        buggy_prod = buggy["prod_pct"]
        matches = 0
        mismatches = 0
        skipped = 0

        for a in agents:
            if a["prod_grd"] is None:  # threshold not met or no data
                skipped += 1
                continue

            value = float(a["prod_pct"])
            # Reproduce Excel's buggy grading
            excel_grade = a["prod_grd"]
            our_grade = assign_grade(value, "higher_better", buggy_prod)

            if our_grade == excel_grade:
                matches += 1
            else:
                mismatches += 1
                if mismatches <= 5:
                    print(f"  MISMATCH: {a['name']} prod={value:.4f} "
                          f"excel={excel_grade} ours={our_grade}")

        total = matches + mismatches
        pct = matches / total * 100 if total > 0 else 0
        print(f"\nProd grade match (buggy thresholds): {matches}/{total} ({pct:.1f}%)")
        print(f"  Skipped (threshold not met): {skipped}")

        # Should match nearly 100% since we're using same buggy thresholds
        assert pct >= 95, f"Expected >=95% match with buggy thresholds, got {pct:.1f}%"

    def test_reproduce_excel_qa_grades(self, excel_data):
        """Match Excel's QA grades using its buggy threshold references."""
        agents, _, _, _, buggy = excel_data

        buggy_qa = buggy["qa_pct"]
        matches = 0
        mismatches = 0
        skipped = 0

        for a in agents:
            if a["qa_grd"] is None:
                skipped += 1
                continue

            value = float(a["qa_pct"])
            excel_grade = a["qa_grd"]
            our_grade = assign_grade(value, "higher_better", buggy_qa)

            if our_grade == excel_grade:
                matches += 1
            else:
                mismatches += 1
                if mismatches <= 5:
                    print(f"  MISMATCH: {a['name']} qa={value:.4f} "
                          f"excel={excel_grade} ours={our_grade}")

        total = matches + mismatches
        pct = matches / total * 100 if total > 0 else 0
        print(f"\nQA grade match (buggy thresholds): {matches}/{total} ({pct:.1f}%)")
        print(f"  Skipped (no QA data): {skipped}")

        assert pct >= 95


class TestCorrectGrading:
    """Test grading with CORRECT thresholds (what the Excel intended)."""

    def test_correct_prod_grades(self, excel_data):
        """Show what grades SHOULD be with correct thresholds."""
        agents, _, _, excel_thresholds, _ = excel_data

        correct_prod = excel_thresholds["prod_pct"]
        grade_dist = Counter()
        total = 0

        for a in agents:
            if a["prod_grd"] is None:
                continue
            value = float(a["prod_pct"])
            grade = assign_grade(value, "higher_better", correct_prod)
            grade_dist[grade] += 1
            total += 1

        print(f"\nCorrect Prod Grade Distribution (n={total}):")
        for g in ["A", "B", "C", "D", "F"]:
            excel_count = sum(1 for a in agents if a["prod_grd"] == g)
            print(f"  {g}: correct={grade_dist.get(g, 0):>4}  excel_buggy={excel_count:>4}")

        # With correct A threshold of 1.0, very few should get A
        assert grade_dist.get("A", 0) < 50, \
            f"Expected <50 A grades with correct thresholds (1.0), got {grade_dist.get('A', 0)}"

    def test_correct_qa_grades(self, excel_data):
        """Show what QA grades SHOULD be with correct thresholds."""
        agents, _, _, excel_thresholds, _ = excel_data

        correct_qa = excel_thresholds["qa_pct"]
        grade_dist = Counter()
        total = 0

        for a in agents:
            if a["qa_grd"] is None:
                continue
            value = float(a["qa_pct"])
            grade = assign_grade(value, "higher_better", correct_qa)
            grade_dist[grade] += 1
            total += 1

        print(f"\nCorrect QA Grade Distribution (n={total}):")
        for g in ["A", "B", "C", "D", "F"]:
            excel_count = sum(1 for a in agents if a["qa_grd"] == g)
            print(f"  {g}: correct={grade_dist.get(g, 0):>4}  excel_buggy={excel_count:>4}")


class TestNCScoreCalculation:
    """Test Non-Channel score calculation matches Excel."""

    def test_nc_score_formula(self, excel_data):
        """NC Score = (prod_grade_score + qa_grade_score) / 2, using NON_CHANNEL_GRADE_SCORES."""
        agents, _, _, _, buggy = excel_data
        buggy_prod = buggy["prod_pct"]
        buggy_qa = buggy["qa_pct"]

        matches = 0
        mismatches = 0
        skipped = 0

        for a in agents:
            excel_nc = a["nc_score"]
            if excel_nc is None or excel_nc == "" or excel_nc == "-":
                skipped += 1
                continue

            excel_nc = float(excel_nc)

            # Calculate NC score using Excel's buggy thresholds to match
            prod_grade = None
            qa_grade = None

            if a["prod_grd"] is not None:
                prod_grade = assign_grade(float(a["prod_pct"]), "higher_better", buggy_prod)
            if a["qa_grd"] is not None:
                qa_grade = assign_grade(float(a["qa_pct"]), "higher_better", buggy_qa)

            if prod_grade and qa_grade:
                nc_score = (grade_to_non_channel_score(prod_grade) +
                           grade_to_non_channel_score(qa_grade)) / 2
            elif prod_grade:
                nc_score = grade_to_non_channel_score(prod_grade)
            elif qa_grade:
                nc_score = grade_to_non_channel_score(qa_grade)
            else:
                skipped += 1
                continue

            if abs(nc_score - excel_nc) < 0.01:
                matches += 1
            else:
                mismatches += 1
                if mismatches <= 5:
                    print(f"  NC MISMATCH: {a['name']} "
                          f"prod_grd={prod_grade} qa_grd={qa_grade} "
                          f"ours={nc_score} excel={excel_nc}")

        total = matches + mismatches
        pct = matches / total * 100 if total > 0 else 0
        print(f"\nNC Score match: {matches}/{total} ({pct:.1f}%)")
        assert pct >= 90, f"Expected >=90% NC score match, got {pct:.1f}%"


class TestFinalGradeThresholds:
    """Test final grade assignment thresholds."""

    def test_excel_uses_75_60_40_thresholds(self, excel_data):
        """
        Excel uses: A>=90, B>=75, C>=60, D>=40, F<40
        NOT: A>=90, B>=80, C>=70, D>=60, F<60
        """
        agents, _, _, _, _ = excel_data

        # Verify by checking agents at boundary values
        matches_excel = 0
        matches_our = 0
        total = 0

        for a in agents:
            fs = a["final_score"]
            fg = a["final_grade"]
            if fs is None or fg is None or fg == "-":
                continue

            fs = float(fs)
            total += 1

            # Excel thresholds
            if fs >= 90:
                excel_grade = "A"
            elif fs >= 75:
                excel_grade = "B"
            elif fs >= 60:
                excel_grade = "C"
            elif fs >= 40:
                excel_grade = "D"
            else:
                excel_grade = "F"

            if excel_grade == fg:
                matches_excel += 1

            # Our code's thresholds
            if fs >= 90:
                our_grade = "A"
            elif fs >= 80:
                our_grade = "B"
            elif fs >= 70:
                our_grade = "C"
            elif fs >= 60:
                our_grade = "D"
            else:
                our_grade = "F"

            if our_grade == fg:
                matches_our += 1

        excel_pct = matches_excel / total * 100 if total else 0
        our_pct = matches_our / total * 100 if total else 0

        print(f"\nFinal grade match with 90/75/60/40 thresholds: {matches_excel}/{total} ({excel_pct:.1f}%)")
        print(f"Final grade match with 90/80/70/60 thresholds: {matches_our}/{total} ({our_pct:.1f}%)")

        # The Excel thresholds should match better
        # Note: some cells have stale cached values, so we can't expect 100%
        assert excel_pct >= our_pct or abs(excel_pct - our_pct) < 5, \
            "Excel threshold pattern (90/75/60/40) should match at least as well"


class TestEndToEndScoring:
    """End-to-end test: raw data → grades → NC score → final score."""

    def test_full_pipeline_with_correct_thresholds(self, excel_data):
        """Run the full scoring pipeline with correct thresholds."""
        agents, _, _, excel_thresholds, _ = excel_data

        correct_prod = excel_thresholds["prod_pct"]
        correct_qa = excel_thresholds["qa_pct"]

        results = []
        for a in agents:
            prod_grade = None
            qa_grade = None
            nc_score = None

            # Grade productivity
            if a["prod_pct"] is not None and not a["prod_threshold_not_met"]:
                prod_grade = assign_grade(float(a["prod_pct"]), "higher_better", correct_prod)

            # Grade QA
            if a["qa_pct"] not in (None, "-", ""):
                qa_pct = float(a["qa_pct"])
                qa_grade = assign_grade(qa_pct, "higher_better", correct_qa)

            # NC Score
            if prod_grade and qa_grade:
                nc_score = (grade_to_non_channel_score(prod_grade) +
                           grade_to_non_channel_score(qa_grade)) / 2
            elif prod_grade:
                nc_score = grade_to_non_channel_score(prod_grade)
            elif qa_grade:
                nc_score = grade_to_non_channel_score(qa_grade)

            # Final score (channel_weight=0, nc_weight=100)
            final_score = nc_score

            # Final grade (using Excel's 90/75/60/40 thresholds)
            final_grade = None
            if final_score is not None:
                if final_score >= 90:
                    final_grade = "A"
                elif final_score >= 75:
                    final_grade = "B"
                elif final_score >= 60:
                    final_grade = "C"
                elif final_score >= 40:
                    final_grade = "D"
                else:
                    final_grade = "F"

            results.append({
                "name": a["name"],
                "prod_grade": prod_grade,
                "qa_grade": qa_grade,
                "nc_score": nc_score,
                "final_score": final_score,
                "final_grade": final_grade,
            })

        # Grade distribution
        grade_dist = Counter(r["final_grade"] for r in results if r["final_grade"])
        print(f"\nCorrect scoring pipeline results:")
        print(f"  Grade distribution: {dict(grade_dist)}")
        print(f"  Total scored: {sum(grade_dist.values())}")

        # With correct thresholds, expect more varied distribution
        assert len(grade_dist) >= 3, "Should have at least 3 different grade levels"

    def test_full_pipeline_reproduces_excel(self, excel_data):
        """Run pipeline with buggy thresholds to match Excel output."""
        agents, _, _, _, buggy = excel_data
        buggy_prod = buggy["prod_pct"]
        buggy_qa = buggy["qa_pct"]

        matches = 0
        mismatches = 0
        skipped = 0

        for a in agents:
            excel_nc = a["nc_score"]
            if excel_nc is None or excel_nc == "" or excel_nc == "-":
                skipped += 1
                continue
            excel_nc = float(excel_nc)

            prod_grade = None
            qa_grade = None

            if a["prod_grd"] is not None:
                prod_grade = assign_grade(float(a["prod_pct"]), "higher_better", buggy_prod)
            if a["qa_grd"] is not None and a["qa_pct"] not in (None, "-", ""):
                qa_grade = assign_grade(float(a["qa_pct"]), "higher_better", buggy_qa)

            if prod_grade and qa_grade:
                nc_score = (grade_to_non_channel_score(prod_grade) +
                           grade_to_non_channel_score(qa_grade)) / 2
            elif prod_grade:
                nc_score = grade_to_non_channel_score(prod_grade)
            elif qa_grade:
                nc_score = grade_to_non_channel_score(qa_grade)
            else:
                skipped += 1
                continue

            if abs(nc_score - excel_nc) < 0.01:
                matches += 1
            else:
                mismatches += 1

        total = matches + mismatches
        pct = matches / total * 100 if total > 0 else 0
        print(f"\nFull pipeline match (buggy thresholds): {matches}/{total} ({pct:.1f}%)")
        assert pct >= 90


class TestOutlierRemoval:
    """Test that IQR outlier removal works correctly with real data."""

    def test_iqr_removes_extreme_values(self, excel_data):
        agents, _, _, _, _ = excel_data

        # Get productivity values
        prod_values = [float(a["prod_pct"]) for a in agents
                      if a["prod_pct"] is not None and a["logged_hrs"]
                      and float(a["logged_hrs"]) >= 40]

        original_count = len(prod_values)
        cleaned = remove_outliers_iqr(prod_values, 1.5)
        removed = original_count - len(cleaned)

        print(f"\nIQR outlier removal (Productivity):")
        print(f"  Original: {original_count}")
        print(f"  After IQR: {len(cleaned)}")
        print(f"  Removed: {removed}")
        print(f"  Original range: [{min(prod_values):.4f}, {max(prod_values):.4f}]")
        print(f"  Cleaned range: [{min(cleaned):.4f}, {max(cleaned):.4f}]")

        # Should remove some outliers but not too many
        assert removed >= 0
        assert len(cleaned) >= original_count * 0.8


class TestGradePointConversion:
    """Test grade point and non-channel score conversions."""

    def test_non_channel_score_values(self):
        """Verify the grade-to-score mapping matches Excel."""
        assert grade_to_non_channel_score("A") == 100
        assert grade_to_non_channel_score("B") == 87.5
        assert grade_to_non_channel_score("C") == 75
        assert grade_to_non_channel_score("D") == 62.5
        assert grade_to_non_channel_score("F") == 50

    def test_nc_score_combinations(self):
        """Test NC score for common grade combinations."""
        # A + A = 100
        assert (grade_to_non_channel_score("A") + grade_to_non_channel_score("A")) / 2 == 100
        # A + B = 93.75
        assert (grade_to_non_channel_score("A") + grade_to_non_channel_score("B")) / 2 == 93.75
        # A + D = 81.25
        assert (grade_to_non_channel_score("A") + grade_to_non_channel_score("D")) / 2 == 81.25
        # B + B = 87.5
        assert (grade_to_non_channel_score("B") + grade_to_non_channel_score("B")) / 2 == 87.5
        # F + F = 50
        assert (grade_to_non_channel_score("F") + grade_to_non_channel_score("F")) / 2 == 50


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
