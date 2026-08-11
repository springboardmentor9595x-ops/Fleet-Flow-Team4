import json
import urllib.request
import urllib.error
from urllib.parse import urljoin

BASE = 'http://127.0.0.1:8000'
paths = ['/docs', '/openapi.json', '/trips/', '/trips']
for path in paths:
    url = urljoin(BASE, path)
    try:
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=5) as resp:
            print(path, resp.status, resp.reason)
    except urllib.error.HTTPError as e:
        print(path, e.code, e.reason, e.read().decode('utf-8'))
    except Exception as e:
        print(path, 'ERROR', repr(e))

print('--- POST /trips/ (no auth)')
url = urljoin(BASE, '/trips/')
data = json.dumps({
    'vehicle_id': 'f94f9825-9d16-42e0-bd7e-200c815a16d0',
    'driver_id': '74bc18b2-050a-4328-93e9-b781142718b2',
    'shipment_id': 'a97bc1a0-f990-4580-aab6-b85698d6a4c0',
    'start_lat': 17.3850,
    'start_lng': 78.4867,
    'end_lat': 16.5062,
    'end_lng': 80.6480,
}).encode('utf-8')
req = urllib.request.Request(url, data=data, method='POST', headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req, timeout=5) as resp:
        print('POST /trips/', resp.status, resp.reason, resp.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('POST /trips/', e.code, e.reason, e.read().decode('utf-8'))
except Exception as e:
    print('POST /trips/', 'ERROR', repr(e))
