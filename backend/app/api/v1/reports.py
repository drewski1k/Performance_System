import uuid
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, case, desc, asc
from sqlalchemy.orm import Session, joinedload
import io

from app.database import get_db
from app.models.agent_score import AgentPeriodScore
from app.models.agent import Agent
from app.models.supervisor import Supervisor
from app.models.site import Site
from app.models.scoring_period import ScoringPeriod
from app.models.performance_record import PerformanceRecord
from app.models.metric_definition import MetricDefinition
from app.models.scorecard_template import ScorecardMetric
from app.services.export_service import export_scorecard_excel
from app.services.strength_opportunity import get_strengths_opportunities

router = APIRouter(prefix="/reports", tags=["reports"])

GRADE_ORDER = ["A", "B", "C", "D", "F"]


def _dec(v):
    """Convert Decimal to float for JSON serialization."""
    if v is None:
        return None
    return float(v) if isinstance(v, Decimal) else v


# ── Existing endpoints ──────────────────────────────────────────────

@router.get("/strengths-opportunities")
def strengths_opportunities(
    level: str,
    entity_id: uuid.UUID,
    period_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    return get_strengths_opportunities(db, level, entity_id, period_id)


@router.get("/export/excel")
def export_excel(period_id: uuid.UUID, db: Session = Depends(get_db)):
    data = export_scorecard_excel(db, period_id)
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=scorecard_export.xlsx"},
    )


# ── Helper: get previous period ────────────────────────────────────

def _get_previous_period(db: Session, period_id: uuid.UUID):
    current = db.get(ScoringPeriod, period_id)
    if not current:
        return None
    prev = (
        db.query(ScoringPeriod)
        .filter(
            ScoringPeriod.company_id == current.company_id,
            ScoringPeriod.end_date < current.start_date,
        )
        .order_by(desc(ScoringPeriod.end_date))
        .first()
    )
    return prev


# ── Summary KPIs ────────────────────────────────────────────────────

@router.get("/summary")
def report_summary(period_id: uuid.UUID, db: Session = Depends(get_db)):
    scores = (
        db.query(AgentPeriodScore)
        .filter(AgentPeriodScore.scoring_period_id == period_id)
        .all()
    )

    total = len(scores)
    avg_score = sum(_dec(s.final_score) or 0 for s in scores) / max(total, 1) if total else None
    grade_dist = {g: 0 for g in GRADE_ORDER}
    below_c = 0
    for s in scores:
        g = (s.final_grade or "").upper()
        if g in grade_dist:
            grade_dist[g] += 1
        if g in ("D", "F"):
            below_c += 1

    # Previous period comparison
    prev = _get_previous_period(db, period_id)
    prev_avg = None
    prev_total = None
    prev_below_c = None
    if prev:
        prev_scores = (
            db.query(AgentPeriodScore)
            .filter(AgentPeriodScore.scoring_period_id == prev.id)
            .all()
        )
        prev_total = len(prev_scores)
        if prev_total:
            prev_avg = sum(_dec(s.final_score) or 0 for s in prev_scores) / prev_total
            prev_below_c = sum(1 for s in prev_scores if (s.final_grade or "").upper() in ("D", "F"))

    return {
        "total_agents": total,
        "avg_score": round(avg_score, 2) if avg_score is not None else None,
        "grade_distribution": grade_dist,
        "below_c_count": below_c,
        "prev_avg_score": round(prev_avg, 2) if prev_avg is not None else None,
        "prev_total_agents": prev_total,
        "prev_below_c_count": prev_below_c,
    }


# ── Trends across periods ──────────────────────────────────────────

@router.get("/trends")
def report_trends(db: Session = Depends(get_db)):
    periods = db.query(ScoringPeriod).order_by(asc(ScoringPeriod.start_date)).all()
    result = []
    for p in periods:
        scores = (
            db.query(AgentPeriodScore)
            .filter(AgentPeriodScore.scoring_period_id == p.id)
            .all()
        )
        if not scores:
            continue
        grade_counts = {g: 0 for g in GRADE_ORDER}
        total_score = 0
        count = 0
        for s in scores:
            g = (s.final_grade or "").upper()
            if g in grade_counts:
                grade_counts[g] += 1
            if s.final_score is not None:
                total_score += float(s.final_score)
                count += 1
        entry = {
            "period_label": p.label,
            "avg_score": round(total_score / count, 2) if count else None,
        }
        entry.update(grade_counts)
        result.append(entry)
    return result


# ── Score distribution histogram ────────────────────────────────────

@router.get("/score-distribution")
def score_distribution(period_id: uuid.UUID, db: Session = Depends(get_db)):
    scores = (
        db.query(AgentPeriodScore.final_score)
        .filter(
            AgentPeriodScore.scoring_period_id == period_id,
            AgentPeriodScore.final_score.isnot(None),
        )
        .all()
    )
    values = [float(s[0]) for s in scores]
    if not values:
        return []

    bins = []
    step = 10
    for lo in range(0, 100, step):
        hi = lo + step
        count = sum(1 for v in values if lo <= v < hi) if hi < 100 else sum(1 for v in values if lo <= v <= hi)
        bins.append({"bin": f"{lo}-{hi}", "count": count})
    return bins


# ── Top / Bottom performers ────────────────────────────────────────

@router.get("/top-bottom")
def top_bottom(
    period_id: uuid.UUID,
    n: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    base = (
        db.query(AgentPeriodScore, Agent)
        .join(Agent, AgentPeriodScore.agent_id == Agent.id)
        .filter(
            AgentPeriodScore.scoring_period_id == period_id,
            AgentPeriodScore.final_score.isnot(None),
        )
    )

    top = base.order_by(desc(AgentPeriodScore.final_score)).limit(n).all()
    bottom = base.order_by(asc(AgentPeriodScore.final_score)).limit(n).all()

    def to_entry(score, agent):
        return {
            "agent_id": str(agent.id),
            "name": f"{agent.first_name} {agent.last_name}",
            "score": _dec(score.final_score),
            "grade": score.final_grade,
            "rank": score.rank,
        }

    return {
        "top": [to_entry(s, a) for s, a in top],
        "bottom": [to_entry(s, a) for s, a in bottom],
    }


# ── Team performance (group by supervisor or site) ──────────────────

@router.get("/teams")
def team_performance(
    period_id: uuid.UUID,
    group_by: str = Query(default="supervisor"),
    db: Session = Depends(get_db),
):
    scores = (
        db.query(AgentPeriodScore)
        .options(joinedload(AgentPeriodScore.agent).joinedload(Agent.supervisor).joinedload(Supervisor.site))
        .filter(AgentPeriodScore.scoring_period_id == period_id)
        .all()
    )

    groups: dict[str, list] = {}
    for s in scores:
        agent = s.agent
        if not agent:
            continue
        if group_by == "site":
            key = agent.supervisor.site.name if agent.supervisor and agent.supervisor.site else "Unknown"
        else:
            key = f"{agent.supervisor.first_name} {agent.supervisor.last_name}" if agent.supervisor else "Unknown"
        groups.setdefault(key, []).append(s)

    result = []
    for name, members in sorted(groups.items()):
        grade_dist = {g: 0 for g in GRADE_ORDER}
        total_score = 0
        count = 0
        for s in members:
            g = (s.final_grade or "").upper()
            if g in grade_dist:
                grade_dist[g] += 1
            if s.final_score is not None:
                total_score += float(s.final_score)
                count += 1
        result.append({
            "group_name": name,
            "headcount": len(members),
            "avg_score": round(total_score / count, 2) if count else None,
            "grade_distribution": grade_dist,
        })

    result.sort(key=lambda x: x["avg_score"] or 0, reverse=True)
    return result


# ── Full rankings ───────────────────────────────────────────────────

@router.get("/rankings")
def rankings(
    period_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    scores = (
        db.query(AgentPeriodScore, Agent)
        .join(Agent, AgentPeriodScore.agent_id == Agent.id)
        .filter(AgentPeriodScore.scoring_period_id == period_id)
        .order_by(asc(AgentPeriodScore.rank))
        .all()
    )

    # Get previous period for deltas
    prev = _get_previous_period(db, period_id)
    prev_map: dict[str, tuple] = {}
    if prev:
        prev_scores = (
            db.query(AgentPeriodScore)
            .filter(AgentPeriodScore.scoring_period_id == prev.id)
            .all()
        )
        prev_map = {str(s.agent_id): (_dec(s.final_score), s.rank) for s in prev_scores}

    result = []
    for s, agent in scores:
        agent_key = str(agent.id)
        prev_score, prev_rank = prev_map.get(agent_key, (None, None))
        result.append({
            "agent_id": agent_key,
            "name": f"{agent.first_name} {agent.last_name}",
            "score": _dec(s.final_score),
            "grade": s.final_grade,
            "rank": s.rank,
            "prev_score": prev_score,
            "prev_rank": prev_rank,
            "score_delta": round(_dec(s.final_score) - prev_score, 2) if s.final_score is not None and prev_score is not None else None,
            "rank_delta": prev_rank - s.rank if s.rank is not None and prev_rank is not None else None,
        })

    return result


# ── Biggest movers ──────────────────────────────────────────────────

@router.get("/movers")
def movers(
    period_id: uuid.UUID,
    n: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    prev = _get_previous_period(db, period_id)
    if not prev:
        return {"improved": [], "declined": []}

    current_scores = (
        db.query(AgentPeriodScore, Agent)
        .join(Agent, AgentPeriodScore.agent_id == Agent.id)
        .filter(AgentPeriodScore.scoring_period_id == period_id, AgentPeriodScore.final_score.isnot(None))
        .all()
    )
    prev_scores = (
        db.query(AgentPeriodScore)
        .filter(AgentPeriodScore.scoring_period_id == prev.id, AgentPeriodScore.final_score.isnot(None))
        .all()
    )
    prev_map = {str(s.agent_id): _dec(s.final_score) for s in prev_scores}

    deltas = []
    for s, agent in current_scores:
        prev_score = prev_map.get(str(agent.id))
        if prev_score is not None and s.final_score is not None:
            delta = float(s.final_score) - prev_score
            deltas.append({
                "agent_id": str(agent.id),
                "name": f"{agent.first_name} {agent.last_name}",
                "score": _dec(s.final_score),
                "prev_score": prev_score,
                "delta": round(delta, 2),
                "grade": s.final_grade,
            })

    improved = sorted(deltas, key=lambda x: x["delta"], reverse=True)[:n]
    declined = sorted(deltas, key=lambda x: x["delta"])[:n]

    return {"improved": improved, "declined": declined}


# ── Outliers & alerts ───────────────────────────────────────────────

@router.get("/outliers")
def outliers(period_id: uuid.UUID, db: Session = Depends(get_db)):
    scores = (
        db.query(AgentPeriodScore, Agent)
        .join(Agent, AgentPeriodScore.agent_id == Agent.id)
        .filter(AgentPeriodScore.scoring_period_id == period_id, AgentPeriodScore.final_score.isnot(None))
        .all()
    )

    if not scores:
        return {"categories": [], "agents": []}

    all_scores = [float(s.final_score) for s, _ in scores]
    mean = sum(all_scores) / len(all_scores)
    variance = sum((x - mean) ** 2 for x in all_scores) / len(all_scores)
    std_dev = variance ** 0.5

    # Get previous period for decline detection
    prev = _get_previous_period(db, period_id)
    prev_map: dict[str, float] = {}
    if prev:
        prev_scores = (
            db.query(AgentPeriodScore)
            .filter(AgentPeriodScore.scoring_period_id == prev.id, AgentPeriodScore.final_score.isnot(None))
            .all()
        )
        prev_map = {str(s.agent_id): float(s.final_score) for s in prev_scores}

    categories: dict[str, list] = {
        "low_score": [],        # Score below mean - 1.5 std
        "high_score": [],       # Score above mean + 1.5 std
        "big_decline": [],      # Score dropped > 10 points
        "d_or_f_grade": [],     # D or F grade
        "new_agent": [],        # No previous score
    }

    for s, agent in scores:
        score = float(s.final_score)
        agent_id = str(agent.id)
        name = f"{agent.first_name} {agent.last_name}"
        entry = {
            "agent_id": agent_id,
            "name": name,
            "score": round(score, 2),
            "grade": s.final_grade,
        }

        if std_dev > 0 and score < mean - 1.5 * std_dev:
            categories["low_score"].append(entry)
        if std_dev > 0 and score > mean + 1.5 * std_dev:
            categories["high_score"].append(entry)

        prev_score = prev_map.get(agent_id)
        if prev_score is not None and score - prev_score < -10:
            categories["big_decline"].append({**entry, "prev_score": round(prev_score, 2), "delta": round(score - prev_score, 2)})
        if prev_score is None and prev:
            categories["new_agent"].append(entry)

        if (s.final_grade or "").upper() in ("D", "F"):
            categories["d_or_f_grade"].append(entry)

    summary = []
    labels = {
        "low_score": "Low Outliers",
        "high_score": "High Outliers",
        "big_decline": "Big Declines (>10pts)",
        "d_or_f_grade": "D/F Grades",
        "new_agent": "New Agents",
    }
    for key, agents_list in categories.items():
        if agents_list:
            summary.append({
                "key": key,
                "label": labels[key],
                "count": len(agents_list),
                "severity": "high" if key in ("low_score", "big_decline", "d_or_f_grade") else "medium" if key == "new_agent" else "info",
                "agents": sorted(agents_list, key=lambda x: x["score"]),
            })

    summary.sort(key=lambda x: {"high": 0, "medium": 1, "info": 2}.get(x["severity"], 3))
    return {"categories": summary}


# ── Business impact ─────────────────────────────────────────────────

@router.get("/impact")
def business_impact(period_id: uuid.UUID, db: Session = Depends(get_db)):
    scores = (
        db.query(AgentPeriodScore, Agent)
        .join(Agent, AgentPeriodScore.agent_id == Agent.id)
        .filter(AgentPeriodScore.scoring_period_id == period_id, AgentPeriodScore.final_score.isnot(None))
        .all()
    )

    if not scores:
        return {"agents": [], "total_potential_gain": 0}

    all_vals = [float(s.final_score) for s, _ in scores]
    mean_score = sum(all_vals) / len(all_vals)

    agents = []
    total_potential = 0
    for s, agent in scores:
        score = float(s.final_score)
        gap = mean_score - score if score < mean_score else 0
        potential = round(gap * 0.5, 2)  # Simplified potential gain metric
        total_potential += potential
        agents.append({
            "agent_id": str(agent.id),
            "name": f"{agent.first_name} {agent.last_name}",
            "score": round(score, 2),
            "grade": s.final_grade,
            "gap_to_mean": round(gap, 2),
            "potential_gain": potential,
        })

    agents.sort(key=lambda x: x["gap_to_mean"], reverse=True)
    return {
        "agents": agents[:30],
        "total_potential_gain": round(total_potential, 2),
        "mean_score": round(mean_score, 2),
        "agent_count": len(scores),
    }


# ── Coaching action plan ────────────────────────────────────────────

@router.get("/coaching")
def coaching_plan(period_id: uuid.UUID, db: Session = Depends(get_db)):
    scores = (
        db.query(AgentPeriodScore, Agent)
        .join(Agent, AgentPeriodScore.agent_id == Agent.id)
        .options(joinedload(AgentPeriodScore.agent).joinedload(Agent.supervisor))
        .filter(AgentPeriodScore.scoring_period_id == period_id)
        .order_by(asc(AgentPeriodScore.final_score))
        .all()
    )

    prev = _get_previous_period(db, period_id)
    prev_map: dict[str, float] = {}
    if prev:
        prev_scores = (
            db.query(AgentPeriodScore)
            .filter(AgentPeriodScore.scoring_period_id == prev.id, AgentPeriodScore.final_score.isnot(None))
            .all()
        )
        prev_map = {str(s.agent_id): float(s.final_score) for s in prev_scores}

    result = []
    for s, agent in scores:
        if s.final_score is None:
            continue
        grade = (s.final_grade or "").upper()
        # Priority: D/F first, then C, rest lower
        if grade in ("D", "F"):
            priority = "high"
        elif grade == "C":
            priority = "medium"
        else:
            priority = "low"

        prev_score = prev_map.get(str(agent.id))
        delta = round(float(s.final_score) - prev_score, 2) if prev_score is not None else None

        supervisor_name = ""
        if agent.supervisor:
            supervisor_name = f"{agent.supervisor.first_name} {agent.supervisor.last_name}"

        result.append({
            "agent_id": str(agent.id),
            "name": f"{agent.first_name} {agent.last_name}",
            "supervisor": supervisor_name,
            "score": _dec(s.final_score),
            "grade": s.final_grade,
            "rank": s.rank,
            "priority": priority,
            "score_delta": delta,
            "strengths": s.strengths if isinstance(s.strengths, list) else [],
            "opportunities": s.opportunities if isinstance(s.opportunities, list) else [],
        })

    # Sort: high priority first, then by score ascending
    priority_order = {"high": 0, "medium": 1, "low": 2}
    result.sort(key=lambda x: (priority_order.get(x["priority"], 3), x["score"] or 0))

    return result


# ── Metric analysis ─────────────────────────────────────────────────

@router.get("/metrics/{metric_key}/analysis")
def metric_analysis(
    metric_key: str,
    period_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    metric_def = db.query(MetricDefinition).filter(MetricDefinition.key == metric_key).first()
    if not metric_def:
        return {"error": "Metric not found", "records": [], "stats": {}}

    # Find scorecard_metric linking
    sc_metric = (
        db.query(ScorecardMetric)
        .filter(ScorecardMetric.metric_id == metric_def.id)
        .first()
    )
    if not sc_metric:
        return {"error": "Metric not in scorecard", "records": [], "stats": {}}

    records = (
        db.query(PerformanceRecord, Agent)
        .join(Agent, PerformanceRecord.agent_id == Agent.id)
        .filter(
            PerformanceRecord.scoring_period_id == period_id,
            PerformanceRecord.scorecard_metric_id == sc_metric.id,
        )
        .all()
    )

    values = [float(r.actual_value) for r, _ in records if r.actual_value is not None]
    stats = {}
    if values:
        values_sorted = sorted(values)
        n = len(values_sorted)
        stats = {
            "count": n,
            "mean": round(sum(values) / n, 2),
            "min": round(values_sorted[0], 2),
            "max": round(values_sorted[-1], 2),
            "median": round(values_sorted[n // 2], 2),
            "p25": round(values_sorted[n // 4], 2) if n >= 4 else None,
            "p75": round(values_sorted[3 * n // 4], 2) if n >= 4 else None,
        }

    items = []
    for r, agent in records:
        items.append({
            "agent_id": str(agent.id),
            "name": f"{agent.first_name} {agent.last_name}",
            "value": _dec(r.actual_value),
            "grade": r.metric_grade,
            "points": _dec(r.metric_points),
        })

    items.sort(key=lambda x: x["value"] or 0, reverse=True)

    # Build histogram bins
    hist = []
    if values:
        mn, mx = min(values), max(values)
        rng = mx - mn if mx != mn else 1
        step = rng / 10
        for i in range(10):
            lo = mn + i * step
            hi = mn + (i + 1) * step
            if i == 9:
                cnt = sum(1 for v in values if lo <= v <= hi)
            else:
                cnt = sum(1 for v in values if lo <= v < hi)
            hist.append({"bin": f"{round(lo, 1)}-{round(hi, 1)}", "count": cnt})

    return {
        "metric": {
            "key": metric_def.key,
            "name": metric_def.display_name or metric_def.name,
            "unit": metric_def.unit,
            "direction": metric_def.direction,
            "channel": metric_def.channel,
        },
        "stats": stats,
        "histogram": hist,
        "records": items,
    }


# ── Available metrics list ──────────────────────────────────────────

@router.get("/metrics")
def available_metrics(period_id: uuid.UUID, db: Session = Depends(get_db)):
    # Get metrics that have data for this period
    metrics = (
        db.query(MetricDefinition)
        .join(ScorecardMetric, ScorecardMetric.metric_id == MetricDefinition.id)
        .join(PerformanceRecord, PerformanceRecord.scorecard_metric_id == ScorecardMetric.id)
        .filter(PerformanceRecord.scoring_period_id == period_id)
        .distinct()
        .all()
    )

    return [
        {
            "key": m.key,
            "name": m.display_name or m.name,
            "channel": m.channel,
            "unit": m.unit,
            "direction": m.direction,
        }
        for m in metrics
    ]


# ── Filters ─────────────────────────────────────────────────────────

@router.get("/filters")
def report_filters(db: Session = Depends(get_db)):
    sites = db.query(Site).order_by(Site.name).all()
    supervisors = db.query(Supervisor).filter(Supervisor.is_active == True).order_by(Supervisor.last_name).all()

    return {
        "sites": [{"id": str(s.id), "name": s.name} for s in sites],
        "supervisors": [
            {"id": str(s.id), "name": f"{s.first_name} {s.last_name}"}
            for s in supervisors
        ],
    }
