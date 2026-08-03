"""fix user_id UUID type

Revision ID: d8f9b7c6a5e4
Revises: 75a5dd00ea15
Create Date: 2026-07-26 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd8f9b7c6a5e4'
down_revision = '75a5dd00ea15'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto";')

    op.add_column(
        'users',
        sa.Column(
            'user_id_new',
            sa.dialects.postgresql.UUID(as_uuid=True),
            server_default=sa.text('gen_random_uuid()'),
            nullable=False,
        ),
    )
    op.execute('UPDATE users SET user_id_new = gen_random_uuid() WHERE user_id_new IS NULL;')

    op.add_column(
        'drivers',
        sa.Column('user_id_new', sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        'notifications',
        sa.Column('user_id_new', sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        'attendance',
        sa.Column('user_id_new', sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )

    op.execute(
        "UPDATE drivers SET user_id_new = users.user_id_new FROM users WHERE drivers.user_id = users.user_id;"
    )
    op.execute(
        "UPDATE notifications SET user_id_new = users.user_id_new FROM users WHERE notifications.user_id = users.user_id;"
    )
    op.execute(
        "UPDATE attendance SET user_id_new = users.user_id_new FROM users WHERE attendance.user_id = users.user_id;"
    )

    op.drop_constraint('drivers_user_id_fkey', 'drivers', type_='foreignkey')
    op.drop_constraint('notifications_user_id_fkey', 'notifications', type_='foreignkey')
    op.drop_constraint('attendance_user_id_fkey', 'attendance', type_='foreignkey')
    op.drop_constraint('users_pkey', 'users', type_='primary')

    op.drop_column('drivers', 'user_id')
    op.drop_column('notifications', 'user_id')
    op.drop_column('attendance', 'user_id')
    op.drop_column('users', 'user_id')

    op.alter_column('users', 'user_id_new', new_column_name='user_id')
    op.alter_column('drivers', 'user_id_new', new_column_name='user_id')
    op.alter_column('notifications', 'user_id_new', new_column_name='user_id')
    op.alter_column('attendance', 'user_id_new', new_column_name='user_id')

    op.create_primary_key('users_pkey', 'users', ['user_id'])
    op.create_foreign_key('drivers_user_id_fkey', 'drivers', 'users', ['user_id'], ['user_id'])
    op.create_unique_constraint('drivers_user_id_key', 'drivers', ['user_id'])
    op.create_foreign_key('notifications_user_id_fkey', 'notifications', 'users', ['user_id'], ['user_id'])
    op.create_foreign_key('attendance_user_id_fkey', 'attendance', 'users', ['user_id'], ['user_id'])


def downgrade() -> None:
    op.drop_constraint('attendance_user_id_fkey', 'attendance', type_='foreignkey')
    op.drop_constraint('notifications_user_id_fkey', 'notifications', type_='foreignkey')
    op.drop_constraint('drivers_user_id_fkey', 'drivers', type_='foreignkey')
    op.drop_constraint('drivers_user_id_key', 'drivers', type_='unique')
    op.drop_constraint('users_pkey', 'users', type_='primary')

    op.add_column('drivers', sa.Column('user_id_old', sa.Integer(), nullable=True))
    op.add_column('notifications', sa.Column('user_id_old', sa.Integer(), nullable=True))
    op.add_column('attendance', sa.Column('user_id_old', sa.Integer(), nullable=True))
    op.add_column('users', sa.Column('user_id_old', sa.Integer(), nullable=True))

    op.execute('UPDATE users SET user_id_old = 0 WHERE user_id_old IS NULL;')
    op.execute('UPDATE drivers SET user_id_old = 0 WHERE user_id_old IS NULL;')
    op.execute('UPDATE notifications SET user_id_old = 0 WHERE user_id_old IS NULL;')
    op.execute('UPDATE attendance SET user_id_old = 0 WHERE user_id_old IS NULL;')

    op.drop_column('drivers', 'user_id')
    op.drop_column('notifications', 'user_id')
    op.drop_column('attendance', 'user_id')
    op.drop_column('users', 'user_id')

    op.alter_column('users', 'user_id_old', new_column_name='user_id')
    op.alter_column('drivers', 'user_id_old', new_column_name='user_id')
    op.alter_column('notifications', 'user_id_old', new_column_name='user_id')
    op.alter_column('attendance', 'user_id_old', new_column_name='user_id')

    op.create_primary_key('users_pkey', 'users', ['user_id'])
    op.create_foreign_key('drivers_user_id_fkey', 'drivers', 'users', ['user_id'], ['user_id'])
    op.create_unique_constraint('drivers_user_id_key', 'drivers', ['user_id'])
    op.create_foreign_key('notifications_user_id_fkey', 'notifications', 'users', ['user_id'], ['user_id'])
    op.create_foreign_key('attendance_user_id_fkey', 'attendance', 'users', ['user_id'], ['user_id'])
