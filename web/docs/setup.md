# Setup guide

## Prerequisites

- Node.js 20 or later, npm 10 or later (`node -v`, `npm -v`)
- The API running (see `../../backend/docs/setup.md`), by default on http://localhost:8000

## Run in development

```bash
cd web
npm install
npm run dev            # http://localhost:5173
```

The dev server proxies every `/api` request to the API, so the browser sees one origin and needs no CORS settings. Changes reload instantly.

If the API is not running, the app shows *Cannot reach the AI Assurance API* with the command to start it, and a Retry button.

## Point at another API

| Variable | Where it applies | Effect |
|---|---|---|
| `API_URL` | `npm run dev`, `npm run preview` | Proxy target for `/api` (default `http://localhost:8000`). Example: `API_URL=https://assurance-api.internal npm run dev` |
| `VITE_API_URL` | build time | The browser calls this base URL directly instead of the same origin. The API must then allow the site's origin in `ASSURANCE_CORS_ORIGINS`. |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve `dist/` on http://localhost:4173, with the same `/api` proxy |
| `npm run lint` | Lint with oxlint |

## Build and deploy

```bash
npm run build          # outputs dist/ (about 430 KB of JavaScript, 126 KB gzipped)
```

`dist/` is static files. Host them on any static host (Azure Static Web Apps, a storage account with a CDN, nginx). Because routing uses the URL hash, no rewrite rules are needed.

Make `/api` reach the API in one of two ways:

- **Same origin (recommended)**: serve the site and the API behind one gateway, with `/api/*` routed to the API. No CORS.
- **Different origins**: build with `VITE_API_URL=https://<api-host>` and add the site's origin to the API's `ASSURANCE_CORS_ORIGINS`.

In production, put sign-in (Entra ID) in front of both. The role switcher in the top bar is for development; with Entra ID the role comes from the signed-in user (see `../../backend/docs/operations.md`).

## Fonts

Inter and JetBrains Mono load from Google Fonts. Without internet access the app falls back to system fonts and still works. To self-host, download the font files into `public/` and replace the `@import` at the top of `src/index.css` with `@font-face` rules.

## Troubleshooting

| Symptom | Fix |
|---|---|
| *Cannot reach the AI Assurance API* | Start the API; check `curl localhost:8000/api/health`; check `API_URL`. |
| Every action shows a red toast about permissions | You are previewing a role that cannot do it. Switch role in the top bar. |
| Progress bar stuck | The API was restarted while the run was in progress; in-progress runs do not survive restarts. Start a new one. |
| Old data after the backend was reset | Reload the page (or change role) to refetch the snapshot. |
| TypeScript errors after an API change | Update `src/domain/types.ts` to match the new response. |
