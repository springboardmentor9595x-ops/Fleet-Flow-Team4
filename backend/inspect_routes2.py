import os
from fastapi.routing import APIRoute

os.chdir(r'c:\Users\S R\OneDrive\Desktop\fleet_logistic\backend')
from app.main import app

print('app.router.routes count', len(app.router.routes))
for route in app.router.routes:
    print(type(route).__name__, getattr(route, 'path', None), getattr(route, 'methods', None), getattr(route, 'name', None))

print('url path for create_trip?')
try:
    print(app.url_path_for('create_trip'))
except Exception as e:
    print(type(e).__name__, e)
