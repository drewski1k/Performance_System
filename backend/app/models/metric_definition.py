import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MetricDefinition(Base):
    __tablename__ = "metric_definitions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    channel: Mapped[str] = mapped_column(String(20), nullable=False)  # voice, chat, email, sms, non_channel
    unit: Mapped[str] = mapped_column(String(30), nullable=False)  # seconds, percent, count, ratio
    direction: Mapped[str] = mapped_column(String(15), nullable=False, default="higher_better")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
