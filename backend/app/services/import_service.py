"""CSV/Excel import service for performance data."""
import io
import uuid
from decimal import Decimal, InvalidOperation

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Agent, MetricDefinition, PerformanceRecord, ScorecardMetric


def parse_csv(file_content: bytes) -> pd.DataFrame:
    return pd.read_csv(io.BytesIO(file_content))


def parse_excel(file_content: bytes, sheet_name: str | None = None) -> pd.DataFrame:
    return pd.read_excel(io.BytesIO(file_content), sheet_name=sheet_name or 0)


def validate_import(
    db: Session,
    df: pd.DataFrame,
    template_id: uuid.UUID,
) -> dict:
    """Validate imported data. Returns {valid_rows, errors, preview}."""
    errors = []

    # Check required columns
    required = {"employee_id", "metric_key", "value"}
    missing = required - set(df.columns)
    if missing:
        return {"valid_rows": 0, "errors": [f"Missing columns: {missing}"], "preview": []}

    # Lookup agents and metrics
    agents = {a.employee_id: a.id for a in db.scalars(select(Agent)).all()}
    metrics = {m.key: m.id for m in db.scalars(select(MetricDefinition)).all()}
    sm_lookup = {}
    for sm in db.scalars(select(ScorecardMetric).where(ScorecardMetric.template_id == template_id)).all():
        metric_def = db.get(MetricDefinition, sm.metric_id)
        if metric_def:
            sm_lookup[metric_def.key] = sm.id

    valid_rows = 0
    preview = []

    for idx, row in df.iterrows():
        emp_id = str(row.get("employee_id", "")).strip()
        metric_key = str(row.get("metric_key", "")).strip()
        raw_value = row.get("value")

        row_errors = []
        if emp_id not in agents:
            row_errors.append(f"Unknown employee_id: {emp_id}")
        if metric_key not in sm_lookup:
            row_errors.append(f"Unknown metric_key: {metric_key}")
        try:
            Decimal(str(raw_value))
        except (InvalidOperation, ValueError, TypeError):
            row_errors.append(f"Invalid value: {raw_value}")

        if row_errors:
            errors.extend([f"Row {idx + 2}: {e}" for e in row_errors])
        else:
            valid_rows += 1

        if idx < 10:
            preview.append({
                "employee_id": emp_id,
                "metric_key": metric_key,
                "value": str(raw_value),
                "valid": len(row_errors) == 0,
            })

    return {"valid_rows": valid_rows, "errors": errors[:50], "preview": preview}


def execute_import(
    db: Session,
    df: pd.DataFrame,
    template_id: uuid.UUID,
    period_id: uuid.UUID,
) -> int:
    """Import validated data into performance_records. Returns count of records created."""
    agents = {a.employee_id: a.id for a in db.scalars(select(Agent)).all()}
    metrics = {m.key: m.id for m in db.scalars(select(MetricDefinition)).all()}
    sm_lookup = {}
    for sm in db.scalars(select(ScorecardMetric).where(ScorecardMetric.template_id == template_id)).all():
        metric_def = db.get(MetricDefinition, sm.metric_id)
        if metric_def:
            sm_lookup[metric_def.key] = sm.id

    count = 0
    for _, row in df.iterrows():
        emp_id = str(row["employee_id"]).strip()
        metric_key = str(row["metric_key"]).strip()

        agent_id = agents.get(emp_id)
        sm_id = sm_lookup.get(metric_key)
        if not agent_id or not sm_id:
            continue

        try:
            value = Decimal(str(row["value"]))
        except (InvalidOperation, ValueError):
            continue

        # Upsert
        existing = db.scalar(
            select(PerformanceRecord).where(
                PerformanceRecord.agent_id == agent_id,
                PerformanceRecord.scoring_period_id == period_id,
                PerformanceRecord.scorecard_metric_id == sm_id,
            )
        )
        if existing:
            existing.actual_value = value
        else:
            db.add(PerformanceRecord(
                agent_id=agent_id,
                scoring_period_id=period_id,
                scorecard_metric_id=sm_id,
                actual_value=value,
            ))
        count += 1

    db.commit()
    return count
