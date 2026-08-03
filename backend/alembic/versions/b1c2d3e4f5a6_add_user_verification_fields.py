"""add OTP verification columns to users

Revision ID: b1c2d3e4f5a6
Revises: d8f9b7c6a5e4
Create Date: 2026-08-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, Sequence[str], None] = 'd8f9b7c6a5e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_verified', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('verification_code', sa.String(length=10), nullable=True))
    op.add_column('users', sa.Column('verification_expires_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'verification_expires_at')
    op.drop_column('users', 'verification_code')
    op.drop_column('users', 'is_verified')
