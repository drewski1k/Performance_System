"""add hours_metric_id and hours_unit to pfp_configs

Revision ID: e5f6g7h8i9j0
Revises: d4e5f6g7h8i9
Create Date: 2026-04-03
"""
from alembic import op
import sqlalchemy as sa

revision = "e5f6g7h8i9j0"
down_revision = "d4e5f6g7h8i9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pfp_configs", sa.Column("hours_metric_id", sa.Uuid(), nullable=True))
    op.add_column("pfp_configs", sa.Column("hours_unit", sa.String(20), nullable=False, server_default="seconds"))
    op.create_foreign_key(
        "fk_pfp_hours_metric",
        "pfp_configs",
        "metric_definitions",
        ["hours_metric_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_pfp_hours_metric", "pfp_configs", type_="foreignkey")
    op.drop_column("pfp_configs", "hours_unit")
    op.drop_column("pfp_configs", "hours_metric_id")
