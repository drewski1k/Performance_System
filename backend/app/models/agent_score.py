import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AgentPeriodScore(Base):
    __tablename__ = "agent_period_scores"
    __table_args__ = (UniqueConstraint("agent_id", "scoring_period_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    scoring_period_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scoring_periods.id", ondelete="CASCADE"), nullable=False)
    template_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scorecard_templates.id"), nullable=False)

    # Channel scores (0-100)
    voice_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    chat_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    email_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))

    # Availability-based channel weights (sum to 1.0)
    voice_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    chat_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    email_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))

    # Composite scores
    overall_channel_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    non_channel_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    final_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    final_grade: Mapped[str | None] = mapped_column(String(1))  # A/B/C/D/F
    rank: Mapped[int | None] = mapped_column(Integer)

    # PFP fields
    logged_hours: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    pfp_rate: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    pfp_payout: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    pfp_max_payout: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    pfp_money_left: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    # Strength/opportunity snapshots
    strengths: Mapped[dict | None] = mapped_column(JSONB)
    opportunities: Mapped[dict | None] = mapped_column(JSONB)

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    agent = relationship("Agent", back_populates="period_scores")
    template = relationship("ScorecardTemplate")


class DynamicGradeScale(Base):
    __tablename__ = "dynamic_grade_scales"
    __table_args__ = (UniqueConstraint("scoring_period_id", "scorecard_metric_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    scoring_period_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scoring_periods.id", ondelete="CASCADE"), nullable=False)
    scorecard_metric_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scorecard_metrics.id", ondelete="CASCADE"), nullable=False)
    mean: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    std_dev: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    grade_a: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    grade_b: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    grade_c: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    grade_d: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    agent_count: Mapped[int] = mapped_column(Integer, nullable=False)
