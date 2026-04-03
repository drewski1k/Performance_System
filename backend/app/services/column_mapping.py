"""Column mapping service for smart imports.

Provides fuzzy matching of uploaded column headers to known roster fields
and metric definitions, plus saved mapping profiles.
"""
import re
import uuid
from difflib import SequenceMatcher
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import MetricDefinition


# ── Roster field definitions ─────────────────────────────────────────────────

ROSTER_FIELDS = [
    {
        "key": "agent_name",
        "label": "Agent Name",
        "required": True,
        "aliases": [
            "agent name", "name", "person name", "associate name",
            "full name", "employee name", "rep name", "agent",
            "name or email", "associate", "representative",
        ],
    },
    {
        "key": "email",
        "label": "Email",
        "required": False,
        "aliases": [
            "email", "email address", "agent email", "e-mail",
            "work email", "employee email",
        ],
    },
    {
        "key": "employee_id",
        "label": "Employee ID",
        "required": False,
        "aliases": [
            "employee id", "emp id", "id", "agent id", "badge",
            "badge number", "associate id", "employee number",
        ],
    },
    {
        "key": "bpo",
        "label": "BPO",
        "required": False,
        "aliases": [
            "bpo", "bpo partner", "vendor", "outsourcer",
            "partner", "company",
        ],
    },
    {
        "key": "site",
        "label": "Site",
        "required": False,
        "aliases": [
            "site", "location", "office", "center", "site name",
            "work location", "site location", "campus",
        ],
    },
    {
        "key": "supervisor",
        "label": "Supervisor",
        "required": False,
        "aliases": [
            "supervisor", "manager", "team lead", "team leader",
            "sup", "reporting to", "reports to", "supervisor name",
        ],
    },
]


def _normalize(s: str) -> str:
    """Lowercase, strip, collapse whitespace/underscores."""
    return re.sub(r"[\s_]+", " ", s.strip().lower())


def _similarity(a: str, b: str) -> float:
    """String similarity score 0-1."""
    return SequenceMatcher(None, _normalize(a), _normalize(b)).ratio()


def detect_column_mappings(
    columns: list[str],
    db: Session | None = None,
) -> dict[str, Any]:
    """Analyze column headers and suggest roster + metric mappings.

    Returns:
        {
            "columns": [
                {
                    "original": "Person Name",
                    "suggested_mapping": "agent_name",  # roster field key or "metric" or "exclude"
                    "confidence": 0.95,
                    "mapping_type": "roster",  # "roster" | "metric"
                    "alternatives": ["agent_name", "email", ...],
                }
            ],
            "roster_fields": [...],  # available roster fields for dropdown
            "unmapped_required": ["agent_name"],  # required fields not yet mapped
        }
    """
    # Load existing metric definitions for name matching
    existing_metrics: list[dict] = []
    if db:
        defs = db.scalars(select(MetricDefinition)).all()
        existing_metrics = [
            {"id": str(d.id), "key": d.key, "name": d.name, "display_name": d.display_name}
            for d in defs
        ]

    result_columns = []
    used_roster_keys: set[str] = set()

    # First pass: find high-confidence roster matches
    col_scores: list[tuple[int, str, str, float]] = []  # (col_idx, col, roster_key, score)
    for idx, col in enumerate(columns):
        col_lower = _normalize(col)
        for field in ROSTER_FIELDS:
            best_score = 0.0
            # Exact alias match
            for alias in field["aliases"]:
                score = _similarity(col_lower, alias)
                if col_lower == alias:
                    score = 1.0
                best_score = max(best_score, score)
            if best_score >= 0.5:
                col_scores.append((idx, col, field["key"], best_score))

    # Sort by score descending, assign greedily (each roster field used once)
    col_scores.sort(key=lambda x: x[3], reverse=True)
    roster_assignments: dict[int, tuple[str, float]] = {}  # col_idx -> (roster_key, score)
    for idx, col, roster_key, score in col_scores:
        if roster_key not in used_roster_keys and idx not in roster_assignments:
            roster_assignments[idx] = (roster_key, score)
            used_roster_keys.add(roster_key)

    # Second pass: build final column list
    for idx, col in enumerate(columns):
        if idx in roster_assignments:
            roster_key, score = roster_assignments[idx]
            field_label = next(f["label"] for f in ROSTER_FIELDS if f["key"] == roster_key)
            result_columns.append({
                "index": idx,
                "original": col,
                "suggested_mapping": roster_key,
                "suggested_label": field_label,
                "confidence": round(score, 2),
                "mapping_type": "roster",
            })
        else:
            # Check if it matches an existing metric definition
            metric_confidence = _match_existing_metric(col, existing_metrics)
            result_columns.append({
                "index": idx,
                "original": col,
                "suggested_mapping": "metric",
                "suggested_label": col,
                "confidence": metric_confidence,
                "mapping_type": "metric",
            })

    # Determine which required fields are unmapped
    unmapped_required = [
        f["key"] for f in ROSTER_FIELDS
        if f["required"] and f["key"] not in used_roster_keys
    ]

    return {
        "columns": result_columns,
        "roster_fields": [
            {"key": f["key"], "label": f["label"], "required": f["required"]}
            for f in ROSTER_FIELDS
        ],
        "unmapped_required": unmapped_required,
    }


def _match_existing_metric(col: str, existing: list[dict]) -> float:
    """Check how well a column matches existing metric definitions."""
    if not existing:
        return 0.5  # neutral confidence for new metrics
    col_norm = _normalize(col)
    best = 0.0
    for m in existing:
        for field in [m["name"], m["key"], m.get("display_name") or ""]:
            if field:
                score = _similarity(col_norm, field)
                best = max(best, score)
    return round(min(best, 0.99), 2)  # cap below 1.0


def apply_column_mapping(
    df: "pd.DataFrame",
    mappings: list[dict],
) -> tuple[list[dict], list[dict]]:
    """Apply user-confirmed column mappings to a DataFrame.

    Args:
        df: Raw uploaded DataFrame
        mappings: List of {original, mapping_type, mapped_to, ...}
            - mapping_type "roster" + mapped_to "agent_name" etc.
            - mapping_type "metric" (column becomes a metric)
            - mapping_type "exclude" (skip this column)

    Returns:
        (roster_records, metric_records) — same format as process_unified_data()
    """
    import pandas as pd

    # Build column assignment maps
    roster_col_map: dict[str, str] = {}  # roster_key -> original_column_name
    metric_cols: list[str] = []

    for m in mappings:
        original = m["original"]
        mtype = m["mapping_type"]
        if mtype == "roster":
            roster_col_map[m["mapped_to"]] = original
        elif mtype == "metric":
            metric_cols.append(original)
        # "exclude" — skip

    roster = []
    metrics = []

    for _, row in df.iterrows():
        # Extract roster fields using the mapping
        name = str(row.get(roster_col_map.get("agent_name", ""), "")).strip()
        if not name or name in ("nan", "NaT", ""):
            continue

        email = str(row.get(roster_col_map.get("email", ""), "")).strip()
        emp_id_col = roster_col_map.get("employee_id", "")
        emp_id_raw = str(row.get(emp_id_col, "")).strip() if emp_id_col else ""
        bpo = str(row.get(roster_col_map.get("bpo", ""), "")).strip()
        site = str(row.get(roster_col_map.get("site", ""), "")).strip()
        supervisor = str(row.get(roster_col_map.get("supervisor", ""), "")).strip()

        # Clean NaN strings
        for var_name in ["email", "emp_id_raw", "bpo", "site", "supervisor"]:
            val = locals()[var_name]
            if val in ("nan", "NaT", "None", ""):
                locals()[var_name] = ""
        email = email if email not in ("nan", "NaT", "None") else ""
        emp_id_raw = emp_id_raw if emp_id_raw not in ("nan", "NaT", "None") else ""
        bpo = bpo if bpo not in ("nan", "NaT", "None") else ""
        site = site if site not in ("nan", "NaT", "None") else ""
        supervisor = supervisor if supervisor not in ("nan", "NaT", "None") else ""

        # Generate employee_id: prefer explicit ID, then email, then name-based
        if emp_id_raw:
            emp_id = emp_id_raw
        elif email:
            emp_id = email
        else:
            emp_id = f"agent_{name.lower().replace(' ', '_')}"

        roster.append({
            "name": name,
            "email": email,
            "employee_id": emp_id,
            "bpo": bpo,
            "site": site or "Unknown",
            "supervisor": supervisor or "Unknown",
        })

        # Extract metrics
        agent_metrics: dict[str, float] = {}
        for col in metric_cols:
            val = row.get(col)
            if pd.notna(val):
                fval = _safe_float(val)
                if fval is not None:
                    metric_key = _normalize_metric_key(col)
                    agent_metrics[metric_key] = fval

        if agent_metrics:
            metrics.append({
                "name": name,
                "employee_id": emp_id,
                "metrics": agent_metrics,
            })

    return roster, metrics


def _safe_float(val: Any) -> float | None:
    """Convert a value to float, return None if not possible."""
    if val is None:
        return None
    try:
        f = float(val)
        if f != f:  # NaN check
            return None
        return f
    except (ValueError, TypeError):
        return None


def _normalize_metric_key(col_name: str) -> str:
    """Convert a column header to a metric key (snake_case)."""
    key = col_name.strip()
    key = key.replace("%", "pct").replace("$", "dollars")
    key = re.sub(r"\(([^)]+)\)", r"_\1", key)
    key = re.sub(r"[^a-zA-Z0-9]+", "_", key).lower()
    return key.strip("_")
