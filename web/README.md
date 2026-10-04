# AI Assurance web client

> In-depth documentation: [docs/](docs/README.md): architecture, setup, screens, design system, contributing, testing and ADRs. Project overview: [../README.md](../README.md).

Front end for the **AI Evaluation and Red Teaming Framework** (v1.0): one application to register AI applications, run evaluation and red team scans, track findings to closure, gate releases and produce evidence for audit.

```bash
# 1. API (see ../backend/README.md)
cd ../backend && .venv/bin/uvicorn app.main:app --reload    # http://localhost:8000

# 2. Web client
npm install
npm run dev      # http://localhost:5173; /api is proxied to :8000
npm run build    # type-check + production build to dist/
```

All data and rules live in the Python API. The client loads a role-filtered snapshot from `GET /api/state`, sends each action to its REST endpoint, and polls while scans are running. To point at another API host, set `API_URL` (dev proxy) or `VITE_API_URL` (direct calls). Use the role switcher in the top bar to preview each role's access (framework §10.5). The role is sent in the `X-Role` header.

## Screens (framework §10.4)

| Route | Screen |
|---|---|
| `/` | Portfolio dashboard: program measures (§12.3), assurance status per application, ASR trend, findings by severity |
| `/applications`, `/applications/:id` | Registry, and application overview with the release gate, criteria, ASR by category, lifecycle and sign-off, threat model, configuration (Appendix A) |
| `/runs` | Run history |
| `/scans`, `/scans/:id` | Red team scans: category × strategy heat map, scenario attacks, breach detail, complexity, comparison with the previous scan |
| `/findings` | Findings board (drag and drop through the §8.2 lifecycle) |
| `/library` | Test library and regression tests |
| `/manual`, `/manual/:id` | Manual testing workspace with authorization records and attempt logging |
| `/evidence/:id` | Printable / exportable release evidence pack |
| `/admin` | Gate thresholds by tier (§9), risk tiers and severity, roles, cadence |

## Code layout

- `src/api/client.ts`: fetch wrapper. Errors come back as `ApiError` with the server's message.
- `src/store/store.tsx`: loads the snapshot and exposes `api.*` actions. Server errors appear as toasts.
- `src/domain/framework.ts`: labels and reference data for the UI. It also mirrors permissions so buttons can be disabled up front; the server still enforces every rule.
- `src/domain/types.ts`: response shapes. They follow the data model in §10.3, and each application carries its server-computed `gate`.
