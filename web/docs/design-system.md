# Design system

All styling is in `src/index.css`: design tokens as CSS variables, then component classes. Components in `src/components/ui.tsx` and `charts.tsx` use those classes. There is no UI library ([ADR 0002](adr/0002-css-tokens-no-ui-library.md)).

## Visual language

- **Dark navy sidebar, light content area**, indigo accent. Dark theme for the whole app.
- **Inter** for text, **JetBrains Mono** for IDs, numbers and code (tabular figures so columns of numbers align).
- **Cards** with a 12px radius, 1px border and a soft shadow. A colored left edge marks a card's state (KPIs, gate banner).
- **Status is never color alone**: every pass, fail or warning has an icon and a word as well.

## Tokens

Use tokens, never raw hex values, so both themes work. Dark values are redefined under `:root[data-theme='dark']`.

| Group | Tokens | Use |
|---|---|---|
| Surfaces | `--bg`, `--surface`, `--surface-2`, `--surface-3` | Page, cards, table headers and hovers, tracks and wells |
| Lines | `--border`, `--border-strong` | Card and table borders; inputs and buttons |
| Text | `--text`, `--text-2`, `--text-3` | Primary, secondary, muted |
| Accent | `--accent`, `--accent-hover`, `--accent-soft`, `--accent-text` | Primary buttons, links, selection, focus |
| Status | `--good`, `--warn`, `--serious`, `--bad`, each with `-soft` and `-text` | Pass, advisory, high severity, fail or critical |
| Sidebar | `--side-bg`, `--side-bg-2`, `--side-text`, `--side-text-hi`, `--side-border` | Navigation only |
| Heat map | `--heat-0` … `--heat-4`, `--heat-ink-0` … `--heat-ink-3` | Attack success rate cells (single-hue orange ramp) |
| Charts | `--chart-line`, `--grid` | Trend line and gridlines |
| Shape | `--radius`, `--shadow-sm`, `--shadow`, `--shadow-lg`, `--mono` | |

## Components

| Component | Class or export | Notes |
|---|---|---|
| Page header | `PageHead` | Breadcrumbs, title, subtitle, actions on the right |
| Card | `Card` (`.card`, `.card-head`, `.card-body`) | `title`, `icon`, `meta` on the right, `pad={false}` for full-bleed tables |
| KPI tile | `Kpi` (`.kpi`) | `tone="bad"` or `"good"` adds the colored edge and value color |
| Badge | `Badge` (`.badge`) | Tones: `good`, `warn`, `serious`, `bad`, `solid-bad`, `accent`, `outline` |
| Domain badges | `SeverityBadge`, `TierBadge`, `CritBadge`, `FindingStatusBadge`, `GateBadge` | Use these rather than choosing tones by hand |
| Button | `.btn` with `primary`, `danger`, `ghost`, `sm` | Icons are 16px lucide icons inside the button |
| Table | `.table`, `.num` (right-aligned monospace), `.compact`, `tr.click` | Wrap wide tables in `.table-wrap` |
| Callout | `.callout` with `info`, `warn`, `bad`, `good` | **Wrap the text in a `<span>`** next to the icon: the callout is a flex row, and bare text plus inline elements would become separate columns |
| Modal | `Modal` | Closes on Escape and backdrop click; footer for actions |
| Drawer | `Drawer` | Right-side panel for record detail (findings) |
| Chips | `Chips` | Multi-select toggles (complexities, strategies, categories) |
| Tabs | `.tabs`, `.tab.on` | |
| Toast | `useToast()(message, 'success' \| 'error')` | Errors stay 5 seconds |
| Locked | `Locked` | Hatched panel for content a role may not see |
| Model picker | `ModelPicker` | Radio cards for judges or attack engines |
| Other | `.progress`, `.timeline`, `.steps`, `.code`, `.board`/`.col`/`.fcard`, `.gate.blocked`/`.gate.passed` | |

## Charts

Charts are hand-written SVG and HTML in `components/charts.tsx` ([ADR 0005](adr/0005-hand-rolled-charts.md)). The rules they follow:

| Chart | Encoding |
|---|---|
| `AsrBars` (attack success by category) | One series. Bar color is **status** (good or bad against the limit), always with an icon and the value printed. A dark line marks the limit. |
| `Heatmap` (category × strategy) | **Sequential single-hue** orange ramp, five steps (0, ≤2, ≤5, ≤10, >10%). The value is printed in every cell, so the color is never the only cue. Strategies not run show a dashed empty cell. |
| `TrendChart` (attack success across releases) | One series, 2px line, markers, the limit as a dashed reference line, the latest value labelled directly. Hover shows a crosshair and tooltip. No legend for a single series. |
| `CountBars` (findings by severity) | Severity colors with labels and counts |

Every chart mark has a hover tooltip through the shared `TooltipProvider`. Tooltips hide on navigation and scroll, so they never stay on screen after the page changes.

## Accessibility

- Visible focus rings (`:focus-visible`) on buttons, icons and links.
- Icon-only buttons have `aria-label`s; dialogs are `role="dialog"` with `aria-modal`; tabs and radio groups use their ARIA roles.
- Status always has text, not only color.
- Layout reflows at 900px: the sidebar becomes a top band and grids collapse to one column. No horizontal page scrolling at phone width.

## Print

`@media print` hides the sidebar, top bar and anything with `.no-print`, removes shadows, and avoids breaking cards across pages. The evidence pack is designed to print cleanly.
