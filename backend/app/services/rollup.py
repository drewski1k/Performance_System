"""Hierarchy rollup: aggregate agent scores to supervisor/site/company level."""
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Agent, AgentPeriodScore, Company, Site, Supervisor


def _avg(values: list) -> Decimal | None:
    nums = [float(v) for v in values if v is not None]
    if not nums:
        return None
    return Decimal(str(round(sum(nums) / len(nums), 2)))


def supervisor_rollup(db: Session, supervisor_id: uuid.UUID, period_id: uuid.UUID) -> dict:
    """Get aggregated scores for a supervisor's agents."""
    scores = db.scalars(
        select(AgentPeriodScore)
        .join(Agent, Agent.id == AgentPeriodScore.agent_id)
        .where(
            Agent.supervisor_id == supervisor_id,
            AgentPeriodScore.scoring_period_id == period_id,
        )
    ).all()

    return {
        "entity_type": "supervisor",
        "entity_id": str(supervisor_id),
        "period_id": str(period_id),
        "agent_count": len(scores),
        "avg_final_score": _avg([s.final_score for s in scores]),
        "avg_voice_score": _avg([s.voice_score for s in scores]),
        "avg_chat_score": _avg([s.chat_score for s in scores]),
        "avg_email_score": _avg([s.email_score for s in scores]),
        "avg_non_channel_score": _avg([s.non_channel_score for s in scores]),
        "total_pfp_payout": sum(float(s.pfp_payout or 0) for s in scores),
        "total_pfp_money_left": sum(float(s.pfp_money_left or 0) for s in scores),
        "grade_distribution": _grade_distribution(scores),
    }


def site_rollup(db: Session, site_id: uuid.UUID, period_id: uuid.UUID) -> dict:
    """Get aggregated scores across all agents at a site."""
    scores = db.scalars(
        select(AgentPeriodScore)
        .join(Agent, Agent.id == AgentPeriodScore.agent_id)
        .join(Supervisor, Supervisor.id == Agent.supervisor_id)
        .where(
            Supervisor.site_id == site_id,
            AgentPeriodScore.scoring_period_id == period_id,
        )
    ).all()

    return {
        "entity_type": "site",
        "entity_id": str(site_id),
        "period_id": str(period_id),
        "agent_count": len(scores),
        "avg_final_score": _avg([s.final_score for s in scores]),
        "avg_voice_score": _avg([s.voice_score for s in scores]),
        "avg_chat_score": _avg([s.chat_score for s in scores]),
        "avg_email_score": _avg([s.email_score for s in scores]),
        "avg_non_channel_score": _avg([s.non_channel_score for s in scores]),
        "total_pfp_payout": sum(float(s.pfp_payout or 0) for s in scores),
        "total_pfp_money_left": sum(float(s.pfp_money_left or 0) for s in scores),
        "grade_distribution": _grade_distribution(scores),
    }


def company_rollup(db: Session, company_id: uuid.UUID, period_id: uuid.UUID) -> dict:
    """Get aggregated scores across all agents in a company."""
    scores = db.scalars(
        select(AgentPeriodScore)
        .join(Agent, Agent.id == AgentPeriodScore.agent_id)
        .join(Supervisor, Supervisor.id == Agent.supervisor_id)
        .join(Site, Site.id == Supervisor.site_id)
        .where(
            Site.company_id == company_id,
            AgentPeriodScore.scoring_period_id == period_id,
        )
    ).all()

    return {
        "entity_type": "company",
        "entity_id": str(company_id),
        "period_id": str(period_id),
        "agent_count": len(scores),
        "avg_final_score": _avg([s.final_score for s in scores]),
        "avg_voice_score": _avg([s.voice_score for s in scores]),
        "avg_chat_score": _avg([s.chat_score for s in scores]),
        "avg_email_score": _avg([s.email_score for s in scores]),
        "avg_non_channel_score": _avg([s.non_channel_score for s in scores]),
        "total_pfp_payout": sum(float(s.pfp_payout or 0) for s in scores),
        "total_pfp_money_left": sum(float(s.pfp_money_left or 0) for s in scores),
        "grade_distribution": _grade_distribution(scores),
    }


def _grade_distribution(scores: list[AgentPeriodScore]) -> dict[str, int]:
    dist = {"A": 0, "B": 0, "C": 0, "D": 0, "F": 0}
    for s in scores:
        if s.final_grade in dist:
            dist[s.final_grade] += 1
    return dist
