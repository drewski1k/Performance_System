"""Smart import service for performance data.

Handles multiple data source formats:
1. Unified Upload (roster + metrics in one sheet)
2. Combined Data (all-in-one per agent per cycle)
3. Agent Summary Glance Report (raw Gladly export)
4. QA Data (quality scores)
5. HC Data (hierarchy: agent → supervisor → site → BPO)
6. Agent Durations Report (for productivity calculation)

Supports: Excel file upload, CSV upload, pasted tab/comma-separated text.
"""
import io
import uuid
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from typing import Any

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Agent, Company, MetricDefinition, PerformanceRecord,
    ScorecardMetric, Site, Supervisor,
)

# ---------------------------------------------------------------------------
# Data type detection
# ---------------------------------------------------------------------------

# Column signatures for auto-detecting data type
_COMBINED_COLS = {"Person Name", "Cycle", "Logged in Time (hrs)", "Phone Calls Accepted"}
_GLANCE_COLS = {"Name or Email", "Logged in Time in seconds", "Contact Accepted - Phone Call"}
_QA_COLS = {"Associate Name", "Total Evaluations", "Average Quality Score %"}
_HC_COLS = {"Associate Name", "Job Title", "BPO", "Site", "Supervisor"}
_DURATIONS_COLS = {"Agent", "Duration (mins)", "Type", "Context"}

# Unified template: fixed roster columns (must appear in this order at start)
_UNIFIED_ROSTER_COLS = {"Agent Name", "Email", "BPO", "Site", "Supervisor"}


def detect_data_type(df: pd.DataFrame) -> str:
    """Auto-detect the data type from column headers."""
    cols = set(df.columns)
    # Check unified format first (has roster + metrics)
    if _UNIFIED_ROSTER_COLS.issubset(cols):
        return "unified"
    if _COMBINED_COLS.issubset(cols):
        return "combined"
    if _GLANCE_COLS.issubset(cols):
        return "glance_report"
    if _QA_COLS.issubset(cols):
        return "qa_data"
    if _HC_COLS.issubset(cols):
        return "hc_data"
    if _DURATIONS_COLS.issubset(cols):
        return "durations"
    return "unknown"


# ---------------------------------------------------------------------------
# Parsing: file bytes → DataFrame
# ---------------------------------------------------------------------------

# Sheet name mapping: data_type → known Excel sheet names to try
_SHEET_NAMES: dict[str, list[str]] = {
    "hc_data": ["HC Data", "HC Export"],
    "combined": ["Combined by Cycle Person (2)", "Combined by Cycle Person", "Combined"],
    "qa_data": ["QA Data"],
    "glance_report": ["AgentSummaryGlanceReport", "Agent Summary Glance Report"],
    "durations": ["AgentDurationsReport", "Agent Durations Report"],
}


def parse_upload(
    content: bytes, filename: str,
    sheet_name: str | None = None, data_type: str | None = None,
) -> pd.DataFrame:
    """Parse uploaded file (CSV or Excel) into a DataFrame.

    For Excel files with multiple sheets, uses data_type to pick the right
    sheet, or tries all sheets and auto-detects from column signatures.
    """
    if not filename.endswith((".xlsx", ".xls")):
        return pd.read_csv(io.BytesIO(content))

    buf = io.BytesIO(content)

    # If explicit sheet name given, use it
    if sheet_name:
        return pd.read_excel(buf, sheet_name=sheet_name)

    # If data_type specified, try known sheet names for that type
    if data_type and data_type in _SHEET_NAMES:
        xl = pd.ExcelFile(buf)
        for name in _SHEET_NAMES[data_type]:
            if name in xl.sheet_names:
                return pd.read_excel(xl, sheet_name=name)

    # Auto-detect: try each sheet and return the first one that matches a known signature
    buf.seek(0)
    xl = pd.ExcelFile(buf)
    for name in xl.sheet_names:
        try:
            df = pd.read_excel(xl, sheet_name=name, nrows=5)
            detected = detect_data_type(df)
            if detected != "unknown":
                # If we have a target data_type, only return matching sheets
                if data_type and detected != data_type:
                    continue
                return pd.read_excel(xl, sheet_name=name)
        except Exception:
            continue

    # Fallback: read first sheet
    buf.seek(0)
    return pd.read_excel(buf, sheet_name=0)


def parse_paste(text: str) -> pd.DataFrame:
    """Parse pasted tab or comma-separated text into a DataFrame."""
    # Try tab-separated first (most common from spreadsheet copy)
    try:
        df = pd.read_csv(io.StringIO(text), sep="\t")
        if len(df.columns) > 1:
            return df
    except Exception:
        pass
    # Fall back to comma-separated
    return pd.read_csv(io.StringIO(text))


# ---------------------------------------------------------------------------
# Combined Data processing
# ---------------------------------------------------------------------------

# Column mapping: Combined sheet column → (metric_key, transform)
# Transforms: "direct" = use as-is, "hrs_to_sec" = multiply by 3600,
#              "derived" = computed from other columns
_COMBINED_COLUMN_MAP = {
    "Occupancy %": ("occupancy_pct", "direct"),
    "Logged in Time (hrs)": ("total_logged_time", "hrs_to_sec"),
    "Active Time (hrs)": ("total_active_time", "hrs_to_sec"),
    "Phone Calls Accepted": ("voice_accepted", "direct"),
    "Chats Accepted": ("chat_accepted", "direct"),
    "Emails Accepted": ("email_accepted", "direct"),
    "Total Evaluations": ("total_evaluations", "direct"),
    "Avg Quality Score %": ("qa_score_pct", "direct"),
}


def _safe_float(val: Any, default: float = 0.0) -> float:
    """Safely convert a value to float."""
    if pd.isna(val):
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _compute_derived_metrics(row: pd.Series) -> dict[str, float]:
    """Compute derived metrics (AHT, CPH, Productivity) from a Combined row."""
    metrics: dict[str, float] = {}

    logged_hrs = _safe_float(row.get("Logged in Time (hrs)"))
    logged_sec = logged_hrs * 3600

    # Voice metrics
    voice_accepted = _safe_float(row.get("Phone Calls Accepted"))
    voice_ht_hrs = _safe_float(row.get("Phone Handle Time (hrs)"))
    voice_ht_sec = voice_ht_hrs * 3600
    if voice_accepted > 0:
        metrics["voice_aht"] = voice_ht_sec / voice_accepted
        # CPH requires available time; we'll estimate from active time proportionally
        # For now, use logged time as denominator since Combined doesn't have per-channel avail
    if logged_hrs > 0 and voice_accepted > 0:
        metrics["voice_cph"] = voice_accepted / logged_hrs

    # Chat metrics
    chat_accepted = _safe_float(row.get("Chats Accepted"))
    chat_ht_hrs = _safe_float(row.get("Chat Handle Time (hrs)"))
    chat_ht_sec = chat_ht_hrs * 3600
    if chat_accepted > 0:
        metrics["chat_aht"] = chat_ht_sec / chat_accepted
    if logged_hrs > 0 and chat_accepted > 0:
        metrics["chat_cph"] = chat_accepted / logged_hrs

    # Email metrics
    email_accepted = _safe_float(row.get("Emails Accepted"))
    email_ht_hrs = _safe_float(row.get("Email Handle Time (hrs)"))
    email_ht_sec = email_ht_hrs * 3600
    if email_accepted > 0:
        metrics["email_aht"] = email_ht_sec / email_accepted
    if logged_hrs > 0 and email_accepted > 0:
        metrics["email_cph"] = email_accepted / logged_hrs

    # Productivity from duration columns.
    # Formula: (Available Time + Productive AUX) / Logged Time
    # The Combined sheet doesn't have per-channel Available Time, so we
    # approximate: Available ≈ Helping Clients + Answers/Research durations
    # (these represent time spent servicing customers).
    # Productive AUX states: Floor Support, Coaching, Training, Team Meeting,
    #                        Gladly Project, Email
    productive_aux_states = {
        "Floor Support", "Coaching", "Training",
        "Team Meeting", "Gladly Project", "Email",
    }
    available_proxy_states = {
        "Helping Clients", "Answers / Research",
    }

    productive_aux_sec = 0.0
    available_proxy_sec = 0.0
    for col in row.index:
        if col.startswith("Dur: "):
            state_name = col.replace("Dur: ", "").replace(" (mins)", "")
            dur_sec = _safe_float(row.get(col)) * 60  # mins to sec
            if state_name in productive_aux_states:
                productive_aux_sec += dur_sec
            elif state_name in available_proxy_states:
                available_proxy_sec += dur_sec

    if logged_sec > 0:
        total_productive = available_proxy_sec + productive_aux_sec
        metrics["productivity_pct"] = min(total_productive / logged_sec, 1.5)

    return metrics


def process_combined_data(df: pd.DataFrame, cycle: int | None = None) -> list[dict]:
    """
    Process Combined by Cycle Person data into normalized agent metric records.

    Returns list of {name, cycle, metrics: {metric_key: value}}
    """
    # Filter by cycle if specified
    if cycle is not None and "Cycle" in df.columns:
        df = df[df["Cycle"] == cycle]

    results = []
    for _, row in df.iterrows():
        name = str(row.get("Person Name", "")).strip()
        if not name:
            continue

        agent_cycle = int(row.get("Cycle", 0)) if "Cycle" in df.columns else 0
        metrics: dict[str, float] = {}

        # Direct / simple column mappings
        for col, (metric_key, transform) in _COMBINED_COLUMN_MAP.items():
            val = row.get(col)
            if pd.notna(val):
                fval = _safe_float(val)
                if transform == "hrs_to_sec":
                    fval *= 3600
                metrics[metric_key] = fval

        # Derived metrics
        derived = _compute_derived_metrics(row)
        metrics.update(derived)

        results.append({
            "name": name,
            "cycle": agent_cycle,
            "metrics": metrics,
        })

    return results


# ---------------------------------------------------------------------------
# Glance Report processing
# ---------------------------------------------------------------------------

def process_glance_report(df: pd.DataFrame) -> list[dict]:
    """Process Agent Summary Glance Report into normalized records."""
    results = []
    for _, row in df.iterrows():
        name = str(row.get("Name or Email", "")).strip()
        if not name:
            continue

        logged_sec = _safe_float(row.get("Logged in Time in seconds"))
        active_sec = _safe_float(row.get("Active Time in seconds"))
        away_sec = _safe_float(row.get("Away Time in seconds"))
        voice_avail = _safe_float(row.get("Available Time in seconds - Voice"))
        chat_avail = _safe_float(row.get("Available Time in seconds - Messaging"))
        email_avail = _safe_float(row.get("Available Time in seconds - Mail"))

        voice_accepted = _safe_float(row.get("Contact Accepted - Phone Call"))
        voice_ht = _safe_float(row.get("Contact Handle Time in seconds - Phone Call"))
        chat_accepted = _safe_float(row.get("Contact Accepted - Chat"))
        chat_ht = _safe_float(row.get("Contact Handle Time in seconds - Chat"))
        email_accepted = _safe_float(row.get("Contact Accepted - Email"))
        email_ht = _safe_float(row.get("Contact Handle Time in seconds - Email"))

        metrics: dict[str, float] = {
            "total_logged_time": logged_sec,
            "total_active_time": active_sec,
            "occupancy_pct": _safe_float(row.get("Occupancy %")),
            "voice_avail_time": voice_avail,
            "chat_avail_time": chat_avail,
            "email_avail_time": email_avail,
            "voice_accepted": voice_accepted,
            "chat_accepted": chat_accepted,
            "email_accepted": email_accepted,
            "contact_offered_voice": _safe_float(row.get("Contact Offered - Phone Call")),
            "contact_offered_chat": _safe_float(row.get("Contact Offered - Chat")),
            "contact_offered_email": _safe_float(row.get("Contact Offered - Email")),
            "contact_declined_voice": _safe_float(row.get("Contact Declined - Phone Call")),
        }

        # Derived
        if voice_accepted > 0:
            metrics["voice_aht"] = voice_ht / voice_accepted
        if voice_avail > 0:
            metrics["voice_cph"] = voice_accepted / (voice_avail / 3600)
        if chat_accepted > 0:
            metrics["chat_aht"] = chat_ht / chat_accepted
        if chat_avail > 0:
            metrics["chat_cph"] = chat_accepted / (chat_avail / 3600)
        if email_accepted > 0:
            metrics["email_aht"] = email_ht / email_accepted
        if email_avail > 0:
            metrics["email_cph"] = email_accepted / (email_avail / 3600)

        results.append({"name": name, "cycle": 0, "metrics": metrics})

    return results


# ---------------------------------------------------------------------------
# QA Data processing
# ---------------------------------------------------------------------------

def process_qa_data(df: pd.DataFrame) -> list[dict]:
    """Process QA Data sheet into normalized records."""
    results = []
    for _, row in df.iterrows():
        name = str(row.get("Associate Name", "")).strip()
        if not name:
            continue

        metrics: dict[str, float] = {}
        evals = _safe_float(row.get("Total Evaluations"))
        qa_score = _safe_float(row.get("Average Quality Score %"))

        if evals > 0:
            metrics["total_evaluations"] = evals
        if qa_score > 0:
            metrics["qa_score_pct"] = qa_score

        if metrics:
            results.append({"name": name, "cycle": 0, "metrics": metrics})

    return results


# ---------------------------------------------------------------------------
# HC Data processing (hierarchy)
# ---------------------------------------------------------------------------

def process_hc_data(df: pd.DataFrame) -> list[dict]:
    """
    Process HC Data into hierarchy records.

    Returns list of {name, job_title, bpo, site, supervisor, assoc_type, hire_date, email}
    """
    results = []
    for _, row in df.iterrows():
        name = str(row.get("Associate Name", "")).strip()
        if not name or name in ("nan", "NaT", "") or name.startswith("Applied"):
            continue
        # Skip rows that look like filter metadata or bad data
        if len(name) > 100 or "\n" in name:
            continue

        site = str(row.get("Site", "")).strip()
        bpo = str(row.get("BPO", "")).strip()
        if site in ("nan", "NaT"):
            site = ""
        if bpo in ("nan", "NaT"):
            bpo = ""

        results.append({
            "name": name,
            "job_title": str(row.get("Job Title", "")).strip(),
            "bpo": bpo,
            "site": site or "Unknown",
            "supervisor": str(row.get("Supervisor", "")).strip(),
            "assoc_type": str(row.get("Associate Type", row.get("Assoc Type", ""))).strip(),
            "hire_date": row.get("Hire Date") if pd.notna(row.get("Hire Date")) else None,
            "email": str(row.get("Email", "")).strip() if pd.notna(row.get("Email")) else None,
        })

    return results


# ---------------------------------------------------------------------------
# Durations processing (for productivity)
# ---------------------------------------------------------------------------

def process_durations(df: pd.DataFrame) -> dict[str, dict[str, float]]:
    """
    Aggregate Agent Durations Report by agent → {state: total_seconds}.

    Returns {agent_name: {context: total_seconds}}
    """
    result: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    for _, row in df.iterrows():
        name = str(row.get("Agent", "")).strip()
        context = str(row.get("Context", "")).strip()
        duration_mins = _safe_float(row.get("Duration (mins)"))

        if name and context:
            result[name][context] += duration_mins * 60  # to seconds

    return dict(result)


# ---------------------------------------------------------------------------
# Preview / Validation (no DB writes)
# ---------------------------------------------------------------------------

def validate_combined_import(records: list[dict]) -> dict:
    """Validate combined data records before import."""
    errors = []
    warnings = []

    if not records:
        return {"valid_rows": 0, "errors": ["No data rows found"], "warnings": [], "preview": []}

    # Check for required metrics
    metrics_found = set()
    for r in records:
        metrics_found.update(r["metrics"].keys())

    scored_metrics = {"productivity_pct", "qa_score_pct"}
    missing_scored = scored_metrics - metrics_found
    if missing_scored:
        warnings.append(f"Scored metrics not found in data: {missing_scored}")

    # Build preview
    preview = []
    for r in records[:20]:
        m = r["metrics"]
        preview.append({
            "name": r["name"],
            "cycle": r.get("cycle", ""),
            "logged_hrs": round(m.get("total_logged_time", 0) / 3600, 1),
            "voice_contacts": int(m.get("voice_accepted", 0)),
            "chat_contacts": int(m.get("chat_accepted", 0)),
            "email_contacts": int(m.get("email_accepted", 0)),
            "productivity": f"{m.get('productivity_pct', 0):.1%}" if "productivity_pct" in m else "-",
            "qa_score": f"{m.get('qa_score_pct', 0):.1%}" if "qa_score_pct" in m else "-",
            "voice_aht": f"{m.get('voice_aht', 0):.0f}s" if "voice_aht" in m else "-",
            "metrics_count": len(m),
        })

    return {
        "valid_rows": len(records),
        "total_metrics": len(metrics_found),
        "metrics_found": sorted(metrics_found),
        "errors": errors,
        "warnings": warnings,
        "preview": preview,
    }


def validate_hc_import(records: list[dict]) -> dict:
    """Validate HC data before import."""
    if not records:
        return {"valid_rows": 0, "errors": ["No data rows found"], "warnings": [], "preview": []}

    bpos = set(r["bpo"] for r in records if r["bpo"])
    sites = set(r["site"] for r in records if r["site"])
    supervisors = set(r["supervisor"] for r in records if r["supervisor"])

    preview = [
        {
            "name": r["name"],
            "job_title": r["job_title"],
            "bpo": r["bpo"],
            "site": r["site"],
            "supervisor": r["supervisor"],
        }
        for r in records[:20]
    ]

    return {
        "valid_rows": len(records),
        "bpos": sorted(bpos),
        "sites": sorted(sites),
        "supervisors": sorted(supervisors),
        "errors": [],
        "warnings": [],
        "preview": preview,
    }


# ---------------------------------------------------------------------------
# Execute import: write to DB
# ---------------------------------------------------------------------------

def execute_hc_import(db: Session, records: list[dict], company_name: str = "Default Company") -> dict:
    """
    Import HC data: create/update Company → Sites → Supervisors → Agents.

    Returns summary of created/updated records.
    """
    # Get or create company
    company = db.scalar(select(Company).where(Company.name == company_name))
    if not company:
        company = Company(name=company_name)
        db.add(company)
        db.flush()

    # Group by BPO (treated as part of site identity)
    site_cache: dict[str, Site] = {}
    sup_cache: dict[str, Supervisor] = {}
    stats = {"companies": 1, "sites_created": 0, "supervisors_created": 0,
             "agents_created": 0, "agents_updated": 0}

    for r in records:
        site_key = f"{r['bpo']}_{r['site']}" if r["bpo"] and r["site"] else r["site"] or "Unknown"
        site_name = r["site"] or "Unknown"

        # Get or create site
        if site_key not in site_cache:
            site = db.scalar(
                select(Site).where(Site.company_id == company.id, Site.name == site_name)
            )
            if not site:
                site = Site(company_id=company.id, name=site_name, location=r.get("bpo", ""))
                db.add(site)
                db.flush()
                stats["sites_created"] += 1
            site_cache[site_key] = site

        site = site_cache[site_key]

        # Get or create supervisor
        sup_name = r["supervisor"] or "Unknown"
        sup_key = f"{site.id}_{sup_name}"
        if sup_key not in sup_cache:
            sup_parts = sup_name.split(" ", 1)
            first = sup_parts[0]
            last = sup_parts[1] if len(sup_parts) > 1 else ""
            emp_id = f"sup_{sup_name.lower().replace(' ', '_')}"
            # Check by employee_id first (globally unique), then by name+site
            sup = db.scalar(select(Supervisor).where(Supervisor.employee_id == emp_id))
            if not sup:
                sup = db.scalar(
                    select(Supervisor).where(
                        Supervisor.site_id == site.id,
                        Supervisor.first_name == first,
                        Supervisor.last_name == last,
                    )
                )
            if not sup:
                sup = Supervisor(
                    site_id=site.id,
                    employee_id=emp_id,
                    first_name=first, last_name=last,
                )
                db.add(sup)
                db.flush()
                stats["supervisors_created"] += 1
            sup_cache[sup_key] = sup

        supervisor = sup_cache[sup_key]

        # Get or create agent
        name_parts = r["name"].split(" ", 1)
        first = name_parts[0]
        last = name_parts[1] if len(name_parts) > 1 else ""
        emp_id = f"agent_{r['name'].lower().replace(' ', '_')}"

        agent = db.scalar(select(Agent).where(Agent.employee_id == emp_id))
        if agent:
            agent.supervisor_id = supervisor.id
            agent.first_name = first
            agent.last_name = last
            if r.get("email"):
                agent.email = r["email"]
            stats["agents_updated"] += 1
        else:
            agent = Agent(
                supervisor_id=supervisor.id,
                employee_id=emp_id,
                first_name=first, last_name=last,
                email=r.get("email"),
                hire_date=r.get("hire_date") if pd.notna(r.get("hire_date")) else None,
            )
            db.add(agent)
            stats["agents_created"] += 1

    db.commit()
    return stats


def execute_performance_import(
    db: Session,
    records: list[dict],
    template_id: uuid.UUID,
    period_id: uuid.UUID,
) -> dict:
    """
    Import performance metric records for agents in a scoring period.

    `records` is the output of process_combined_data, process_glance_report, etc.
    Each record: {name, cycle, metrics: {metric_key: value}}

    Returns summary of created/updated records.
    """
    # Build lookups
    agents = {}
    for a in db.scalars(select(Agent)).all():
        agents[a.employee_id] = a.id
        agents[f"{a.first_name} {a.last_name}"] = a.id

    sm_lookup: dict[str, uuid.UUID] = {}
    for sm in db.scalars(select(ScorecardMetric).where(ScorecardMetric.template_id == template_id)).all():
        metric_def = db.get(MetricDefinition, sm.metric_id)
        if metric_def:
            sm_lookup[metric_def.key] = sm.id

    stats = {"records_created": 0, "records_updated": 0, "agents_not_found": 0, "metrics_not_found": set()}
    seen: set[tuple] = set()  # Track (agent_id, sm_id) to avoid duplicates

    for r in records:
        agent_id = agents.get(r["name"]) or agents.get(f"agent_{r['name'].lower().replace(' ', '_')}")
        if not agent_id:
            stats["agents_not_found"] += 1
            continue

        for metric_key, value in r["metrics"].items():
            sm_id = sm_lookup.get(metric_key)
            if not sm_id:
                stats["metrics_not_found"].add(metric_key)
                continue

            # Skip duplicates within the same batch
            key = (agent_id, sm_id)
            if key in seen:
                continue
            seen.add(key)

            try:
                dec_value = Decimal(str(round(value, 6)))
            except (InvalidOperation, ValueError):
                continue

            existing = db.scalar(
                select(PerformanceRecord).where(
                    PerformanceRecord.agent_id == agent_id,
                    PerformanceRecord.scoring_period_id == period_id,
                    PerformanceRecord.scorecard_metric_id == sm_id,
                )
            )
            if existing:
                existing.actual_value = dec_value
                stats["records_updated"] += 1
            else:
                db.add(PerformanceRecord(
                    agent_id=agent_id,
                    scoring_period_id=period_id,
                    scorecard_metric_id=sm_id,
                    actual_value=dec_value,
                ))
                stats["records_created"] += 1

    stats["metrics_not_found"] = sorted(stats["metrics_not_found"])
    db.commit()
    return stats


# ---------------------------------------------------------------------------
# Unified Upload processing (roster + metrics in one sheet)
# ---------------------------------------------------------------------------

# Columns that are part of the roster, not metrics
_UNIFIED_ROSTER_FIELDS = {"agent name", "email", "bpo", "site", "supervisor"}


def process_unified_data(df: pd.DataFrame) -> tuple[list[dict], list[dict]]:
    """
    Process unified upload sheet (roster + metrics in one sheet).

    Returns (roster_records, metric_records) where:
      roster_records = [{name, employee_id, bpo, site, supervisor}, ...]
      metric_records = [{name, employee_id, metrics: {col_header: value}}, ...]

    Any column beyond the 5 roster columns is treated as a metric.
    """
    roster = []
    metrics = []

    # Identify metric columns (everything not a roster field)
    metric_cols = [
        c for c in df.columns
        if c.strip().lower() not in _UNIFIED_ROSTER_FIELDS
    ]

    for _, row in df.iterrows():
        name = str(row.get("Agent Name", "")).strip()
        email = str(row.get("Email", "")).strip()
        if not name or name in ("nan", "NaT", ""):
            continue

        bpo = str(row.get("BPO", "")).strip()
        site = str(row.get("Site", "")).strip()
        supervisor = str(row.get("Supervisor", "")).strip()
        if bpo in ("nan", "NaT"):
            bpo = ""
        if site in ("nan", "NaT"):
            site = ""
        if supervisor in ("nan", "NaT"):
            supervisor = ""
        if email in ("nan", "NaT", ""):
            email = ""

        # Use email as employee_id if available, otherwise generate from name
        emp_id = email if email else f"agent_{name.lower().replace(' ', '_')}"

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
                fval = _safe_float_nullable(val)
                if fval is not None:
                    # Normalize column header to a metric key
                    metric_key = _normalize_metric_key(col)
                    agent_metrics[metric_key] = fval

        if agent_metrics:
            metrics.append({
                "name": name,
                "employee_id": emp_id,
                "metrics": agent_metrics,
            })

    return roster, metrics


def _normalize_metric_key(col_name: str) -> str:
    """Convert a column header to a metric key.

    Examples:
      "Voice AHT" -> "voice_aht"
      "QA Score %" -> "qa_score_pct"
      "Avg Handle Time (seconds)" -> "avg_handle_time_seconds"
    """
    import re
    key = col_name.strip()
    # Replace common symbols
    key = key.replace("%", "pct").replace("$", "dollars")
    # Remove parenthetical units but keep content
    key = re.sub(r"\(([^)]+)\)", r"_\1", key)
    # Convert to lowercase snake_case
    key = re.sub(r"[^a-zA-Z0-9]+", "_", key).lower()
    key = key.strip("_")
    return key


def _safe_float_nullable(val, default=None):
    """Safely convert to float, returning None for non-numeric values."""
    if pd.isna(val):
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def validate_unified_import(roster: list[dict], metrics: list[dict]) -> dict:
    """Validate unified upload data before import."""
    errors = []
    warnings = []

    if not roster:
        return {
            "valid_rows": 0,
            "errors": ["No data rows found. Ensure the sheet has columns: Agent Name, Employee ID, BPO, Site, Supervisor"],
            "warnings": [],
            "preview": [],
        }

    # Check for missing emails
    no_email = [r for r in roster if not r.get("email")]
    if no_email:
        warnings.append(f"{len(no_email)} agents have no email — matching will fall back to name")

    # Collect all metric keys found
    all_metric_keys = set()
    for m in metrics:
        all_metric_keys.update(m["metrics"].keys())

    # Build preview
    preview = []
    for r in roster[:20]:
        row_data = {
            "name": r["name"],
            "email": r.get("email", ""),
            "bpo": r["bpo"],
            "site": r["site"],
            "supervisor": r["supervisor"],
        }
        # Add metric counts
        agent_metrics = next((m for m in metrics if m["employee_id"] == r["employee_id"]), None)
        row_data["metrics_count"] = len(agent_metrics["metrics"]) if agent_metrics else 0
        preview.append(row_data)

    return {
        "valid_rows": len(roster),
        "total_metrics": len(all_metric_keys),
        "metrics_found": sorted(all_metric_keys),
        "bpos": sorted(set(r["bpo"] for r in roster if r["bpo"])),
        "sites": sorted(set(r["site"] for r in roster if r["site"])),
        "supervisors": sorted(set(r["supervisor"] for r in roster if r["supervisor"])),
        "errors": errors,
        "warnings": warnings,
        "preview": preview,
    }


def execute_unified_import(
    db: Session,
    roster: list[dict],
    metrics: list[dict],
    template_id: uuid.UUID,
    period_id: uuid.UUID,
    company_name: str = "Sephora",
) -> dict:
    """
    Execute unified import: create/update roster AND import metrics in one pass.

    Agent matching priority:
    1. Employee ID (exact match)
    2. Name + Site (for agents without explicit Employee IDs)
    3. Name only (fallback)
    4. Create new agent if no match

    New metric columns auto-create MetricDefinition (channel=None, lands in 'Undefined')
    and add to the scorecard template.
    """
    from app.models import ScorecardMetric

    stats = {
        "sites_created": 0, "supervisors_created": 0,
        "agents_created": 0, "agents_updated": 0,
        "records_created": 0, "records_updated": 0,
        "metrics_created": 0, "agents_not_found": 0,
        "metrics_not_found": [],
    }

    # --- 1. Roster import (company → sites → supervisors → agents) ---
    company = db.scalar(select(Company).where(Company.name == company_name))
    if not company:
        company = db.scalars(select(Company).limit(1)).first()
    if not company:
        company = Company(name=company_name)
        db.add(company)
        db.flush()

    site_cache: dict[str, Site] = {}
    sup_cache: dict[str, Supervisor] = {}
    agent_cache: dict[str, Agent] = {}  # employee_id -> Agent

    # Pre-load existing agents for matching
    existing_agents = db.scalars(select(Agent)).all()
    emp_id_map: dict[str, Agent] = {}
    email_map: dict[str, Agent] = {}
    name_map: dict[str, list[Agent]] = defaultdict(list)
    for a in existing_agents:
        emp_id_map[a.employee_id] = a
        if a.email:
            email_map[a.email.lower()] = a
        full_name = f"{a.first_name} {a.last_name}".lower()
        name_map[full_name].append(a)

    for r in roster:
        site_name = r["site"] or "Unknown"
        bpo = r["bpo"] or ""

        # Get or create site
        site_key = f"{bpo}_{site_name}" if bpo else site_name
        if site_key not in site_cache:
            site = db.scalar(
                select(Site).where(Site.company_id == company.id, Site.name == site_name)
            )
            if not site:
                site = Site(company_id=company.id, name=site_name, location=bpo)
                db.add(site)
                db.flush()
                stats["sites_created"] += 1
            site_cache[site_key] = site
        site = site_cache[site_key]

        # Get or create supervisor
        sup_name = r["supervisor"] or "Unknown"
        sup_key = f"{site.id}_{sup_name}"
        if sup_key not in sup_cache:
            sup_parts = sup_name.split(" ", 1)
            first = sup_parts[0]
            last = sup_parts[1] if len(sup_parts) > 1 else ""
            sup_emp_id = f"sup_{sup_name.lower().replace(' ', '_')}"
            sup = db.scalar(select(Supervisor).where(Supervisor.employee_id == sup_emp_id))
            if not sup:
                sup = db.scalar(
                    select(Supervisor).where(
                        Supervisor.site_id == site.id,
                        Supervisor.first_name == first,
                        Supervisor.last_name == last,
                    )
                )
            if not sup:
                sup = Supervisor(
                    site_id=site.id, employee_id=sup_emp_id,
                    first_name=first, last_name=last,
                )
                db.add(sup)
                db.flush()
                stats["supervisors_created"] += 1
            sup_cache[sup_key] = sup
        supervisor = sup_cache[sup_key]

        # Match or create agent
        name_parts = r["name"].split(" ", 1)
        first = name_parts[0]
        last = name_parts[1] if len(name_parts) > 1 else ""
        emp_id = r["employee_id"]

        email = r.get("email", "")
        agent = None

        # Priority 1: Email match (most reliable)
        if email:
            agent = email_map.get(email.lower())

        # Priority 2: Employee ID match
        if not agent and emp_id in emp_id_map:
            agent = emp_id_map[emp_id]

        # Priority 3: Name + site match
        if not agent:
            name_lower = r["name"].lower()
            candidates = name_map.get(name_lower, [])
            for c in candidates:
                if c.supervisor and c.supervisor.site_id == site.id:
                    agent = c
                    break

        # Priority 4: Name-only match
        if not agent and candidates:
            agent = candidates[0]

        if agent:
            agent.supervisor_id = supervisor.id
            agent.first_name = first
            agent.last_name = last
            if email:
                agent.email = email
            # Update employee_id to email if we now have one
            if email and agent.employee_id.startswith("agent_"):
                agent.employee_id = email
            stats["agents_updated"] += 1
        else:
            agent = Agent(
                supervisor_id=supervisor.id,
                employee_id=emp_id,
                first_name=first, last_name=last,
                email=email or None,
            )
            db.add(agent)
            db.flush()
            stats["agents_created"] += 1
            # Add to maps for future lookups within this batch
            emp_id_map[emp_id] = agent
            if email:
                email_map[email.lower()] = agent
            name_map[r["name"].lower()].append(agent)

        agent_cache[emp_id] = agent

    db.flush()

    # --- 2. Ensure metric definitions + scorecard metrics exist ---
    all_metric_keys = set()
    for m in metrics:
        all_metric_keys.update(m["metrics"].keys())

    # Build lookup: metric_key -> ScorecardMetric.id
    sm_lookup: dict[str, uuid.UUID] = {}
    existing_sms = db.scalars(
        select(ScorecardMetric).where(ScorecardMetric.template_id == template_id)
    ).all()
    for sm in existing_sms:
        metric_def = db.get(MetricDefinition, sm.metric_id)
        if metric_def:
            sm_lookup[metric_def.key] = sm.id

    # Find or create MetricDefinitions and ScorecardMetrics for any new keys
    existing_metric_defs = {
        m.key: m for m in db.scalars(select(MetricDefinition)).all()
    }
    # Also build a name-based lookup for matching uploaded column names
    existing_metric_by_name = {
        m.name.lower(): m for m in existing_metric_defs.values()
    }

    max_sort = max((sm.sort_order for sm in existing_sms), default=-1) + 1

    for key in all_metric_keys:
        if key in sm_lookup:
            continue  # Already mapped

        # Try to find existing MetricDefinition by key
        metric_def = existing_metric_defs.get(key)
        # Try by name match
        if not metric_def:
            metric_def = existing_metric_by_name.get(key.lower())

        # Create new MetricDefinition if not found
        if not metric_def:
            display_name = key.replace("_", " ").title()
            metric_def = MetricDefinition(
                key=key,
                name=display_name,
                description=f"Auto-imported metric: {display_name}",
                channel=None,  # Undefined — user configures later
                unit="ratio",
                direction="undefined",
                is_default=False,
                is_custom=False,
            )
            db.add(metric_def)
            db.flush()
            stats["metrics_created"] += 1

        # Create ScorecardMetric linking it to the template
        sm = ScorecardMetric(
            template_id=template_id,
            metric_id=metric_def.id,
            weight=Decimal("0"),
            include_in_score=False,
            show_on_scorecard=False,
            min_threshold=0,
            threshold_basis="",
            grade_mode="dynamic",
            sort_order=max_sort,
        )
        db.add(sm)
        db.flush()
        sm_lookup[metric_def.key] = sm.id
        # Also add the original key if different from metric_def.key
        if key != metric_def.key:
            sm_lookup[key] = sm.id
        max_sort += 1

    # --- 3. Import performance records ---
    seen: set[tuple] = set()

    for m in metrics:
        emp_id = m["employee_id"]
        agent = agent_cache.get(emp_id)
        if not agent:
            stats["agents_not_found"] += 1
            continue

        for metric_key, value in m["metrics"].items():
            sm_id = sm_lookup.get(metric_key)
            if not sm_id:
                continue

            key = (agent.id, sm_id)
            if key in seen:
                continue
            seen.add(key)

            try:
                dec_value = Decimal(str(round(value, 6)))
            except (InvalidOperation, ValueError):
                continue

            existing = db.scalar(
                select(PerformanceRecord).where(
                    PerformanceRecord.agent_id == agent.id,
                    PerformanceRecord.scoring_period_id == period_id,
                    PerformanceRecord.scorecard_metric_id == sm_id,
                )
            )
            if existing:
                existing.actual_value = dec_value
                stats["records_updated"] += 1
            else:
                db.add(PerformanceRecord(
                    agent_id=agent.id,
                    scoring_period_id=period_id,
                    scorecard_metric_id=sm_id,
                    actual_value=dec_value,
                ))
                stats["records_created"] += 1

    db.commit()
    return stats
