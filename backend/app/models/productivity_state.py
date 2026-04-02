import uuid

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ProductivityState(Base):
    __tablename__ = "productivity_states"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scorecard_templates.id", ondelete="CASCADE"), nullable=False)
    state_name: Mapped[str] = mapped_column(String(100), nullable=False)
    state_type: Mapped[str] = mapped_column(String(20), nullable=False)  # AWAY, ACTIVE, etc.
    is_productive: Mapped[bool] = mapped_column(Boolean, default=False)
    category: Mapped[str | None] = mapped_column(String(50))  # Support, Development, Meetings, etc.

    template = relationship("ScorecardTemplate", back_populates="productivity_states")
