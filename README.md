# NetPnL

Verified P&L and peer-to-peer tipping for Indian retail traders.

Traders publish their daily profit and loss — either typed in by hand, or pulled
straight from a linked Upstox, Zerodha, or Angel One account and marked **verified**. Everyone else can
see the live counter for the day, browse the *Hall of Pain* (the day's worst
performers), and send a voluntary tip directly to a trader's UPI ID.

> **Not a SEBI registered platform. All transfers are voluntary peer-to-peer
> gifts.** NetPnL never holds, routes, or custodies money. Tipping is nothing
> more than a `upi://` intent opened in the supporter's own UPI app.

---

## Stack

| Layer | Choice |
| --- | --- |
| API | FastAPI, SQLAlchemy 2.0 (async), Pydantic v2, Alembic |
| Database | PostgreSQL 16 (SQLite for local development) |
| Web | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| Motion / 3D | `motion`, `three` + `@react-three/fiber` |
| Infra | Docker, Docker Compose |

```
.
├── backend/          FastAPI service, models, migrations, tests
├── frontend/         Next.js application
└── infra/            docker-compose.yml and environment templates
```

---

## Quick start (local, no Docker)

### 1. Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env            # Windows
# cp .env.example .env             # macOS / Linux
```

The default `.env` uses SQLite and mock providers, so the whole product works
with no external accounts:

```bash
uvicorn app.main:app --reload --port 8000
```

API docs: <http://localhost:8000/docs>

### 2. Frontend

```bash
cd frontend
npm install
copy .env.example .env.local       # Windows
npm run dev
```

Web app: <http://localhost:3000>

`NEXT_PUBLIC_API_URL` must point at the API. It is **compiled into the browser
bundle**, so change it and rebuild (`npm run build`) for production builds.

---

## Quick start (Docker)

```bash
cd infra
copy .env.example .env             # set SECRET_KEY to a long random string
docker compose up --build
```

That starts PostgreSQL, runs the Alembic migrations, then brings up the API on
`:8000` and the web app on `:3000`.

---

## Configuration

### Backend (`backend/.env`)

| Variable | Default | Notes |
| --- | --- | --- |
| `ENVIRONMENT` | `local` | `local` \| `staging` \| `production` |
| `DATABASE_URL` | `sqlite+aiosqlite:///./netpnl.db` | Use `postgresql+asyncpg://…` in production |
| `AUTO_CREATE_TABLES` | `true` | Keep `false` in production and use Alembic |
| `SECRET_KEY` | dev placeholder | **Required** in production — signs JWTs |
| `CORS_ORIGINS` | `http://localhost:3000,…` | Comma-separated list |
| `PUBLIC_SITE_URL` | `http://localhost:3000` | Used to build the broker callback URL |
| `UPSTOX_CLIENT_ID` / `_SECRET` | empty | Live Upstox app credentials (required to link Upstox) |
| `ZERODHA_API_KEY` / `ZERODHA_API_SECRET` | empty | Live Kite Connect credentials (required to link Zerodha) |
| `ZERODHA_REDIRECT_URI` | `http://localhost:3000/settings/brokers/callback` | Must match the redirect URL registered on the Kite Connect app |
| `ANGEL_ONE_API_KEY` | empty | SmartAPI application key |
| `ANGEL_ONE_REDIRECT_URI` | required | Public HTTPS backend Publisher Login callback; register this exact URL in SmartAPI |
| `ANGEL_ONE_CLIENT_LOCAL_IP` / `ANGEL_ONE_CLIENT_PUBLIC_IP` | empty | Backend host IPs required by SmartAPI request headers |
| `ANGEL_ONE_MAC_ADDRESS` | empty | Backend host MAC address required by SmartAPI request headers |
| `UPI_PROVIDER` | `mock` | `mock` \| `cashfree` \| `razorpay` |
| `SYNC_ENABLED` | `true` | Background sweep that refreshes verified P&L |

### Frontend (`frontend/.env.local`)

| Variable | Default | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` | Base URL of the API, baked in at build time |

---

## Integrations

### Upstox (verified P&L)

The OAuth dance starts at `GET /api/v1/brokers/upstox/authorize` and returns to
`/settings/brokers/callback`. Broker tokens are stored server-side and never
reach the browser. Once a broker is linked, manual entries are rejected — the
figure always comes from the broker — and `POST /api/v1/pnl/sync?broker=upstox`
pulls today's realised P&L. Real Upstox app credentials are required; there is
no mock mode.

### Zerodha (verified P&L)

Zerodha uses Kite Connect. Create an app at <https://developers.kite.trade>,
register `ZERODHA_REDIRECT_URI` exactly, and set `ZERODHA_API_KEY` /
`ZERODHA_API_SECRET`. The flow starts at
`GET /api/v1/brokers/zerodha/authorize` and returns to the same callback page.
We read `realised` (not `unrealised`) from the day's net positions and count
fills from the trade book. Kite sessions expire at 6 AM IST, so traders
reconnect each morning. Per-trade historical P&L is not available from Kite,
so only today's figure can be published.

### Angel One (verified P&L)

Angel One uses SmartAPI Publisher Login. Set `ANGEL_ONE_REDIRECT_URI` to a
publicly reachable HTTPS backend URL, for example
`https://api.example.com/api/v1/brokers/angel_one/callback`, and register the
exact same URL in the SmartAPI app. Localhost URLs are not accepted by Angel One;
for development, expose port 8010 through an HTTPS tunnel and register that
tunnel URL. Also configure the API key and backend network identity settings.
Users authenticate on Angel One's hosted login page; NetPnL does not collect
their PIN or TOTP. The callback token is consumed and stored server-side. NetPnL
reads realized P&L from positions and trade count from the current-day trade
book. SmartAPI sessions expire daily, so users may need to reconnect. Only
today's P&L is published.

### UPI (penny drop)

`POST /api/v1/upi/verify` drops ₹1 and reads back the account holder's name.
Tipping only unlocks when that name matches the Upstox legal name (fuzzy
comparison, ≥ 0.75 token similarity), so nobody can receive money under a
mismatched identity. The ₹1 is returned by the provider; the platform never
holds funds.

Supported providers: `mock`, `cashfree`, `razorpay`.

---

## API

Base path `/api/v1`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/register` | Create an account, returns a token pair |
| `POST` | `/auth/login` | Sign in |
| `POST` | `/auth/refresh` | Exchange a refresh token (sent in the body) |
| `GET` | `/auth/me` | Current user |
| `GET` | `/brokers/{broker}/authorize` | Start a broker login flow (`upstox` \| `zerodha` \| `angel_one`) |
| `POST` | `/brokers/{broker}/callback` | Finish the OAuth dance |
| `GET` | `/brokers/` | Linked brokers |
| `DELETE` | `/brokers/{link_id}` | Unlink a broker |
| `POST` | `/pnl/` | Publish today's P&L (manual, unverified) |
| `POST` | `/pnl/sync?broker=…` | Pull verified P&L from a linked broker |
| `GET` | `/pnl/mine` | Own history |
| `GET` | `/pnl/feed` | The public Hall of Pain feed |
| `DELETE` | `/pnl/{record_id}` | Delete an unverified record |
| `POST` | `/upi/verify` | Run the ₹1 penny drop |
| `GET` | `/upi/status` | Verification status |
| `GET` | `/upi/intent` | Tip intent for the signed-in trader |
| `GET` | `/leaderboard/` | Leaderboard for a day |
| `GET` | `/leaderboard/sentiment` | Aggregate day stats |
| `GET` | `/users/{username}` | Public profile with stats and timeline |
| `GET` | `/users/{username}/qr` | Public UPI details |
| `GET` | `/users/{username}/intent` | Tip intent for a public trader |
| `GET` | `/health` | Liveness plus database status |

---

## Database migrations

```bash
cd backend
alembic upgrade head        # apply
alembic revision --autogenerate -m "describe the change"
alembic check               # detect model/migration drift
alembic downgrade -1        # roll back one revision
```

The URL always comes from `DATABASE_URL` in the environment, so migrations and
the running app can never point at different databases.

---

## Tests

```bash
cd backend
.\.venv\Scripts\python.exe tests\smoke_test.py      # offline, 58 assertions
.\.venv\Scripts\python.exe tests\contract_test.py    # against a live server
```

`smoke_test.py` runs entirely in-process against a temporary database.
`contract_test.py` talks to a running server and checks that every response
matches the shapes the frontend expects — run it with the API up:

```bash
.\.venv\Scripts\python.exe tests\contract_test.py http://127.0.0.1:8000
```

Frontend checks:

```bash
cd frontend
npx tsc --noEmit      # typecheck
npm run lint          # eslint
npm run build         # production build
```

---

## Deployment notes

- Set `AUTO_CREATE_TABLES=false` and run `alembic upgrade head` as a release step.
- `SECRET_KEY` must be a long random value; rotating it invalidates all sessions.
- Put the API behind TLS and terminate it at a load balancer or API gateway.
- The Upstox and Zerodha redirect URIs must exactly match `UPSTOX_REDIRECT_URI`
  and `ZERODHA_REDIRECT_URI` respectively.
- `NEXT_PUBLIC_API_URL` is baked in at build time — rebuild the frontend image
  whenever the public API address changes.
