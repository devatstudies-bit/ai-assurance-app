# ADR 0005: Charts written by hand in SVG and HTML

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The app needs four simple charts: bars against a limit, a heat map, a single-series trend line, and count bars. They must follow the same rules (status shown with icons and labels as well as color, values printed, single-hue ramp for the heat map, a tooltip on every mark) and work in both themes.

## Decision

Implement them in `components/charts.tsx` with SVG and HTML, styled by the design tokens, and share one tooltip through `TooltipProvider`.

## Consequences

- Full control over encoding and accessibility; colors come from tokens, so dark mode works.
- No chart library in the bundle.
- New chart types cost more to build. Consider a library if the app needs many more chart forms.

## Alternatives considered

- **Recharts or Chart.js**: quicker for new chart types, but theming, label rules and bundle size are harder to control.
