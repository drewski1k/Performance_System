import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MetricDefinition(Base):
    __tablename__ = "metric_definitions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(String(500))
    channel: Mapped[str | None] = mapped_column(String(20), nullable=True)  # voice, chat, email, sms, non_channel, or NULL (undefined)
    unit: Mapped[str] = mapped_column(String(30), nullable=False)  # seconds, percent, count, ratio
    direction: Mapped[str] = mapped_column(String(15), nullable=False, default="higher_better")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    formula: Mapped[str | None] = mapped_column(Text)  # e.g. "(voice_avail_time + chat_avail_time) / total_logged_time * 100"
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
