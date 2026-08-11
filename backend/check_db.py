import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env")

conn = psycopg2.connect(os.getenv("DATABASE_URL"))
cur = conn.cursor()

print("ENUM TYPES:")
cur.execute("""
SELECT typname 
FROM pg_type 
WHERE typname IN ('roleenum','vehicle_status_enum');
""")

for row in cur.fetchall():
    print(row)


print("\nTABLES:")
cur.execute("""
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema='public';
""")

for row in cur.fetchall():
    print(row)

cur.close()
conn.close()