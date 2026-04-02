"""add custom metric fields

Revision ID: a1b2c3d4e5f6
Revises: cf1233a75eda
Create Date: 2026-04-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: str = "cf1233a75eda"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("metric_definitions", sa.Column("is_custom", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("metric_definitions", sa.Column("formula", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("metric_definitions", "formula")
    op.drop_column("metric_definitions", "is_custom")
