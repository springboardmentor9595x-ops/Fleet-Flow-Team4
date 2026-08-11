"""flesh_out_milestone2_models

Revision ID: 9b26770e436d
Revises: 0c69cf9aceaa
Create Date: 2026-08-07 10:11:26.713961

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM

# revision identifiers, used by Alembic.
revision: str = '9b26770e436d'
down_revision: Union[str, Sequence[str], None] = '0c69cf9aceaa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create the new trip_status_enum type in PostgreSQL
    trip_status_enum = ENUM('Scheduled', 'Active', 'Completed', 'Cancelled', name='trip_status_enum')
    trip_status_enum.create(op.get_bind(), checkfirst=True)

    # 2. Create the shipment_status_history table (reusing existing shipment_status_enum type)
    op.create_table('shipment_status_history',
        sa.Column('history_id', sa.UUID(), nullable=False),
        sa.Column('shipment_id', sa.UUID(), nullable=False),
        sa.Column('status', ENUM('Created', 'Assigned', 'InTransit', 'Delayed', 'Delivered', 'Cancelled', name='shipment_status_enum', create_type=False), nullable=False),
        sa.Column('location', sa.String(length=255), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('updated_by', sa.UUID(), nullable=True),
        sa.Column('changed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['shipment_id'], ['shipments.shipment_id'], ),
        sa.ForeignKeyConstraint(['updated_by'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('history_id')
    )
    
    # 3. Add columns to gps_tracking
    op.add_column('gps_tracking', sa.Column('trip_id', sa.UUID(), nullable=True))
    op.add_column('gps_tracking', sa.Column('latitude', sa.Float(), nullable=False, server_default='0.0'))
    op.add_column('gps_tracking', sa.Column('longitude', sa.Float(), nullable=False, server_default='0.0'))
    op.add_column('gps_tracking', sa.Column('speed', sa.Float(), nullable=True))
    op.add_column('gps_tracking', sa.Column('timestamp', sa.DateTime(), nullable=True))
    op.create_foreign_key('fk_gps_tracking_trips', 'gps_tracking', 'trips', ['trip_id'], ['trip_id'])
    
    # 4. Add columns to trips (referencing the newly created trip_status_enum)
    op.add_column('trips', sa.Column('status', ENUM('Scheduled', 'Active', 'Completed', 'Cancelled', name='trip_status_enum', create_type=False), nullable=False, server_default='Scheduled'))
    op.add_column('trips', sa.Column('start_lat', sa.Float(), nullable=False, server_default='0.0'))
    op.add_column('trips', sa.Column('start_lng', sa.Float(), nullable=False, server_default='0.0'))
    op.add_column('trips', sa.Column('end_lat', sa.Float(), nullable=False, server_default='0.0'))
    op.add_column('trips', sa.Column('end_lng', sa.Float(), nullable=False, server_default='0.0'))
    op.add_column('trips', sa.Column('distance', sa.Float(), nullable=True))
    op.add_column('trips', sa.Column('duration', sa.Float(), nullable=True))
    op.add_column('trips', sa.Column('eta', sa.DateTime(), nullable=True))
    op.add_column('trips', sa.Column('route_path', sa.Text(), nullable=True))
    op.add_column('trips', sa.Column('start_time', sa.DateTime(), nullable=True))
    op.add_column('trips', sa.Column('end_time', sa.DateTime(), nullable=True))
    op.add_column('trips', sa.Column('created_at', sa.DateTime(), nullable=True))
    op.add_column('trips', sa.Column('updated_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    # 1. Drop trips columns
    op.drop_column('trips', 'updated_at')
    op.drop_column('trips', 'created_at')
    op.drop_column('trips', 'end_time')
    op.drop_column('trips', 'start_time')
    op.drop_column('trips', 'route_path')
    op.drop_column('trips', 'eta')
    op.drop_column('trips', 'duration')
    op.drop_column('trips', 'distance')
    op.drop_column('trips', 'end_lng')
    op.drop_column('trips', 'end_lat')
    op.drop_column('trips', 'start_lng')
    op.drop_column('trips', 'start_lat')
    op.drop_column('trips', 'status')
    
    # 2. Drop gps_tracking columns
    op.drop_constraint('fk_gps_tracking_trips', 'gps_tracking', type_='foreignkey')
    op.drop_column('gps_tracking', 'timestamp')
    op.drop_column('gps_tracking', 'speed')
    op.drop_column('gps_tracking', 'longitude')
    op.drop_column('gps_tracking', 'latitude')
    op.drop_column('gps_tracking', 'trip_id')
    
    # 3. Drop shipment_status_history table
    op.drop_table('shipment_status_history')
    
    # 4. Drop the trip_status_enum type
    trip_status_enum = ENUM('Scheduled', 'Active', 'Completed', 'Cancelled', name='trip_status_enum')
    trip_status_enum.drop(op.get_bind(), checkfirst=True)
