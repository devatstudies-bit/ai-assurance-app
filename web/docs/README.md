# AI Assurance web client: documentation

The web client is a single-page React application. It is the user interface for the AI Assurance API in `../backend`: it shows the portfolio, gates, scans, evaluations and findings, and sends every action to the API. It holds no business rules of its own.

| Document | Read it when you want to… |
|---|---|
| [Setup guide](setup.md) | Install, run, point at an API, build and deploy |
| [Architecture](architecture.md) | Understand how data flows from the API to the screens and back |
| [Screens](screens.md) | Know what each screen shows, what it lets you do, and which roles can do it |
| [Design system](design-system.md) | Use the colors, components, charts and patterns consistently |
| [Contributing](contributing.md) | Add a screen, an action or a field without breaking the patterns |
| [Testing](testing.md) | Check your change |
| [Architecture decision records](adr/README.md) | Understand why it is built this way |

## Stack

React 19, TypeScript 6, Vite 8, React Router 7 (hash routing), lucide-react icons, and hand-written CSS with design tokens. There is no UI component library and no chart library.

## Code map

```
web/
├── index.html
├── vite.config.ts            Dev and preview proxy: /api → API_URL (default http://localhost:8000)
└── src/
    ├── main.tsx              Entry point
    ├── App.tsx               Providers and routes
    ├── index.css             Design tokens (light and dark), all component styles
    ├── api/client.ts         fetch wrapper: base URL, X-Role header, ApiError
    ├── store/store.tsx       Loads the /api/state snapshot; api.* actions; polling
    ├── domain/
    │   ├── types.ts          Response shapes (mirror the API)
    │   ├── framework.ts      Labels and reference data; permission mirror for disabling buttons
    │   ├── gate.ts           Display helpers (attack success rate)
    │   └── util.ts           Dates, deadlines, formatting
    ├── components/
    │   ├── Layout.tsx        Sidebar, top bar, search, role switcher, theme toggle
    │   ├── ui.tsx            Card, Kpi, Badge, Modal, Drawer, Chips, Toast, Tooltip, …
    │   ├── charts.tsx        Attack success bars, heat map, trend line, count bars
    │   ├── NewScanModal.tsx  Start a red team scan
    │   └── ModelPicker.tsx   Judge and attack engine picker; Run evaluation dialog
    └── pages/                One file per screen (see screens.md)
```
