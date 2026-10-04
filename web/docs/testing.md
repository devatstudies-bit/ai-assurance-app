# Testing

The client has **no automated test suite in the repository yet**. The rules it depends on are tested in the API (`../../backend/docs/testing.md`), and the client has been checked with scripted browser runs (Playwright driving Chrome against the live API) during development. Those scripts were not committed.

## Static checks

```bash
npm run build      # TypeScript type-check (tsc -b) and production build
npm run lint       # oxlint
```

The type-check is the main guard against the client drifting from the API: response shapes live in `src/domain/types.ts`.

## Manual check

With the API and `npm run dev` running, and data reset (**Administration → Reset sample data**):

1. **Load and theme**: the dashboard loads; toggle dark mode; reload and the theme is kept.
2. **Roles**: as *Product team member*, Manual testing is locked and AI models has no Add buttons; as *Security analyst*, the manual workspace opens.
3. **The core loop** as *Security analyst*: open PeopleDesk Assistant (gate blocked). On Findings, move FND-0231, FND-0232 and FND-0219 to Closed, adding a regression test each time. Run a release scan with the simulated engine and watch its progress. Back on the application, the gate passes. Sign off as *Security analyst* and *Governance board member*.
4. **Errors reach the user**: as *Product owner*, drag a New finding to Triaged; a red toast says *Triage is led by Security*.
5. **Evaluations**: run an evaluation with the simulated judge; it completes and the evaluation card names it. Choose *GPT-4.1 judge* without its key set: the dialog warns, and the run fails with the missing variable named.
6. **Models**: on AI models, **Test** GPT-4.1 judge shows the missing key; add an OpenAI-compatible judge; it appears in the Run evaluation picker.
7. **Calibration advisory**: Insight Copilot's gate shows *Judge calibration · Advisory*.
8. **Narrow screen**: at 390px wide there is no horizontal page scrolling.
9. **Console**: no errors in the browser console throughout.

## Suggested automated tests

When adding a suite, the highest-value tests are:

- **End-to-end** (Playwright) for the core loop in step 3, run against the API with sample data. It covers the store, polling, drawers, dialogs and the server rules together.
- **Component tests** (Vitest and Testing Library) for `ModelPicker`, the findings board's drag and drop, and the store's error handling (a failed `call` shows a toast and resolves to `undefined`).
