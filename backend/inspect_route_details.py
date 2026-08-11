import os
import pprint
from fastapi.routing import APIRoute

os.chdir(r'c:\Users\S R\OneDrive\Desktop\fleet_logistic\backend')
from app.main import app

print('ROUTE_COUNT', len(app.routes))
for idx, route in enumerate(app.routes):
    print('---', idx, type(route).__name__, route.__class__.__module__)
    if hasattr(route, 'path'):
        print('path', route.path)
    if hasattr(route, 'methods'):
        print('methods', route.methods)
    if hasattr(route, 'name'):
        print('name', route.name)
    pprint.pp(route.__dict__)
