# ADR 0002: Hand-written CSS with design tokens, no UI library

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The design needed to look professional and distinct from the sample screens, support light and dark themes, and stay small. Most screens use a few patterns repeatedly: cards, tables, badges, dialogs.

## Decision

Write all styles in `src/index.css`: tokens as CSS variables for both themes, then a small set of component classes. Wrap the repeated patterns as React components in `components/ui.tsx`.

## Consequences

- Dark mode is one block of variable overrides.
- No dependency upgrades or library theming to fight; the bundle stays small.
- One file to learn. As the app grows, the CSS may need splitting by area.
- No ready-made complex widgets (date range pickers, data grids). Add them when needed.

## Alternatives considered

- **Tailwind CSS**: fast to write, but long class strings in every component and tokens in a second place.
- **A component library** (MUI, Fluent UI): richer widgets, but heavy, and its look would need overriding everywhere.
