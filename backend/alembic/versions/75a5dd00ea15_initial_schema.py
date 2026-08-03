"""initial schema

Revision ID: 75a5dd00ea15
Revises: 6132e2610390
Create Date: 2026-07-25 11:26:46.046566

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '75a5dd00ea15'
down_revision: Union[str, Sequence[str], None] = '6132e2610390'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
