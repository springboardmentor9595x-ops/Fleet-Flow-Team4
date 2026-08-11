import os
from fastapi.testclient import TestClient

os.chdir(r'c:\Users\S R\OneDrive\Desktop\fleet_logistic\backend')
from app.main import app

client = TestClient(app)
for path in ['/trips/', '/trips']:
    response = client.post(path, json={
        'vehicle_id': 'f94f9825-9d16-42e0-bd7e-200c815a16d0',
        'driver_id': '74bc18b2-050a-4328-93e9-b781142718b2',
        'shipment_id': 'a97bc1a0-f990-4580-aab6-b85698d6a4c0',
        'start_lat': 17.3850,
        'start_lng': 78.4867,
        'end_lat': 16.5062,
        'end_lng': 80.6480,
    })
    print(path, response.status_code, response.headers.get('location'), response.text)
