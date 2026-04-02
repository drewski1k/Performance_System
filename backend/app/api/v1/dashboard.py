import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Agent, AgentPeriodScore, Supervisor
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
