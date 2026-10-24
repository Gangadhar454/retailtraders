# NetPnL — frontend

The Next.js 16 application. See the [root README](../README.md) for the full
setup, configuration reference and API documentation.

## Quick start

```bash
npm install
copy .env.example .env.local   # Windows
npm run dev
```

`NEXT_PUBLIC_API_URL` points at the FastAPI service. Because `NEXT_PUBLIC_*`
values are compiled into the browser bundle, changing it requires a rebuild
(`npm run build`) for production builds.

## Checks

```bash
npx tsc --noEmit      # typecheck
npm run lint          # eslint
npm run build         # production build
```

## Structure

| Path | Contents |
| --- | --- |
| `src/app/` | Routes: dashboard, leaderboard, login, register, publish, settings, public profile |
| `src/components/` | UI, including the Three.js performance curve in `three/PerformanceOrb.tsx` |
| `src/lib/api.ts` | Typed fetch layer with automatic token refresh on 401 |
| `src/lib/types.ts` | Response shapes, kept in sync with the API by `backend/tests/contract_test.py` |
