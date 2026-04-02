import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Agent, AgentPeriodScore, ScorecardTemplate, ScoringPeriod, Supervisor
from app.services.rollup import company_rollup, site_rollup, supervisor_rollup

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/rollup")
def get_rollup(
    level: str,
    entity_id: uuid.UUID,
    period_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    if level == "company":
        return company_rollup(db, entity_id, period_id)
    elif level == "site":
        return site_rollup(db, entity_id, period_id)
    elif level == "supervisor":
        return supervisor_rollup(db, entity_id, period_id)
    else:
        raise HTTPException(400, f"Invalid level: {level}")


@router.get("/agent-scores")
def list_agent_scores(
    period_id: uuid.UUID,
    supervisor_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
):
    stmt = (
        select(AgentPeriodScore)
        .where(AgentPeriodScore.scoring_period_id == period_id)
        .order_by(AgentPeriodScore.rank.asc().nullslast())
    )
    if supervisor_id:
        stmt = stmt.join(Agent, Agent.id == AgentPeriodScore.agent_id).where(
            Agent.supervisor_id == supervisor_id
        )
    scores = db.scalars(stmt).all()

    result = []
    for s in scores:
        agent = db.get(Agent, s.agent_id)
        supervisor = db.get(Supervisor, agent.supervisor_id) if agent else None
        result.append({
            "agent_id": str(s.agent_id),
            "agent_name": f"{agent.first_name} {agent.last_name}" if agent else "",
            "employee_id": agent.employee_id if agent else "",
            "supervisor_name": f"{supervisor.first_name} {supervisor.last_name}" if supervisor else "",
            "rank": s.rank,
            "final_score": float(s.final_score) if s.final_score else None,
            "final_grade": s.final_grade,
            "voice_score": float(s.voice_score) if s.voice_score else None,
            "chat_score": float(s.chat_score) if s.chat_score else None,
            "email_score": float(s.email_score) if s.email_score else None,
            "non_channel_score": float(s.non_channel_score) if s.non_channel_score else None,
            "logged_hours": float(s.logged_hours) if s.logged_hours else None,
            "pfp_payout": float(s.pfp_payout) if s.pfp_payout else None,
            "pfp_money_left": float(s.pfp_money_left) if s.pfp_money_left else None,
            "strengths": s.strengths or [],
            "opportunities": s.opportunities or [],
        })
    return result


@router.get("/agent/{agent_id}/scorecard")
def get_agent_scorecard(
    agent_id: uuid.UUID,
    period_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    from app.models import PerformanceRecord, ScorecardMetric, MetricDefinition

    agent = db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")

    period_score = db.scalar(
        select(AgentPeriodScore).where(
            AgentPeriodScore.agent_id == agent_id,
            AgentPeriodScore.scoring_period_id == period_id,
        )
    )

    records = db.scalars(
        select(PerformanceRecord).where(
            PerformanceRecord.agent_id == agent_id,
            PerformanceRecord.scoring_period_id == period_id,
        )
    ).all()

    metrics = []
    for rec in records:
        sm = db.get(ScorecardMetric, rec.scorecard_metric_id)
        metric_def = db.get(MetricDefinition, sm.metric_id) if sm else None
        metrics.append({
            "metric_key": metric_def.key if metric_def else "",
            "metric_name": metric_def.name if metric_def else "",
            "channel": metric_def.channel if metric_def else "",
            "direction": metric_def.direction if metric_def else "",
            "unit": metric_def.unit if metric_def else "",
            "actual_value": float(rec.actual_value),
            "grade": rec.metric_grade,
            "points": float(rec.metric_points) if rec.metric_points else None,
            "include_in_score": sm.include_in_score if sm else False,
            "show_on_scorecard": sm.show_on_scorecard if sm else False,
            "weight": float(sm.weight) if sm else 0,
        })

    summary = None
    if period_score:
        summary = {
            "rank": period_score.rank,
            "final_score": float(period_score.final_score) if period_score.final_score else None,
            "final_grade": period_score.final_grade,
            "voice_score": float(period_score.voice_score) if period_score.voice_score else None,
            "chat_score": float(period_score.chat_score) if period_score.chat_score else None,
            "email_score": float(period_score.email_score) if period_score.email_score else None,
            "non_channel_score": float(period_score.non_channel_score) if period_score.non_channel_score else None,
            "voice_pct": float(period_score.voice_pct) if period_score.voice_pct else None,
            "chat_pct": float(period_score.chat_pct) if period_score.chat_pct else None,
            "email_pct": float(period_score.email_pct) if period_score.email_pct else None,
            "logged_hours": float(period_score.logged_hours) if period_score.logged_hours else None,
            "pfp_rate": float(period_score.pfp_rate) if period_score.pfp_rate else None,
            "pfp_payout": float(period_score.pfp_payout) if period_score.pfp_payout else None,
            "pfp_max_payout": float(period_score.pfp_max_payout) if period_score.pfp_max_payout else None,
            "pfp_money_left": float(period_score.pfp_money_left) if period_score.pfp_money_left else None,
            "strengths": period_score.strengths or [],
            "opportunities": period_score.opportunities or [],
        }

    supervisor = db.get(Supervisor, agent.supervisor_id)
    return {
        "agent": {
            "id": str(agent.id),
            "name": f"{agent.first_name} {agent.last_name}",
            "employee_id": agent.employee_id,
            "supervisor": f"{supervisor.first_name} {supervisor.last_name}" if supervisor else "",
        },
        "summary": summary,
        "metrics": metrics,
    }


@router.get("/summary")
def get_summary(
    period_id: Optional[uuid.UUID] = Query(None),
    db: Session = Depends(get_db),
):
    """Return an overview for the most recent (or specified) scoring period."""

    # --- resolve period ---
    if period_id:
        period = db.get(ScoringPeriod, period_id)
        if not period:
            raise HTTPException(404, "Scoring period not found")
    else:
        period = db.scalar(
            select(ScoringPeriod).order_by(ScoringPeriod.start_date.desc())
        )
        if not period:
            raise HTTPException(404, "No scoring periods exist")

    # --- all agent scores for this period ---
    scores = db.scalars(
        select(AgentPeriodScore)
        .where(AgentPeriodScore.scoring_period_id == period.id)
        .order_by(AgentPeriodScore.rank.asc().nullslast())
    ).all()

    # --- KPI aggregates ---
    graded = [s for s in scores if s.final_score is not None]
    avg_score = (
        float(sum(s.final_score for s in graded) / len(graded))
        if graded
        else None
    )
    agents_graded = len(graded)
    a_count = sum(1 for s in graded if s.final_grade == "A")
    a_grade_rate = round(a_count / agents_graded * 100, 1) if agents_graded else 0
    total_pfp_payout = float(
        sum(s.pfp_payout for s in scores if s.pfp_payout is not None)
    )
    total_money_left = float(
        sum(s.pfp_money_left for s in scores if s.pfp_money_left is not None)
    )

    # --- grade distribution ---
    grade_distribution = {"A": 0, "B": 0, "C": 0, "D": 0, "F": 0}
    for s in graded:
        if s.final_grade in grade_distribution:
            grade_distribution[s.final_grade] += 1

    # --- top 10 agents by rank ---
    top_agents = []
    for s in scores[:10]:
        agent = db.get(Agent, s.agent_id)
        top_agents.append({
            "agent_id": str(s.agent_id),
            "name": f"{agent.first_name} {agent.last_name}" if agent else "",
            "score": float(s.final_score) if s.final_score is not None else None,
            "grade": s.final_grade,
            "rank": s.rank,
        })

    # --- recent periods (for period selector) ---
    all_periods = db.scalars(
        select(ScoringPeriod).order_by(ScoringPeriod.start_date.desc())
    ).all()
    recent_periods = [
        {
            "id": str(p.id),
            "label": p.label,
            "start_date": p.start_date.isoformat(),
            "end_date": p.end_date.isoformat(),
        }
        for p in all_periods
    ]

    return {
        "period": {
            "id": str(period.id),
            "label": period.label,
            "start_date": period.start_date.isoformat(),
            "end_date": period.end_date.isoformat(),
        },
        "kpi": {
            "avg_score": round(avg_score, 2) if avg_score is not None else None,
            "agents_graded": agents_graded,
            "a_grade_rate": a_grade_rate,
            "total_pfp_payout": round(total_pfp_payout, 2),
            "total_money_left": round(total_money_left, 2),
        },
        "grade_distribution": grade_distribution,
        "top_agents": top_agents,
        "recent_periods": recent_periods,
    }


@router.get("/templates/active")
def get_active_template(db: Session = Depends(get_db)):
    """Return the active scorecard template (or the first available one)."""
    template = db.scalar(
        select(ScorecardTemplate)
        .where(ScorecardTemplate.is_active == True)
        .order_by(ScorecardTemplate.updated_at.desc())
    )
    if not template:
        template = db.scalar(
            select(ScorecardTemplate).order_by(ScorecardTemplate.created_at.desc())
        )
    if not template:
        raise HTTPException(404, "No scorecard templates exist")

    return {
        "id": str(template.id),
        "name": template.name,
        "period_type": template.period_type,
        "channel_weight": float(template.channel_weight),
        "non_channel_weight": float(template.non_channel_weight),
        "is_active": template.is_active,
    }
