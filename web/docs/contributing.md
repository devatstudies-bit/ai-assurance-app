# Contributing

How to extend the client without breaking its patterns.

## Add a screen

1. Create `src/pages/MyScreen.tsx`. Start with `PageHead`, then `Card`s inside a `<div className="stack">`.
2. Read data from `useStore().state`. Do not fetch inside the page unless the data is large and not in the snapshot (see how `EvaluationDetail` loads case results).
3. Add the route in `src/App.tsx` and, if it belongs in navigation, a `NavLink` in `components/Layout.tsx` with a lucide icon.
4. Document it in [screens.md](screens.md).

## Add an action

1. Add or confirm the endpoint in the API (rules live there).
2. Add a function to the `api` object in `src/store/store.tsx` using `call<T>(method, path, body)`. It refreshes the snapshot and shows errors for you.
3. In the page: `const r = await api.myAction(...); if (r) toast('Done');`. Handle only the success case.
4. If a role cannot do it, hide or disable the control with `can(state.role, '…')` from `domain/framework.ts`, and add the permission there if it is new (keep it identical to the server's `framework.ROLES`).

## Add a field from the API

1. Add it to the matching interface in `src/domain/types.ts`.
2. Use it. If `tsc` complains elsewhere, the type change has found every place that needs updating.

## Patterns to keep

- **Server messages are user messages.** Do not replace an API error with a generic one.
- **No business rules in the client.** If you find yourself checking a threshold or lifecycle step to decide an outcome, that belongs in the API. Checks that only decide what to show are fine.
- **Tokens, not hex.** Use the CSS variables in `index.css` so dark mode works.
- **Status needs a word or an icon**, not just a color.
- **Callout text goes in a `<span>`** next to the icon.
- **IDs and numbers use the `mono` class** (and `.num` in tables).
- **Long forms go in a `Modal`; record detail goes in a `Drawer`.**
- **URL query parameters** for filters and the open record, so views can be shared and survive reloads.

## Before you open a pull request

```bash
npm run build      # type-check and build
npm run lint
```

Then follow the manual check in [testing.md](testing.md) for the screens you touched, in both themes and as at least two roles.
