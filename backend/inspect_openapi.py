import os
os.chdir(r'c:\Users\S R\OneDrive\Desktop\fleet_logistic\backend')
from app.main import app
schema = app.openapi()
print(sorted(schema['paths'].keys()))
for path, ops in schema['paths'].items():
    if path.startswith('/trips'):
        print(path, list(ops.keys()))
