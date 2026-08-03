import os
from urllib.parse import urlparse

from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor

load_dotenv('.env')
url = os.getenv('DATABASE_URL')
print('DATABASE_URL', url)
parsed = urlparse(url)
conn = psycopg2.connect(dbname=parsed.path[1:], user=parsed.username, password=parsed.password, host=parsed.hostname, port=parsed.port)
cur = conn.cursor(cursor_factory=RealDictCursor)
queries = [
    "SELECT version_num FROM alembic_version;",
    "SELECT table_schema, table_name, column_name, data_type, udt_name FROM information_schema.columns WHERE column_name LIKE 'user_id%' ORDER BY table_schema, table_name, column_name;",
    "SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod) AS type_name FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid WHERE c.relname IN ('users','drivers','notifications','attendance') AND a.attnum > 0 AND NOT a.attisdropped ORDER BY c.relname, a.attnum;",
    "SELECT c.oid::regclass::text AS table_name, a.attname, t.typname FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid JOIN pg_type t ON a.atttypid = t.oid WHERE c.relname IN ('users','drivers','notifications','attendance') AND a.attnum > 0 AND NOT a.attisdropped ORDER BY c.relname, a.attnum;",
    "SELECT conname, conrelid::regclass::text AS table_name, contype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname LIKE '%user_id%' ORDER BY conname;"
]
for q in queries:
    print('\nQUERY:', q)
    cur.execute(q)
    rows = cur.fetchall()
    for r in rows:
        print(r)
cur.close()
conn.close()
