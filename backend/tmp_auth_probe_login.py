import urllib.request, urllib.parse, urllib.error

payload = urllib.parse.urlencode({'username':'test@example.com','password':'pass'}).encode()
req = urllib.request.Request('http://localhost:8000/auth/login', data=payload, method='POST', headers={'Content-Type':'application/x-www-form-urlencoded'})

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
