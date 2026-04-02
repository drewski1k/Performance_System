"""widen employee_id columns for email addresses

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b2c3d4e5f6g7"
down_revision: str = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("agents", "employee_id", type_=sa.String(255), existing_type=sa.String(50))
    op.alter_column("supervisors", "employee_id", type_=sa.String(255), existing_type=sa.String(50))


def downgrade() -> None:
    op.alter_column("agents", "employee_id", type_=sa.String(50), existing_type=sa.String(255))
    op.alter_column("supervisors", "employee_id", type_=sa.String(50), existing_type=sa.String(255))
