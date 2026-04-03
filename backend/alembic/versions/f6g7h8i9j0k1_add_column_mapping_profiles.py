"""add column_mapping_profiles table

Revision ID: f6g7h8i9j0k1
Revises: e5f6g7h8i9j0
Create Date: 2026-04-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "f6g7h8i9j0k1"
down_revision = "e5f6g7h8i9j0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "column_mapping_profiles",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("mappings", JSONB, nullable=False, server_default="[]"),
        sa.Column("column_fingerprint", JSONB, nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("column_mapping_profiles")
