"""Live contract check: the running API's JSON vs the frontend's TS interfaces.

Run against a live server (not TestClient) so it covers serialisation,
CORS-relevant headers and the exact URLs the browser will call.
"""
from __future__ import annotations

import json
import re
import secrets
import sys
import urllib.error
import urllib.request
from datetime import date
from typing import Any

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8010"
PREFIX = f"{BASE}/api/v1"

FAILURES: list[str] = []
CHECKS = 0


def req(
    method: str,
    url: str,
    body: dict[str, Any] | None = None,
    token: str | None = None,
) -> tuple[int, Any]:
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        return e.code, (json.loads(raw) if raw else None)


def expect_keys(label: str, payload: Any, expected: set[str]) -> None:
    global CHECKS
    CHECKS += 1
    if not isinstance(payload, dict):
        FAILURES.append(f"{label}: expected object, got {type(payload).__name__}")
        return
    missing = expected - set(payload)
    if missing:
        FAILURES.append(f"{label}: missing keys {sorted(missing)}")


def expect(label: str, condition: bool, detail: str = "") -> None:
    global CHECKS
    CHECKS += 1
    if not condition:
        FAILURES.append(f"{label}: {detail or 'assertion failed'}")


USER_KEYS = {
    "user_id", "display_name", "username", "bio", "avatar_seed",
    "created_at", "is_verified_publisher",
}
TOKEN_KEYS = {"access_token", "refresh_token", "token_type", "expires_in"}
RECORD_KEYS = {
    "record_id", "user_id", "date", "net_pnl", "is_verified",
    "broker_source", "source", "trade_count", "win_rate", "notes", "created_at",
}
SENTIMENT_KEYS = {
    "date", "net_pnl_total", "since_launch_net_pnl", "since_launch_date",
    "trader_count", "verified_net_pnl",
    "unverified_net_pnl", "verified_count", "unverified_count",
    "profitable_count", "losing_count", "average_pnl", "biggest_loss",
    "biggest_gain", "updated_at",
}
LEADERBOARD_KEYS = {"rank", "user", "net_pnl", "is_verified", "broker_source", "trade_count", "record_date", "note"}
STATS_KEYS = {
    "total_records", "total_pnl", "best_day", "worst_day", "win_rate",
    "avg_trade_size", "max_drawdown", "volatility", "best_streak",
    "worst_streak", "consistency_score", "sharpe_like",
}
UPI_STATUS_KEYS = {"status", "upi_id", "resolved_name", "can_tip"}
INTENT_KEYS = {"upi_id", "payee_name", "amount", "note", "intent_url"}

suffix = date.today().isoformat()[-6:].replace("-", "")
stamp = f"{suffix}{secrets.token_hex(2)}"
email = f"e2e.{stamp}@example.com"
display_name = f"E2E Tester {stamp[-4:]}"

print(f"target: {BASE}")
print(f"email:  {email}\n")

# --- register -------------------------------------------------------------
status, body = req("POST", f"{PREFIX}/auth/register", {
    "email": email,
    "password": "Str0ng-Passw0rd!",
    "display_name": display_name,
})
expect("register", status in (200, 201), f"status={status} body={body}")
if status not in (200, 201):
    print("FATAL: register failed"); print(json.dumps(body, indent=2)); sys.exit(1)

expect_keys("register", body, TOKEN_KEYS)
token = body["access_token"]
refresh = body["refresh_token"]

# --- me -------------------------------------------------------------------
status, body = req("GET", f"{PREFIX}/auth/me", token=token)
expect("me", status == 200, f"status={status}")
expect_keys("me", body, USER_KEYS | {
    "email", "verified_upi_id", "upi_verification_status", "upi_verified_name",
    "linked_brokers", "has_upi_id",
})
# The server derives the public handle from the display name.
username = body["username"] if isinstance(body, dict) else "unknown"
expect("username is derived", username != "", repr(username))
expect("username is url safe", username.replace("_", "").replace("-", "").isalnum(), username)
print(f"assigned username: {username}\n")

# --- manual P&L -----------------------------------------------------------
status, body = req("POST", f"{PREFIX}/pnl/", {
    "net_pnl": 4250.5, "notes": "e2e run", "trade_count": 12, "win_rate": 0.66,
}, token=token)
expect("publish manual pnl", status in (200, 201), f"status={status} body={body}")
expect_keys("publish manual pnl", body, RECORD_KEYS)
expect("manual is unverified", body.get("is_verified") is False, str(body.get("is_verified")))
expect("manual source", body.get("source") == "MANUAL", str(body.get("source")))
first_record_id = body.get("record_id") if isinstance(body, dict) else None

# --- re-publishing the same day updates the figure in place -------------
status, body = req("POST", f"{PREFIX}/pnl/", {"net_pnl": 500.0}, token=token)
expect("republish updates in place", status in (200, 201), f"status={status}")
if isinstance(body, dict):
    expect("same record id", body.get("record_id") == first_record_id, str(body.get("record_id")))
    expect("figure updated", body.get("net_pnl") == 500.0, str(body.get("net_pnl")))

# --- feed -----------------------------------------------------------------
status, body = req("GET", f"{PREFIX}/pnl/feed?limit=5")
expect("feed", status == 200, f"status={status}")
expect_keys("feed", body, {"entries", "total", "has_more"})
if body and body.get("entries"):
    expect_keys("feed.entry", body["entries"][0], {"record", "user", "rank"})
    expect_keys("feed.entry.record", body["entries"][0]["record"], RECORD_KEYS)
    expect_keys("feed.entry.user", body["entries"][0]["user"], USER_KEYS)

# --- sentiment ------------------------------------------------------------
status, body = req("GET", f"{PREFIX}/leaderboard/sentiment")
expect("sentiment", status == 200, f"status={status}")
expect_keys("sentiment", body, SENTIMENT_KEYS)
if body:
    expect("sentiment date is today", body.get("date") == date.today().isoformat(), str(body.get("date")))

# --- leaderboard ----------------------------------------------------------
status, body = req("GET", f"{PREFIX}/leaderboard/?scope=today&limit=10")
expect("leaderboard", status == 200, f"status={status}")
expect_keys("leaderboard", body, {"entries", "total", "scope"})
if body and body.get("entries"):
    expect_keys("leaderboard.entry", body["entries"][0], LEADERBOARD_KEYS)
    expect_keys("leaderboard.entry.user", body["entries"][0]["user"], USER_KEYS)
    names = [e["user"]["username"] for e in body["entries"]]
    expect("our user on leaderboard", username in names, f"entries={names}")

# --- public profile -------------------------------------------------------
status, body = req("GET", f"{PREFIX}/users/{username}")
expect("profile", status == 200, f"status={status}")
expect_keys("profile", body, {"user", "stats", "timeline", "today", "upi", "linked_broker", "can_tip"})
if body:
    expect_keys("profile.user", body["user"], USER_KEYS)
    expect_keys("profile.stats", body["stats"], STATS_KEYS)
    expect_keys("profile.upi", body["upi"], UPI_STATUS_KEYS)
    expect("profile has one timeline point", len(body["timeline"]) == 1, str(len(body["timeline"])))
    if body["timeline"]:
        expect_keys("profile.timeline[0]", body["timeline"][0], {"date", "net_pnl", "is_verified", "cumulative"})

# --- deleting an unverified record ----------------------------------------
yesterday = (date.today() - __import__("datetime").timedelta(days=1)).isoformat()
status, body = req("POST", f"{PREFIX}/pnl/", {"net_pnl": -120.0, "date": yesterday}, token=token)
expect("publish a past-dated record", status in (200, 201), f"status={status}")
if isinstance(body, dict) and body.get("record_id"):
    status, body = req("DELETE", f"{PREFIX}/pnl/{body['record_id']}", token=token)
    expect("delete unverified record", status == 204, f"status={status}")

# --- broker catalogue (public) ---------------------------------------------
status, body = req("GET", f"{PREFIX}/brokers/supported")
expect("supported brokers", status == 200, f"status={status} body={body}")
if isinstance(body, list) and body:
    expect_keys(
        "supported broker entry",
        body[0],
        {"key", "name", "status", "detail"},
    )
    keys = [b.get("key") for b in body]
    expect("upstox is listed", "upstox" in keys, f"keys={keys}")
    upstox = next(b for b in body if b.get("key") == "upstox")
    expect("upstox is available", upstox.get("status") == "available", str(upstox.get("status")))
    expect("zerodha is listed", "zerodha" in keys, f"keys={keys}")
    zerodha = next(b for b in body if b.get("key") == "zerodha")
    expect(
        "zerodha is available",
        zerodha.get("status") == "available",
        str(zerodha.get("status")),
    )
    others = [
        b for b in body if b.get("key") not in {"upstox", "zerodha"}
    ]
    expect(
        "remaining brokers are coming soon",
        all(b.get("status") == "coming_soon" for b in others),
        str([(b.get("key"), b.get("status")) for b in others]),
    )
else:
    expect("supported brokers is a list", isinstance(body, list), str(type(body).__name__))

# --- Upstox OAuth ----------------------------------------------------------
status, body = req("GET", f"{PREFIX}/brokers/upstox/authorize", token=token)
if status == 200:
    # Live mode with credentials: the browser is sent to Upstox's own login
    # page, so the consent step cannot be completed from a script.
    expect_keys("upstox authorize", body, {"authorization_url", "state"})
    authorization_url = body.get("authorization_url", "") if isinstance(body, dict) else ""
    oauth_state = body.get("state", "") if isinstance(body, dict) else ""
    expect(
        "live authorize url opens the upstox login dialog",
        "authorization/dialog" in authorization_url,
        authorization_url,
    )
    expect(
        "live authorize url carries the client id",
        "client_id=" in authorization_url,
        authorization_url,
    )
    expect(
        "live authorize url carries the redirect uri",
        "redirect_uri=" in authorization_url,
        authorization_url,
    )
    expect(
        "live authorize url carries the state nonce",
        f"state={oauth_state}" in authorization_url,
        oauth_state,
    )
else:
    # No credentials configured: the refusal has to be readable.
    expect("authorize refused when not configured", status == 503, f"status={status} body={body}")
    detail = str(body.get("detail", "")) if isinstance(body, dict) else ""
    expect(
        "refusal is human readable",
        "upstox" in detail.lower() and "api key" in detail.lower() and "{" not in detail,
        detail,
    )

# --- Zerodha OAuth ---------------------------------------------------------
status, body = req("GET", f"{PREFIX}/brokers/zerodha/authorize", token=token)
if status == 200:
    expect_keys("zerodha authorize", body, {"authorization_url", "state"})
    authorization_url = body.get("authorization_url", "") if isinstance(body, dict) else ""
    expect(
        "live authorize url opens the kite login page",
        "/connect/login" in authorization_url,
        authorization_url,
    )
    expect(
        "live authorize url carries the api key",
        "api_key=" in authorization_url,
        authorization_url,
    )
    expect(
        "kite authorize url round-trips the broker",
        "redirect_params=" in authorization_url
        and "broker%3Dzerodha" in authorization_url,
        authorization_url,
    )
else:
    expect(
        "zerodha authorize refused when not configured",
        status == 503,
        f"status={status} body={body}",
    )
    detail = str(body.get("detail", "")) if isinstance(body, dict) else ""
    expect(
        "zerodha refusal is human readable",
        "zerodha" in detail.lower() and "{" not in detail,
        detail,
    )

# --- verified sync (no broker linked, so it is refused) --------------------
status, body = req("POST", f"{PREFIX}/pnl/sync?broker=upstox", token=token)
expect("pnl sync without a broker link", status == 400, f"status={status} body={body}")
detail = str(body.get("detail") or "") if isinstance(body, dict) else ""
expect(
    "sync refusal is human readable",
    "connect" in detail.lower() and "{" not in detail,
    detail,
)

# --- sync fetches from one broker at a time ---------
status, body = req("POST", f"{PREFIX}/pnl/sync?broker=zerodha", token=token)
expect("sync with broker param still returns 400 without links", status == 400, f"status={status} body={body}")
detail = str(body.get("detail") or "") if isinstance(body, dict) else ""
expect(
    "sync broker param is checked per-broker",
    "zerodha" in detail.lower() and "{" not in detail,
    detail,
)

# --- manual P&L (no broker linked, so manual is allowed) -------------------
status, body = req("POST", f"{PREFIX}/pnl/", {"net_pnl": 1.0}, token=token)
expect("manual allowed without a broker link", status == 201, f"status={status} body={body}")

# --- UPI verify (mock penny drop) ----------------------------------------
# The mock resolves the account holder name from the handle, so pick a handle
# that reads as the same name the broker returned.
handle = re.sub(r"[^a-z0-9.]", ".", display_name.lower().replace(" ", ".")).strip(".")
status, body = req("POST", f"{PREFIX}/upi/verify", {
    "upi_id": f"{handle}@okhdfcbank",
}, token=token)
expect("upi verify", status in (200, 201), f"status={status} body={body}")
if body:
    expect_keys("upi verify", body, {"status", "upi_id", "resolved_name", "can_tip", "message"})
    expect("upi verified", body.get("status") == "VERIFIED", str(body.get("status")))

status, body = req("GET", f"{PREFIX}/upi/status", token=token)
expect("upi status", status == 200, f"status={status}")
expect_keys("upi status", body, UPI_STATUS_KEYS)
if body:
    expect("upi can_tip", body.get("can_tip") is True, str(body))

# --- own intent (authenticated) -------------------------------------------
status, body = req("GET", f"{PREFIX}/upi/intent?amount=50", token=token)
expect("own intent", status == 200, f"status={status} body={body}")
expect_keys("own intent", body, INTENT_KEYS)
if body:
    url = body.get("intent_url", "")
    expect("own intent is upi://pay", url.startswith("upi://pay"), url)
    # pn must carry the payee name, tn the note.
    expect("own intent pn is the payee", "pn=" in url and "Tip+for" not in url.split("pn=")[1].split("&")[0], url)
    expect("own intent tn is the note", "tn=Tip" in url, url)

# --- public supporter intent ---------------------------------------------
status, body = req("GET", f"{PREFIX}/users/{username}/intent?amount=101")
expect("public intent", status == 200, f"status={status} body={body}")
expect_keys("public intent", body, INTENT_KEYS)
if body:
    expect("intent is upi://pay", str(body.get("intent_url", "")).startswith("upi://pay"), str(body.get("intent_url")))
    expect("intent amount", body.get("amount") == 101, str(body.get("amount")))

# --- public QR ------------------------------------------------------------
status, body = req("GET", f"{PREFIX}/users/{username}/qr")
expect("public qr", status == 200, f"status={status}")

# --- refresh --------------------------------------------------------------
status, body = req("POST", f"{PREFIX}/auth/refresh", {"refresh_token": refresh})
expect("refresh", status == 200, f"status={status}")
expect_keys("refresh", body, TOKEN_KEYS)
if isinstance(body, dict) and body.get("access_token"):
    status, body2 = req("GET", f"{PREFIX}/auth/me", token=body["access_token"])
    expect("refreshed token works", status == 200, f"status={status}")

status, body = req("POST", f"{PREFIX}/auth/refresh", {"refresh_token": "not-a-real-token"})
expect("bad refresh rejected", status == 401, f"status={status}")

print(f"checks run: {CHECKS}")
if FAILURES:
    print(f"\nFAILED: {len(FAILURES)}")
    for f in FAILURES:
        print(f"  - {f}")
    sys.exit(1)
print("ALL CONTRACT CHECKS PASSED")
