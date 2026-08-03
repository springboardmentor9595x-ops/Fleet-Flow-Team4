"""initial schema

Revision ID: 6132e2610390
Revises: 96995413c8b2
Create Date: 2026-07-25 11:26:31.640628

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6132e2610390'
down_revision: Union[str, Sequence[str], None] = '96995413c8b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
