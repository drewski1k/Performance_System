import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ScorecardTemplate(Base):
    __tablename__ = "scorecard_templates"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    period_type: Mapped[str] = mapped_column(String(20), nullable=False, default="biweekly")
    channel_weight: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    non_channel_weight: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=100)
    outlier_method: Mapped[str] = mapped_column(String(20), nullable=False, default="iqr")
    iqr_multiplier: Mapped[Decimal] = mapped_column(Numeric(3, 1), nullable=False, default=Decimal("1.5"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    company = relationship("Company", back_populates="scorecard_templates")
    metrics = relationship("ScorecardMetric", back_populates="template", cascade="all, delete-orphan")
    pfp_config = relationship("PfpConfig", back_populates="template", uselist=False, cascade="all, delete-orphan")
    productivity_states = relationship("ProductivityState", back_populates="template", cascade="all, delete-orphan")


class ScorecardMetric(Base):
    __tablename__ = "scorecard_metrics"
    __table_args__ = (UniqueConstraint("template_id", "metric_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scorecard_templates.id", ondelete="CASCADE"), nullable=False)
    metric_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("metric_definitions.id", ondelete="CASCADE"), nullable=False)
    weight: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    include_in_score: Mapped[bool] = mapped_column(Boolean, default=False)
    show_on_scorecard: Mapped[bool] = mapped_column(Boolean, default=False)
    min_threshold: Mapped[int | None] = mapped_column(Integer)
    threshold_basis: Mapped[str | None] = mapped_column(String(50))
    grade_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="dynamic")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    template = relationship("ScorecardTemplate", back_populates="metrics")
    metric = relationship("MetricDefinition")
    manual_thresholds = relationship("ManualGradeThreshold", back_populates="scorecard_metric", uselist=False, cascade="all, delete-orphan")


class ManualGradeThreshold(Base):
    __tablename__ = "manual_grade_thresholds"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    scorecard_metric_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("scorecard_metrics.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    grade_a: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    grade_b: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    grade_c: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    grade_d: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)

    scorecard_metric = relationship("ScorecardMetric", back_populates="manual_thresholds")
