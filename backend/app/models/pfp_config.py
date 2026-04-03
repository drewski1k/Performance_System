import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PfpConfig(Base):
    __tablename__ = "pfp_configs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("scorecard_templates.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    grade_a_rate: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=Decimal("3.00"))
    grade_b_rate: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=Decimal("2.00"))
    grade_c_rate: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=Decimal("0.00"))
    grade_d_rate: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=Decimal("0.00"))
    grade_f_rate: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=Decimal("0.00"))
    hours_metric_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("metric_definitions.id", ondelete="SET NULL"), nullable=True
    )
    hours_unit: Mapped[str] = mapped_column(String(20), nullable=False, default="seconds")
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    template = relationship("ScorecardTemplate", back_populates="pfp_config")
    hours_metric = relationship("MetricDefinition", foreign_keys=[hours_metric_id])
