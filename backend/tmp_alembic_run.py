from alembic.config import Config
from alembic import command

cfg = Config('alembic.ini')
print('Config file:', cfg.config_file_name)
print('SQLAlchemy URL:', cfg.get_main_option('sqlalchemy.url'))
print('SCRIPT LOCATION:', cfg.get_main_option('script_location'))
try:
    command.current(cfg, verbose=True)
except Exception as e:
    print('CURRENT ERROR:', type(e).__name__, e)
try:
    command.upgrade(cfg, 'head')
    print('UPGRADE completed')
except Exception as e:
    print('UPGRADE ERROR:', type(e).__name__, e)
    raise

import os
from urllib.parse import urlparse
import psycopg2
from dotenv import load_dotenv
load_dotenv('.env')
url=os.getenv('DATABASE_URL')
parsed=urlparse(url)
conn=psycopg2.connect(dbname=parsed.path[1:], user=parsed.username, password=parsed.password, host=parsed.hostname, port=parsed.port)
cur=conn.cursor()
cur.execute('SELECT version_num FROM alembic_version')
print('DB alembic_version:', cur.fetchall())
cur.execute("SELECT table_name, column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema='public' AND column_name='user_id' ORDER BY table_name")
print('DB columns:', cur.fetchall())
conn.close()
