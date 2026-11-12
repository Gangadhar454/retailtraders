import urllib.request
import urllib.error
import json

BASE = 'http://127.0.0.1:8000/api/v1'

# 1. Admin login
login_req = urllib.request.Request(
    f'{BASE}/admin/login',
    data=json.dumps({'username': 'admin', 'password': 'admin123'}).encode(),
    headers={'Content-Type': 'application/json'}
)
res = json.loads(urllib.request.urlopen(login_req).read())
admin_token = res['access_token']
print('Admin login OK')

# 2. Test real postings endpoint
req = urllib.request.Request(
    f'{BASE}/admin/real-postings',
    headers={'Authorization': f'Bearer {admin_token}'}
)
postings = json.loads(urllib.request.urlopen(req).read())
print(f'Initial real postings count today: {len(postings)}')

# 3. Create or login a test user
test_user = {'email': 'test_admin_delete@example.com', 'password': 'Password123!', 'display_name': 'Suspicious Trader'}
try:
    reg_req = urllib.request.Request(
        f'{BASE}/auth/register',
        data=json.dumps(test_user).encode(),
        headers={'Content-Type': 'application/json'}
    )
    user_res = json.loads(urllib.request.urlopen(reg_req).read())
    user_token = user_res['access_token']
    print('User registered')
except Exception:
    login_user_req = urllib.request.Request(
        f'{BASE}/auth/login',
        data=json.dumps({'email': test_user['email'], 'password': test_user['password']}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    user_res = json.loads(urllib.request.urlopen(login_user_req).read())
    user_token = user_res['access_token']
    print('User logged in')

# 4. Try posting +10,000,000 (exceeds +/- 99,99,999 limit)
try:
    pnl_exceed_req = urllib.request.Request(
        f'{BASE}/pnl/',
        data=json.dumps({'net_pnl': 10000000.0, 'notes': 'Over limit'}).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {user_token}'}
    )
    urllib.request.urlopen(pnl_exceed_req)
    print('ERROR: Allowed +10,000,000!')
except urllib.error.HTTPError as e:
    print(f'SUCCESS: Rejected +10,000,000 with HTTP {e.code}: {e.read().decode()[:120]}')

# 5. Try posting -10,000,000 (exceeds limit)
try:
    pnl_exceed_req2 = urllib.request.Request(
        f'{BASE}/pnl/',
        data=json.dumps({'net_pnl': -10000000.0, 'notes': 'Over limit loss'}).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {user_token}'}
    )
    urllib.request.urlopen(pnl_exceed_req2)
    print('ERROR: Allowed -10,000,000!')
except urllib.error.HTTPError as e:
    print(f'SUCCESS: Rejected -10,000,000 with HTTP {e.code}: {e.read().decode()[:120]}')

# 6. Post valid manual P&L at max bound: +99,99,999 (9,999,999)
valid_pnl_req = urllib.request.Request(
    f'{BASE}/pnl/',
    data=json.dumps({'net_pnl': 9999999.0, 'notes': 'Max bound test'}).encode(),
    headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {user_token}'}
)
posted = json.loads(urllib.request.urlopen(valid_pnl_req).read())
record_id = posted['record_id']
user_id = posted['user_id']
print(f'SUCCESS: Posted max bound +99,99,999: record_id={record_id}')

# 7. Check admin real postings list
req2 = urllib.request.Request(
    f'{BASE}/admin/real-postings',
    headers={'Authorization': f'Bearer {admin_token}'}
)
postings2 = json.loads(urllib.request.urlopen(req2).read())
match = [p for p in postings2 if p['record_id'] == record_id]
print(f'Admin found posting: {len(match) == 1}, net_pnl={match[0]["net_pnl"] if match else None}')

# 8. Check admin real users list
req_users = urllib.request.Request(
    f'{BASE}/admin/real-users',
    headers={'Authorization': f'Bearer {admin_token}'}
)
users = json.loads(urllib.request.urlopen(req_users).read())
user_match = [u for u in users if u['user_id'] == user_id]
print(f'Admin found real user: {len(user_match) == 1}, blocked={user_match[0]["is_manual_blocked"] if user_match else None}')

# 9. Admin blocks user from manual entries
block_req = urllib.request.Request(
    f'{BASE}/admin/users/{user_id}/block-manual',
    data=json.dumps({'blocked': True}).encode(),
    headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {admin_token}'}
)
block_res = json.loads(urllib.request.urlopen(block_req).read())
print(f'SUCCESS: Admin blocked user: {block_res["is_manual_blocked"]}')

# 10. Blocked user attempts to post manual entry -> Must fail with 403
try:
    blocked_post_req = urllib.request.Request(
        f'{BASE}/pnl/',
        data=json.dumps({'net_pnl': 1200.0, 'notes': 'Attempt while blocked'}).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {user_token}'}
    )
    urllib.request.urlopen(blocked_post_req)
    print('ERROR: Allowed manual posting while blocked!')
except urllib.error.HTTPError as e:
    print(f'SUCCESS: Blocked manual entry rejected with HTTP {e.code}: {e.read().decode()[:120]}')

# 11. Admin unblocks user
unblock_req = urllib.request.Request(
    f'{BASE}/admin/users/{user_id}/block-manual',
    data=json.dumps({'blocked': False}).encode(),
    headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {admin_token}'}
)
unblock_res = json.loads(urllib.request.urlopen(unblock_req).read())
print(f'SUCCESS: Admin unblocked user: is_manual_blocked={unblock_res["is_manual_blocked"]}')

# 12. Admin deletes suspicious posting
del_req = urllib.request.Request(
    f'{BASE}/admin/postings/{record_id}',
    headers={'Authorization': f'Bearer {admin_token}'},
    method='DELETE'
)
del_res = json.loads(urllib.request.urlopen(del_req).read())
print(f'SUCCESS: Deleted posting {record_id}, result: {del_res["success"]}')

# 13. Verify posting is gone from admin real postings
req3 = urllib.request.Request(
    f'{BASE}/admin/real-postings',
    headers={'Authorization': f'Bearer {admin_token}'}
)
postings3 = json.loads(urllib.request.urlopen(req3).read())
match_after = [p for p in postings3 if p['record_id'] == record_id]
print(f'Posting successfully gone: {len(match_after) == 0}')
