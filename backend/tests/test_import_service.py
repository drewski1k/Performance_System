"""Test the smart import service against actual Excel data."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.import_service import (
    detect_data_type,
    parse_paste,
    process_combined_data,
    process_glance_report,
    process_hc_data,
    process_qa_data,
    validate_combined_import,
    validate_hc_import,
)

EXCEL_PATH = Path(__file__).parent.parent.parent / "Peformance Analysis.xlsx"


def load_sheet(sheet_name: str):
    import pandas as pd
    return pd.read_excel(str(EXCEL_PATH), sheet_name=sheet_name)


@pytest.fixture(scope="module")
def combined_df():
    if not EXCEL_PATH.exists():
        pytest.skip("Excel file not found")
    return load_sheet("Combined by Cycle Person (2)")


@pytest.fixture(scope="module")
def glance_df():
    if not EXCEL_PATH.exists():
        pytest.skip("Excel file not found")
    return load_sheet("AgentSummaryGlanceReport")


@pytest.fixture(scope="module")
def qa_df():
    if not EXCEL_PATH.exists():
        pytest.skip("Excel file not found")
    return load_sheet("QA Data")


@pytest.fixture(scope="module")
def hc_df():
    if not EXCEL_PATH.exists():
        pytest.skip("Excel file not found")
    return load_sheet("HC Data")


class TestDetectDataType:
    def test_detect_combined(self, combined_df):
        assert detect_data_type(combined_df) == "combined"

    def test_detect_glance(self, glance_df):
        assert detect_data_type(glance_df) == "glance_report"

    def test_detect_qa(self, qa_df):
        assert detect_data_type(qa_df) == "qa_data"

    def test_detect_hc(self, hc_df):
        assert detect_data_type(hc_df) == "hc_data"


class TestParsePaste:
    def test_tab_separated(self):
        text = "Person Name\tCycle\tLogged in Time (hrs)\nJohn\t3\t80.5\nJane\t3\t65.2"
        df = parse_paste(text)
        assert len(df) == 2
        assert "Person Name" in df.columns

    def test_comma_separated(self):
        text = "Associate Name,Total Evaluations,Average Quality Score %\nJohn,10,0.92\nJane,8,0.88"
        df = parse_paste(text)
        assert len(df) == 2
        assert "Associate Name" in df.columns


class TestProcessCombinedData:
    def test_all_cycles(self, combined_df):
        records = process_combined_data(combined_df)
        assert len(records) > 100
        print(f"\nCombined: {len(records)} total records across all cycles")

    def test_cycle_filter(self, combined_df):
        records = process_combined_data(combined_df, cycle=3)
        assert len(records) > 50
        print(f"Cycle 3: {len(records)} records")

        # All should be cycle 3
        for r in records:
            assert r["cycle"] == 3

    def test_metrics_computed(self, combined_df):
        records = process_combined_data(combined_df, cycle=3)

        # Find an agent with voice contacts
        voice_agents = [r for r in records if r["metrics"].get("contact_accepted_voice", 0) > 0]
        assert len(voice_agents) > 0, "Should have agents with voice contacts"

        agent = voice_agents[0]
        print(f"\nSample agent: {agent['name']}")
        print(f"  Metrics: {sorted(agent['metrics'].keys())}")

        # Should have derived metrics
        assert "voice_aht" in agent["metrics"], "Should compute voice AHT"
        assert agent["metrics"]["voice_aht"] > 0

    def test_productivity_computed(self, combined_df):
        records = process_combined_data(combined_df, cycle=3)
        prod_agents = [r for r in records if "productivity_pct" in r["metrics"]]
        assert len(prod_agents) > 50, "Most agents should have productivity"

        # Verify range
        for r in prod_agents:
            prod = r["metrics"]["productivity_pct"]
            assert 0 <= prod <= 1.5, f"{r['name']} has invalid productivity: {prod}"

        # Compare to Excel expected
        detesria = next((r for r in records if "Detesria" in r["name"]), None)
        if detesria:
            prod = detesria["metrics"]["productivity_pct"]
            print(f"\nDetesria Lovelace productivity: {prod:.4f}")
            # Note: exact productivity (96.3%) requires Glance Report's Available Time.
            # From Combined sheet durations, we get an approximation.
            assert 0.3 < prod <= 1.0, f"Productivity should be reasonable, got {prod:.4f}"

    def test_qa_scores_present(self, combined_df):
        records = process_combined_data(combined_df, cycle=3)
        qa_agents = [r for r in records if "qa_score_pct" in r["metrics"]]
        assert len(qa_agents) > 50
        print(f"\nAgents with QA scores: {len(qa_agents)}")


class TestProcessGlanceReport:
    def test_processes_correctly(self, glance_df):
        records = process_glance_report(glance_df)
        assert len(records) > 50
        print(f"\nGlance report: {len(records)} records")

    def test_has_channel_available_times(self, glance_df):
        records = process_glance_report(glance_df)
        voice_agents = [r for r in records if r["metrics"].get("voice_avail_time", 0) > 0]
        assert len(voice_agents) > 0, "Should have agents with voice available time"
        print(f"Agents with voice available time: {len(voice_agents)}")

    def test_computes_cph_from_available_time(self, glance_df):
        records = process_glance_report(glance_df)
        cph_agents = [r for r in records if "voice_cph" in r["metrics"]]
        if cph_agents:
            agent = cph_agents[0]
            print(f"\n{agent['name']}: Voice CPH = {agent['metrics']['voice_cph']:.2f}")
            assert agent["metrics"]["voice_cph"] > 0


class TestProcessQAData:
    def test_processes_correctly(self, qa_df):
        records = process_qa_data(qa_df)
        # The QA Data sheet in this workbook has a filtered view (~25 rows).
        # Full QA data is embedded in the Combined sheet.
        assert len(records) > 5
        print(f"\nQA Data: {len(records)} records")

        # Check first record
        agent = records[0]
        assert "qa_score_pct" in agent["metrics"]
        assert "total_evaluations" in agent["metrics"]
        assert 0 < agent["metrics"]["qa_score_pct"] <= 1.0


class TestProcessHCData:
    def test_processes_correctly(self, hc_df):
        records = process_hc_data(hc_df)
        assert len(records) > 50
        print(f"\nHC Data: {len(records)} records")

    def test_has_hierarchy_info(self, hc_df):
        records = process_hc_data(hc_df)
        sites = set(r["site"] for r in records if r["site"])
        bpos = set(r["bpo"] for r in records if r["bpo"])
        supervisors = set(r["supervisor"] for r in records if r["supervisor"])

        print(f"Sites: {sorted(sites)}")
        print(f"BPOs: {sorted(bpos)}")
        print(f"Supervisors: {len(supervisors)} total")

        assert len(sites) > 0
        assert len(bpos) > 0


class TestValidation:
    def test_validate_combined(self, combined_df):
        records = process_combined_data(combined_df, cycle=3)
        result = validate_combined_import(records)

        print(f"\nCombined validation:")
        print(f"  Valid rows: {result['valid_rows']}")
        print(f"  Metrics found: {result['total_metrics']}")
        print(f"  Warnings: {result['warnings']}")
        print(f"  Preview rows: {len(result['preview'])}")

        assert result["valid_rows"] > 50
        assert result["total_metrics"] > 5
        assert len(result["preview"]) > 0

    def test_validate_hc(self, hc_df):
        records = process_hc_data(hc_df)
        result = validate_hc_import(records)

        print(f"\nHC validation:")
        print(f"  Valid rows: {result['valid_rows']}")
        print(f"  BPOs: {result['bpos']}")
        print(f"  Sites: {result['sites']}")

        assert result["valid_rows"] > 50


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
