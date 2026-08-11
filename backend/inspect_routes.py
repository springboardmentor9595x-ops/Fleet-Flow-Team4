import os
from fastapi.routing import APIRoute

os.chdir(r'c:\Users\S R\OneDrive\Desktop\fleet_logistic\backend')
from app.main import app

for route in app.routes:
    if isinstance(route, APIRoute):
        print(route.path, route.methods, route.name)
    else:
        print(type(route).__name__, getattr(route, 'path', None), getattr(route, 'methods', None))
