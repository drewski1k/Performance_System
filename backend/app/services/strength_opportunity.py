"""Identify strengths and opportunities at any hierarchy level."""
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Agent, AgentPeriodScore, Site, Supervisor


def get_strengths_opportunities(
    db: Session, level: str, entity_id: uuid.UUID, period_id: uuid.UUID
) -> dict:
    """Aggregate strengths and opportunities across agents at the given level."""
    if level == "agent":
        scores = [db.scalar(
            select(AgentPeriodScore).where(
                AgentPeriodScore.agent_id == entity_id,
                AgentPeriodScore.scoring_period_id == period_id,
            )
        )]
        scores = [s for s in scores if s]
    elif level == "supervisor":
        scores = list(db.scalars(
            select(AgentPeriodScore)
            .join(Agent)
            .where(Agent.supervisor_id == entity_id, AgentPeriodScore.scoring_period_id == period_id)
        ).all())
    elif level == "site":
        scores = list(db.scalars(
            select(AgentPeriodScore)
            .join(Agent).join(Supervisor)
            .where(Supervisor.site_id == entity_id, AgentPeriodScore.scoring_period_id == period_id)
        ).all())
    elif level == "company":
        scores = list(db.scalars(
            select(AgentPeriodScore)
            .join(Agent).join(Supervisor).join(Site)
            .where(Site.company_id == entity_id, AgentPeriodScore.scoring_period_id == period_id)
        ).all())
    else:
        return {"strengths": [], "opportunities": []}

    # Aggregate frequency of each metric appearing as strength/opportunity
    strength_counts: dict[str, list[float]] = {}
    opportunity_counts: dict[str, list[float]] = {}

    for s in scores:
        for item in (s.strengths or []):
            name = item.get("metric", "")
            strength_counts.setdefault(name, []).append(item.get("delta_pct", 0))
        for item in (s.opportunities or []):
            name = item.get("metric", "")
            opportunity_counts.setdefault(name, []).append(item.get("delta_pct", 0))

    strengths = [
        {"metric": name, "frequency": len(deltas), "avg_delta_pct": round(sum(deltas) / len(deltas), 1)}
        for name, deltas in sorted(strength_counts.items(), key=lambda x: len(x[1]), reverse=True)
    ][:10]

    opportunities = [
        {"metric": name, "frequency": len(deltas), "avg_delta_pct": round(sum(deltas) / len(deltas), 1)}
        for name, deltas in sorted(opportunity_counts.items(), key=lambda x: len(x[1]), reverse=True)
    ][:10]

    return {"strengths": strengths, "opportunities": opportunities}
