"""add job_title, department, metadata to agents

Revision ID: g7h8i9j0k1l2
Revises: f6g7h8i9j0k1
Create Date: 2026-04-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "g7h8i9j0k1l2"
down_revision = "f6g7h8i9j0k1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agents", sa.Column("job_title", sa.String(255), nullable=True))
    op.add_column("agents", sa.Column("department", sa.String(255), nullable=True))
    op.add_column("agents", sa.Column("metadata", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("agents", "metadata")
    op.drop_column("agents", "department")
    op.drop_column("agents", "job_title")
