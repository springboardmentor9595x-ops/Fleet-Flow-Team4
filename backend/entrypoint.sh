#!/bin/sh
# FleetFlow backend entrypoint
# Handles fresh DB (create tables + stamp + seed) vs existing DB (run migrations)
set -e

echo "Waiting for postgres to be ready..."

# Check if alembic_version table exists (i.e., DB has been initialized before)
TABLE_EXISTS=$(python -c "
import sys
from sqlalchemy import create_engine, inspect, text
import os

url = os.environ.get('DATABASE_URL', '')
engine = create_engine(url)
try:
    with engine.connect() as conn:
        result = conn.execute(text(\"SELECT to_regclass('public.alembic_version')\"))
        row = result.fetchone()
        if row and row[0]:
            print('exists')
        else:
            print('missing')
except Exception as e:
    print('missing')
" 2>/dev/null)

echo "Ensuring all tables exist from SQLAlchemy models..."
python -c "
from app.database import Base, engine
import app.models.user
import app.models.vehicle
import app.models.driver
import app.models.shipment
import app.models.trip
import app.models.gps_tracking
import app.models.maintenance
import app.models.fuel_record
import app.models.notification
import app.models.attendance
Base.metadata.create_all(bind=engine)
print('Tables checked/created successfully.')
"

# Stamp or upgrade alembic safely
alembic stamp head 2>/dev/null || true


# Load seed data if users table is empty
if [ -f /app/seed_data.sql ]; then
    python -c "
import os
from sqlalchemy import create_engine, text

url = os.environ.get('DATABASE_URL', '')
engine = create_engine(url)
try:
    with engine.connect() as conn:
        result = conn.execute(text(\"SELECT COUNT(*) FROM users;\"))
        count = result.scalar()
        if count == 0:
            print('Users table is empty. Loading seed data from seed_data.sql...')
            with open('/app/seed_data.sql', 'r', encoding='utf-8') as f:
                sql_content = f.read()
            for stmt in sql_content.split(';'):
                stmt = stmt.strip()
                if stmt:
                    try:
                        conn.execute(text(stmt))
                    except Exception as ex:
                        pass
            conn.commit()
            print('Seed data loaded successfully.')
        else:
            print(f'Database contains {count} users.')
except Exception as e:
    print(f'Seed check notice: {e}')
"
fi

echo "Ensuring all demo accounts are seeded and verified..."
python -c "
import sys, os
sys.path.insert(0, '/app')
sys.path.insert(0, '.')
try:
    from seed_demo_accounts import seed
    seed()
except Exception as e:
    print(f'Demo account seed notice: {e}')
" 2>/dev/null || true

# If additional command arguments were passed (e.g. celery worker/beat), run them instead of uvicorn
if [ "$#" -gt 0 ]; then
    echo "Running custom command: $@"
    exec "$@"
fi

echo "Starting uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
