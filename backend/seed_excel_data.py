"""
Seed script: Load data from Peformance Analysis.xlsx into the database.

Usage: DATABASE_URL=postgresql://... python seed_excel_data.py

Steps:
1. Import HC Data → create hierarchy (Company, Sites, Supervisors, Agents)
2. Create a scorecard template matching the Excel config
3. Create a scoring period for Cycle 3
4. Import Combined Data (Cycle 3) → performance records
5. Run the scoring engine
"""
import os
import sys
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

os.environ.setdefault("DATABASE_URL", "postgresql://perf_user:perf_pass@localhost:5432/performance_db")

import pandas as pd
from sqlalchemy import select

from app.database import SessionLocal
from app.models import (
    Company, MetricDefinition, PfpConfig, ScorecardMetric,
    ScorecardTemplate, ScoringPeriod,
)
from app.services.import_service import (
    execute_hc_import,
    execute_performance_import,
    process_combined_data,
    process_hc_data,
    process_qa_data,
)
from app.services.scoring import calculate_scores

EXCEL_PATH = Path(__file__).parent.parent / "Peformance Analysis.xlsx"


def seed():
    db = SessionLocal()
    try:
        print("=" * 60)
        print("SEEDING DATABASE FROM EXCEL")
        print("=" * 60)

        # ---------------------------------------------------------------
        # Step 1: Import HC Data (hierarchy)
        # ---------------------------------------------------------------
        print("\n[1/5] Importing HC Data (hierarchy)...")
        hc_df = pd.read_excel(str(EXCEL_PATH), sheet_name="HC Data")
        hc_records = process_hc_data(hc_df)
        hc_stats = execute_hc_import(db, hc_records, company_name="Sephora")
        print(f"  Sites: {hc_stats['sites_created']}")
        print(f"  Supervisors: {hc_stats['supervisors_created']}")
        print(f"  Agents: {hc_stats['agents_created']} created, {hc_stats['agents_updated']} updated")

        # ---------------------------------------------------------------
        # Step 2: Create scorecard template
        # ---------------------------------------------------------------
        print("\n[2/5] Creating scorecard template...")
        company = db.scalar(select(Company).where(Company.name == "Sephora"))

        # Check if template already exists
        existing = db.scalar(select(ScorecardTemplate).where(ScorecardTemplate.name == "Sephora Scorecard"))
        if existing:
            template = existing
            print(f"  Template already exists: {template.id}")
        else:
            template = ScorecardTemplate(
                company_id=company.id,
                name="Sephora Scorecard",
                period_type="biweekly",
                channel_weight=Decimal("0"),  # 0% channel
                non_channel_weight=Decimal("100"),  # 100% non-channel
                outlier_method="iqr",
                iqr_multiplier=Decimal("1.5"),
                is_active=True,
            )
            db.add(template)
            db.flush()
            print(f"  Template created: {template.id}")

            # Add scored metrics to template
            metric_configs = [
                # (metric_key, weight, include_in_score, show_on_scorecard, min_threshold, threshold_basis)
                ("voice_aht", 50, True, True, 30, "voice_contacts"),
                ("voice_cph", 50, True, True, 30, "voice_contacts"),
                ("chat_aht", 50, True, True, 30, "chat_contacts"),
                ("chat_cph", 50, True, True, 30, "chat_contacts"),
                ("email_aht", 50, True, True, 10, "email_contacts"),
                ("email_cph", 50, True, True, 10, "email_contacts"),
                ("productivity_pct", 50, True, False, 40, "logged_hours"),
                ("qa_score_pct", 50, True, False, 5, "qa_evaluations"),
                # Context-only metrics
                ("occupancy_pct", 0, False, True, 0, ""),
                ("total_logged_time", 0, False, True, 0, ""),
                ("total_active_time", 0, False, False, 0, ""),
                ("total_evaluations", 0, False, True, 0, ""),
                ("contact_accepted_voice", 0, False, True, 0, ""),
                ("contact_accepted_chat", 0, False, True, 0, ""),
                ("contact_accepted_email", 0, False, True, 0, ""),
            ]

            for i, (key, weight, scored, show, threshold, basis) in enumerate(metric_configs):
                metric_def = db.scalar(select(MetricDefinition).where(MetricDefinition.key == key))
                if not metric_def:
                    print(f"  WARNING: Metric '{key}' not found in definitions, skipping")
                    continue
                sm = ScorecardMetric(
                    template_id=template.id,
                    metric_id=metric_def.id,
                    weight=Decimal(str(weight)),
                    include_in_score=scored,
                    show_on_scorecard=show,
                    min_threshold=Decimal(str(threshold)),
                    threshold_basis=basis,
                    grade_mode="dynamic",
                    sort_order=i,
                )
                db.add(sm)

            # PFP config
            pfp = PfpConfig(
                template_id=template.id,
                grade_a_rate=Decimal("3"),
                grade_b_rate=Decimal("2"),
                grade_c_rate=Decimal("0"),
                grade_d_rate=Decimal("0"),
                grade_f_rate=Decimal("0"),
            )
            db.add(pfp)
            db.flush()
            print(f"  Added {len(metric_configs)} metrics to template")
            print("  PFP config: A=$3/hr, B=$2/hr, C/D/F=$0")

        # ---------------------------------------------------------------
        # Step 3: Create scoring period
        # ---------------------------------------------------------------
        print("\n[3/5] Creating scoring period (Cycle 3)...")
        existing_period = db.scalar(select(ScoringPeriod).where(ScoringPeriod.label == "Cycle 3"))
        if existing_period:
            period = existing_period
            print(f"  Period already exists: {period.id}")
        else:
            period = ScoringPeriod(
                company_id=company.id,
                label="Cycle 3",
                period_type="biweekly",
                start_date=date(2026, 3, 8),
                end_date=date(2026, 3, 21),
            )
            db.add(period)
            db.flush()
            print(f"  Period created: {period.id}")

        # ---------------------------------------------------------------
        # Step 4: Import performance data
        # ---------------------------------------------------------------
        print("\n[4/5] Importing Combined Data (Cycle 3)...")
        combined_df = pd.read_excel(str(EXCEL_PATH), sheet_name="Combined by Cycle Person (2)")
        combined_records = process_combined_data(combined_df, cycle=3)
        print(f"  Parsed {len(combined_records)} agent records")

        # Also merge in QA data (Combined sheet has QA but separate sheet may have more)
        qa_df = pd.read_excel(str(EXCEL_PATH), sheet_name="QA Data")
        qa_records = process_qa_data(qa_df)

        # Merge QA into combined (by name)
        qa_by_name = {r["name"]: r["metrics"] for r in qa_records}
        for r in combined_records:
            qa_extra = qa_by_name.get(r["name"], {})
            for k, v in qa_extra.items():
                if k not in r["metrics"] or r["metrics"][k] == 0:
                    r["metrics"][k] = v

        perf_stats = execute_performance_import(db, combined_records, template.id, period.id)
        print(f"  Records created: {perf_stats['records_created']}")
        print(f"  Records updated: {perf_stats['records_updated']}")
        if perf_stats["agents_not_found"]:
            print(f"  Agents not found: {perf_stats['agents_not_found']}")
        if perf_stats["metrics_not_found"]:
            print(f"  Metrics not matched: {perf_stats['metrics_not_found']}")

        # ---------------------------------------------------------------
        # Step 5: Run scoring engine
        # ---------------------------------------------------------------
        print("\n[5/5] Running scoring engine...")
        db.commit()  # Ensure all data is persisted before scoring
        agents_scored = calculate_scores(db, period.id, template.id)
        print(f"  Agents scored: {agents_scored}")

        print("\n" + "=" * 60)
        print("SEEDING COMPLETE!")
        print("=" * 60)
        print(f"\nCompany: Sephora")
        print(f"Template: {template.name} (id: {template.id})")
        print(f"Period: {period.label} (id: {period.id})")
        print(f"Agents scored: {agents_scored}")
        print(f"\nOpen http://localhost:5173 to view the dashboard")

    finally:
        db.close()


if __name__ == "__main__":
    seed()
