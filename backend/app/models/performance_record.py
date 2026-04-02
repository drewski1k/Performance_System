import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PerformanceRecord(Base):
    __tablename__ = "performance_records"
    __table_args__ = (UniqueConstraint("agent_id", "scoring_period_id", "scorecard_metric_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    scoring_period_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scoring_periods.id", ondelete="CASCADE"), nullable=False)
    scorecard_metric_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scorecard_metrics.id", ondelete="CASCADE"), nullable=False)
    actual_value: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    metric_grade: Mapped[str | None] = mapped_column(String(1))  # A/B/C/D/F
    metric_points: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    agent = relationship("Agent", back_populates="performance_records")
    scorecard_metric = relationship("ScorecardMetric")
