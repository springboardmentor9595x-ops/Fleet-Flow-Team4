"""flesh out shipment model

Revision ID: 0c69cf9aceaa
Revises: 3552a7590f1b
Create Date: 2026-08-05 11:19:12.434252

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0c69cf9aceaa'
down_revision: Union[str, Sequence[str], None] = '3552a7590f1b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    shipment_status_enum = sa.Enum(
        'Created', 'Assigned', 'InTransit', 'Delayed', 'Delivered', 'Cancelled',
        name='shipment_status_enum'
    )
    shipment_status_enum.create(op.get_bind(), checkfirst=True)

    op.add_column('shipments', sa.Column('tracking_number', sa.String(length=30), nullable=False))
    op.add_column('shipments', sa.Column('source', sa.String(length=150), nullable=False))
    op.add_column('shipments', sa.Column('destination', sa.String(length=150), nullable=False))
    op.add_column('shipments', sa.Column('customer_name', sa.String(length=100), nullable=False))
    op.add_column('shipments', sa.Column('shipment_weight', sa.Float(), nullable=False))
    op.add_column('shipments', sa.Column('status', shipment_status_enum, nullable=False, server_default='Created'))
    op.add_column('shipments', sa.Column('expected_delivery_at', sa.DateTime(), nullable=True))
    op.add_column('shipments', sa.Column('created_at', sa.DateTime(), nullable=True))
    op.add_column('shipments', sa.Column('updated_at', sa.DateTime(), nullable=True))
    op.create_index(op.f('ix_shipments_tracking_number'), 'shipments', ['tracking_number'], unique=True)
    op.alter_column('shipments', 'status', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_shipments_tracking_number'), table_name='shipments')
    op.drop_column('shipments', 'updated_at')
    op.drop_column('shipments', 'created_at')
    op.drop_column('shipments', 'expected_delivery_at')
    op.drop_column('shipments', 'status')
    op.drop_column('shipments', 'shipment_weight')
    op.drop_column('shipments', 'customer_name')
    op.drop_column('shipments', 'destination')
    op.drop_column('shipments', 'source')
    op.drop_column('shipments', 'tracking_number')

    shipment_status_enum = sa.Enum(name='shipment_status_enum')
    shipment_status_enum.drop(op.get_bind(), checkfirst=True)