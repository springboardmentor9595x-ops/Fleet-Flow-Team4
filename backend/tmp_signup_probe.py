import urllib.request, urllib.error, json

req = urllib.request.Request(
    'http://localhost:8000/auth/signup',
    data=json.dumps({'email':'test2@example.com','password':'Abc123!','full_name':'Test User','phone':'123','role':'Driver'}).encode(),
    headers={'Content-Type':'application/json'}
)

try:
    with urllib.request.urlopen(req, timeout=10) as response:
        print('status', response.status)
        print(response.read().decode())
except urllib.error.HTTPError as e:
    print('status', e.code)
    print(e.read().decode())
except Exception as e:
    import traceback
    traceback.print_exc()
