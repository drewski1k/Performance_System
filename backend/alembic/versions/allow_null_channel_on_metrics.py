"""allow null channel on metric_definitions

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-04-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c3d4e5f6g7h8"
down_revision: str = "b2c3d4e5f6g7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("metric_definitions", "channel", nullable=True, existing_type=sa.String(20))
    op.alter_column("metric_definitions", "key", type_=sa.String(255), existing_type=sa.String(50))


def downgrade() -> None:
    op.execute("UPDATE metric_definitions SET channel = 'non_channel' WHERE channel IS NULL")
    op.alter_column("metric_definitions", "channel", nullable=False, existing_type=sa.String(20))
