# Screens

What each screen shows, what you can do there, and who can do it. Section numbers refer to the framework document. The permission names match `domain/framework.ts` and the server's rules in `../../backend/docs/domain-rules.md`.

## Shell (all screens)

- **Sidebar**: grouped navigation (Overview, Assurance, Governance). Badges show running scans and evaluations, and open critical or high findings. The footer shows how many judges and attack engines are enabled.
- **Search** (top bar): type a finding ID (`FND-0231`), scan ID (`RT-1001`) or application name and press Enter.
- **Theme**: light or dark; remembered per browser.
- **Role switcher**: preview the app as any of the six roles (§10.5). The server returns data and enforces rules for that role. Development only.

## Dashboard (`/`)

The portfolio answer to "is each application ready and safe?"

- KPIs from §12.3: applications assessed, gate pass rate, portfolio attack success rate, open critical and high findings, overdue fixes, share of closed findings with regression tests and mean time to fix.
- **Application assurance status** table: risk, stage, quality index, attack success rate, open critical or high findings, gate result. Click a row to open the application.
- **Attack success rate across releases** for a chosen application, with the tier's limit line.
- Open findings by severity; upcoming scheduled scans and manual exercises.

## Applications (`/applications`)

Registry cards with type, stage, release, owner and gate result. Filter by tier.
**Register application** (register apps): name, type, owning team, EC member, description, risk tier (with what each tier means), entry points and OWASP threats in scope. New applications start in *Design*.

## Application overview (`/applications/:id`)

The main screen for one application (§10.4 "Application overview").

| Area | Content |
|---|---|
| Header actions | Request exception (shows a confirmation only; not stored yet) · Evidence pack · **Run evaluation** and **Run scan** (run scans) · **Rerun gate** (records a gate run; not for auditors) |
| Gate banner | Passed or blocked, how many criteria failed, the failing criteria in words, and links to blocking findings. Model, prompt, golden set and profile. |
| Lifecycle and sign-off | Design → Build → Pre-release → Launch → Production; required sign-offs for the tier; **Sign off release** for a role that may sign once the gate passes |
| Evaluation / Red teaming | Every gate criterion with result, limit and status (Pass, Fail, Advisory, N/A). The evaluation card names the judge that scored the release and links to the evaluation; the red teaming card links to the scan. |
| Attack success rate by category | Bars against the per-category limit |
| Open findings, Recent runs | With deadlines; next scheduled scan and manual exercise |
| Threat model tab | Data access, actions, entry points, threats in scope with OWASP mapping |
| Configuration tab | The registry entry rendered as the Appendix A configuration |

## Run history (`/runs`)

Every gate run, evaluation, scan and manual exercise with time, version, detail, a link to its evidence, and result. Filter by application and run type.

## Evaluations (`/evaluations`, `/evaluations/:id`)

- List: run, application, version, mode, **judge** (with pinned version), dataset, cases, start time, result.
- **Run evaluation** (run scans) opens the evaluation dialog: application, dataset, mode (Pre-release becomes the release's evaluation of record; Online is monitoring only) and the **judge model picker**. The picker shows each judge's provider, deployment, version, calibration, and a *key missing* warning when its key is not set on the server.
- Detail: the judge used; progress while running; on failure the reason (for example the missing key variable) and a note that the release keeps its previous evaluation; on completion every metric with *scored by* (the judge, or *Deterministic*), result, limit and status; then per-case results with each judge verdict and its reason.

## Red team scans (`/scans`, `/scans/:id`)

- List with mode, complexity, attempts, attack success rate, canary leaks and status (with a progress bar while running).
- **New scan** (run scans): application, mode, **attack engine picker**, complexity, strategy groups and risk categories. It warns when the selected complexity will not satisfy the tier's gate, and limits agent-only categories to agentic applications.
- Detail (§10.4 "Red team results"): target, engine, timings; KPIs; the **category × strategy heat map**; optional comparison with the previous scan; scenario attacks; breach detail per breached scenario; success rate by complexity. Transcript location is shown to roles with attack-content access; others see a locked panel with *Request transcript access* (a confirmation only for now).

## Findings (`/findings`)

The findings board (§10.4).

- KPIs: open, critical, high (with overdue count), medium and low, closed with regression test.
- **Board** with columns New, Triaged, In fix, Retest pending, Closed (last 30 days), Accepted risk. Drag a card to move it, or open it.
- **Finding drawer**: move to the next step, *Still reproduces*, *Accept risk* (governance); severity and owner (triage); OWASP mapping, source, deadline, work item, regression test, acceptance terms; evidence (summary only for roles without attack-content access); full history.
- **Close** opens a dialog that requires a regression test name and a retest confirmation (§8.2 "the rule that connects everything").
- **Accept risk** requires an expiry date and compensating controls.
- **Log finding** (log findings).

## Test library (`/library`)

Golden datasets, agent scenarios, red team scenarios, attack seeds, canary sets and regression sets with version, size, coverage and location. Restricted items show their name only for roles without attack-content access. The regression tests created by closing findings are listed underneath.

## Manual testing (`/manual`, `/manual/:id`)

Security analysts only; other roles see a locked panel.

- Exercises with status, window, objectives, attempts and findings; rules of engagement (§7.6).
- **Plan exercise**: application, written authorization (the target is resolved from the registry and the environment comes from the authorization), objectives, harm-category opt-outs.
- Session workspace: target, authorization, progress; **Start session**; **Log attempt** (category, technique, entry point, outcome, observation summary); attempt log with **Create finding** for partial or successful attempts; **Complete exercise** (records the run and the application's manual test date).

## Evidence packs (`/evidence/:id`)

One-click release evidence (§10.4): gate decision with judge and attack engine provenance, every criterion, scan summary, findings with regression tests, run history, approvals. **Print / PDF** uses a print stylesheet that hides navigation; **Export JSON** downloads the pack. No raw attack content.

## AI models (`/models`)

Judge models and attack engines (§10.2). Everyone can view; AI platform engineers manage.

- Each model: name and notes, default marker, provider and deployment with pinned version, effort or temperature, dedicated or shared, credentials (the key's variable name and whether it is set on the server, or Entra ID), calibration for judges.
- **Test** makes one small call and shows the result inline.
- **Make default**, **Edit** (including calibration and enable or disable), **Delete** (refused if the model has recorded runs), **Add judge model**, **Add attack engine**.
- The form adapts to the provider: Azure OpenAI (endpoint, deployment, API version, API key or Entra ID), Anthropic (model ID, effort, optional endpoint; no temperature), OpenAI-compatible (endpoint, model, optional key), Azure AI Red Teaming Agent (project endpoint).

## Administration (`/admin`)

- **Gate thresholds** by tier: editable overall and per-category attack success rate limits, required complexity and scenario rule (AI platform or governance); the fixed criteria are shown read-only.
- **Risk tiers and severity**: what each tier means and each severity's deadline.
- **Roles and access** (§10.5) and **Cadence** (§12.2).
- **Reset sample data**: restores the database's sample data for everyone.
