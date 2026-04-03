import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB

from app.database import Base


class ColumnMappingProfile(Base):
    __tablename__ = "column_mapping_profiles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON array of column mappings:
    # [{"original": "Person Name", "mapping_type": "roster", "mapped_to": "agent_name"}, ...]
    mappings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    # Column fingerprint — sorted list of original column names, used for auto-matching
    column_fingerprint: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    company = relationship("Company", backref="mapping_profiles")
