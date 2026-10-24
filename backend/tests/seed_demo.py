"""Populate the local dev database with demo traders so the UI can be reviewed.

Run:  .\.venv\Scripts\python.exe tests\seed_demo.py [base_url]

Uses only the public API, so it exercises the same paths the app does:
  * manual P&L publishes for the self-reported traders
  * the mock Upstox OAuth flow for the verified traders
  * a mock UPI penny-drop so the tip panel is reachable
"""

import json
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8010").rstrip("/")
API = f"{BASE}/api/v1"
PASSWORD = "DemoPass123"

TRADERS = [
    {
        "email": "arjun.demo@example.com",
        "display_name": "Arjun Mehta",
        "pnl": 48250,
        "trades": 34,
        "notes": "Held a few momentum names into the close.",
        "verified": True,
    },
    {
        "email": "vikram.demo@example.com",
        "display_name": "Vikram Rao",
        "pnl": 92640,
        "trades": 47,
        "notes": "Scaled into the trend, trimmed the runner.",
        "verified": True,
    },
    {
        "email": "priya.demo@example.com",
        "display_name": "Priya Nair",
        "pnl": 18700,
        "trades": 21,
        "notes": "Small gains, kept position sizes tight.",
        "verified": False,
    },
    {
        "email": "karan.demo@example.com",
        "display_name": "Karan Shah",
        "pnl": 4250,
        "trades": 9,
        "notes": "Chased a breakout that paid for itself.",
        "verified": False,
    },
    {
        "email": "rohit.demo@example.com",
        "display_name": "Rohit Desai",
        "pnl": -62400,
        "trades": 58,
        "notes": "Got caught on a gap down. Should have cut earlier.",
        "verified": False,
    },
    {
        "email": "sneha.demo@example.com",
        "display_name": "Sneha Iyer",
        "pnl": -14350,
        "trades": 12,
        "notes": "Blew a scratch trade into a full loss.",
        "verified": False,
    },
]


def call(method, path, body=None, token=None):
    url = f"{API}{path}"
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        return {"__error__": exc.code, "__detail__": exc.read().decode()[:160]}


def failed(payload):
    return payload is None or "__error__" in payload


def authenticate(trader):
    """Register, falling back to login when the account already exists."""
    reg = call(
        "POST",
        "/auth/register",
        {
            "email": trader["email"],
            "password": PASSWORD,
            "display_name": trader["display_name"],
        },
    )
    if not failed(reg):
        return reg["access_token"]

    login = call(
        "POST",
        "/auth/login",
        {"email": trader["email"], "password": PASSWORD},
    )
    if failed(login):
        raise RuntimeError(f"cannot authenticate {trader['email']}: {login}")
    return login["access_token"]


def link_mock_broker(token):
    auth = call("GET", "/brokers/upstox/authorize", token=token)
    if failed(auth):
        return False
    linked = call(
        "POST",
        "/brokers/upstox/callback",
        {"code": "mock-seed-code", "state": auth["state"]},
        token=token,
    )
    return not failed(linked)


def main():
    seeded = 0
    for trader in TRADERS:
        token = authenticate(trader)
        me = call("GET", "/auth/me", token=token)
        username = me.get("username", "?") if me and not failed(me) else "?"
        notes = []

        if trader["verified"]:
            if link_mock_broker(token):
                sync = call("POST", "/pnl/sync", {}, token=token)
                if failed(sync) or not sync.get("record"):
                    notes.append("sync failed")
                else:
                    notes.append(
                        f"verified {sync['record']['net_pnl']:,.2f} via upstox"
                    )
                upi = call(
                    "POST",
                    "/upi/verify",
                    {"upi_id": "mock.trader@upi"},
                    token=token,
                )
                notes.append("upi ok" if not failed(upi) else "upi failed")
        else:
            published = call(
                "POST",
                "/pnl/",
                {
                    "net_pnl": trader["pnl"],
                    "notes": trader["notes"],
                    "trade_count": trader["trades"],
                },
                token=token,
            )
            if failed(published):
                notes.append(f"publish failed {published.get('__detail__')}")
            else:
                notes.append(f"self-reported {trader['pnl']:,.0f}")

        seeded += 1
        print(f"  {trader['display_name']:<16} @{username:<22} {'; '.join(notes)}")

    print(f"\nseeded {seeded} demo traders")
    print("dashboard:   http://127.0.0.1:3000/")
    print("leaderboard: http://127.0.0.1:3000/leaderboard")
    print(f"login:       {PASSWORD} for any {TRADERS[0]['email']}")


if __name__ == "__main__":
    main()
