import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CircleCheck, CircleX, RefreshCw, FileCheck, Play, Gavel, ShieldAlert, ListChecks, Target, Bug, History, PenLine, TriangleAlert } from 'lucide-react';
import { useApp, useGate, useStore } from '../store/store';
import { Badge, Card, CritBadge, FindingStatusBadge, Modal, PageHead, SeverityBadge, TierBadge, useToast } from '../components/ui';
import { AsrBars } from '../components/charts';
import NewScanModal from '../components/NewScanModal';
import { RunEvaluationModal } from '../components/ModelPicker';
import { can, canSignOff, OPEN_STATUSES, OWASP, SCAN_CADENCE, THREATS } from '../domain/framework';
import type { Criterion } from '../domain/types';
import type { Application, LifecycleStage } from '../domain/types';
import { daysFromNow, dueLabel, fmtDate, fmtDateTime } from '../domain/util';

const STAGES: LifecycleStage[] = ['Design', 'Build', 'Pre-release', 'Launch', 'Production'];

export default function AppOverview() {
  const { id } = useParams();
  const app = useApp(id);
  const [tab, setTab] = useState<'overview' | 'threat' | 'config'>('overview');
  if (!app) return <div className="empty">Application not found. <Link to="/applications">Back to registry</Link></div>;
  return (
    <>
      <Header app={app} />
      <div className="tabs" role="tablist">
        <button className={`tab ${tab === 'overview' ? 'on' : ''}`} onClick={() => setTab('overview')} role="tab" aria-selected={tab === 'overview'}>Overview</button>
        <button className={`tab ${tab === 'threat' ? 'on' : ''}`} onClick={() => setTab('threat')} role="tab" aria-selected={tab === 'threat'}>Threat model</button>
        <button className={`tab ${tab === 'config' ? 'on' : ''}`} onClick={() => setTab('config')} role="tab" aria-selected={tab === 'config'}>Configuration</button>
      </div>
      {tab === 'overview' && <Overview app={app} />}
      {tab === 'threat' && <ThreatModel app={app} />}
      {tab === 'config' && <Config app={app} />}
    </>
  );
}

function Header({ app }: { app: Application }) {
  const { state, api } = useStore();
  const toast = useToast();
  const [scan, setScan] = useState(false);
  const [evalOpen, setEvalOpen] = useState(false);
  const [exc, setExc] = useState(false);
  return (
    <>
      <PageHead
        crumbs={<><Link to="/applications">Applications</Link><span>/</span><span className="mono">{app.id}</span></>}
        title={app.name}
        actions={<>
          <button className="btn" onClick={() => setExc(true)} disabled={state.role === 'Auditor'}>Request exception</button>
          <Link className="btn" to={`/evidence/${app.id}`}><FileCheck />Evidence pack</Link>
          {can(state.role, 'runScans') && <button className="btn" onClick={() => setEvalOpen(true)}><Gavel />Run evaluation</button>}
          {can(state.role, 'runScans') && <button className="btn" onClick={() => setScan(true)}><Play />Run scan</button>}
          <button className="btn primary" disabled={state.role === 'Auditor'} onClick={async () => { const r = await api.rerunGate(app.id); if (r) toast(`Gate re-evaluated: ${r.gate.passed ? 'passed' : 'blocked'} · recorded in run history`); }}><RefreshCw />Rerun gate</button>
        </>}
      >
        <div className="row">
          <TierBadge t={app.tier} /><Badge>{app.type}</Badge><Badge>Owner: {app.owner}</Badge><Badge>EC: {app.ecMember}</Badge>
        </div>
      </PageHead>
      {scan && <NewScanModal appId={app.id} onClose={() => setScan(false)} />}
      {evalOpen && <RunEvaluationModal appId={app.id} onClose={() => setEvalOpen(false)} />}
      {exc && (
        <Modal title="Request a gate exception" onClose={() => setExc(false)} footer={<><button className="btn" onClick={() => setExc(false)}>Cancel</button><button className="btn primary" onClick={() => { setExc(false); toast('Exception request sent to the governance board'); }}>Submit request</button></>}>
          <div className="callout warn"><TriangleAlert /><span>Exceptions need governance approval, an expiry date and compensating controls. Canary leaks and unapproved actions are not eligible.</span></div>
          <label className="field"><span>Criteria to except</span><textarea className="textarea" placeholder="e.g. Highest category rate 6.3% (ungrounded attributes)" /></label>
          <label className="field"><span>Compensating controls</span><textarea className="textarea" /></label>
          <label className="field"><span>Expiry</span><input type="date" className="input" defaultValue={daysFromNow(30).slice(0, 10)} /></label>
        </Modal>
      )}
    </>
  );
}

function Overview({ app }: { app: Application }) {
  const { state, api } = useStore();
  const toast = useToast();
  const gate = useGate(app)!;
  const t = state.thresholds[app.tier];
  const scan = state.scans.find((s) => s.id === app.release.scanId);
  const evalRun = state.evaluations.find((r) => r.id === app.release.evaluationRunId);
  const open = state.findings.filter((f) => f.appId === app.id && OPEN_STATUSES.includes(f.status));
  const blockers = open.filter((f) => f.severity === 'Critical' || f.severity === 'High');
  const runs = state.runs.filter((r) => r.appId === app.id).slice(0, 6);
  const evalC = gate.criteria.filter((c) => c.group === 'Evaluation');
  const rtC = gate.criteria.filter((c) => c.group === 'Red teaming');
  const required = t.signOff;
  const signed = app.release.signOffs;
  const stageIdx = STAGES.indexOf(app.stage);

  return (
    <div className="stack">
      <section className={`gate ${gate.passed ? 'passed' : 'blocked'}`} aria-label="Release gate decision">
        <div className="gate-title">
          <div className="left">
            <span className="gate-chip">{gate.passed ? <CircleCheck /> : <CircleX />}{gate.passed ? 'Release approved by gate' : 'Release blocked'}</span>
            <h2>{gate.passed ? `Candidate ${app.release.version} passed all ${gate.evaluated} gate criteria` : `Candidate ${app.release.version} failed ${gate.failed.length} of ${gate.evaluated} gate criteria`}</h2>
          </div>
          <span className="muted" style={{ fontSize: 13 }}>Run {fmtDateTime(app.release.date)} · Pipeline {app.release.pipeline}</span>
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55 }}>
          {gate.passed
            ? <>Quality, safety and security results all within {app.tier.toLowerCase()}-risk thresholds. {signed.length < required.length ? `Awaiting sign-off from ${required.filter((r) => !signed.some((s) => s.role === r)).join(' and ')}.` : 'All sign-offs recorded.'}</>
            : <>Failing: {gate.failed.map((c) => c.name.toLowerCase() + (c.reason ? ` (${c.reason})` : '')).join('; ')}.
              {blockers.length > 0 && <> Blocking findings: {blockers.map((f, i) => <span key={f.id}>{i > 0 && ', '}<Link to={`/findings?open=${f.id}`}>{f.id}</Link> ({f.severity.toLowerCase()})</span>)}.</>}
              {evalC.every((c) => c.status !== 'Fail') && ' Quality metrics all pass.'}</>}
        </div>
        <div className="facts">
          <span><b>Model</b>{app.release.model}</span>
          <span><b>Prompt</b>{app.release.prompt}</span>
          <span><b>Golden set</b>{app.release.goldenSet}</span>
          <span><b>Profile</b>{app.profile}, {app.tier.toLowerCase()} tier</span>
        </div>
      </section>

      <Card title="Lifecycle and sign-off" icon={<PenLine />}>
        <div className="between" style={{ alignItems: 'center' }}>
          <div className="steps" aria-label="Lifecycle stage">
            {STAGES.map((s, i) => (
              <span key={s} className="row" style={{ gap: 0 }}>
                {i > 0 && <span className={`step-line ${i <= stageIdx ? 'done' : ''}`} />}
                <span className={`step ${i < stageIdx ? 'done' : i === stageIdx ? 'cur' : ''}`}><span className="c">{i < stageIdx ? '✓' : i + 1}</span>{s}</span>
              </span>
            ))}
          </div>
          <div className="row">
            {required.map((r) => {
              const s = signed.find((x) => x.role === r);
              return <Badge key={r} tone={s ? 'good' : ''} title={s ? `${s.by}, ${fmtDate(s.at)}` : 'Pending'}>{s ? <CircleCheck /> : null}{r}{s ? '' : ' · pending'}</Badge>;
            })}
            {canSignOff(state.role, app.tier, required) && !signed.some((s) => s.role === state.role) && (
              <button className="btn sm primary" disabled={!gate.passed} title={gate.passed ? '' : 'The gate must pass before sign-off'} onClick={async () => { if (await api.signOff(app.id)) toast(`Signed off ${app.release.version} as ${state.role}`); }}>Sign off release</button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid-2">
        <CriteriaCard title="Evaluation" icon={<ListChecks />} rows={evalC} footer={evalRun && <span>Scored by <b>{evalRun.judge.name}</b>{evalRun.judge.modelVersion ? ` (${evalRun.judge.modelVersion})` : ''} · <Link to={`/evaluations/${evalRun.id}`}>Open evaluation {evalRun.id} →</Link></span>} />
        <CriteriaCard title="Red teaming" icon={<ShieldAlert />} rows={rtC} footer={scan && <Link to={`/scans/${scan.id}`}>Open scan {scan.id} results →</Link>} />
      </div>

      {scan && scan.status === 'Completed' && (
        <Card title="Attack success rate by category" icon={<Target />} meta={`Limit per category ${t.maxAsrCategory}% · overall ${((scan.successes / scan.attempts) * 100).toFixed(1)}% of ${scan.attempts.toLocaleString()} attempts`}>
          <AsrBars rows={[...scan.heat].sort((a, b) => b.overall - a.overall).map((h) => ({ name: h.category, value: h.overall }))} limit={t.maxAsrCategory} />
        </Card>
      )}

      <div className="grid-2">
        <Card title="Open findings" icon={<Bug />} meta={<Link to={`/findings?app=${app.id}`}>All findings</Link>}>
          <div className="stack" style={{ gap: 10 }}>
            {open.length === 0 && <div className="empty">No open findings.</div>}
            {open.map((f) => {
              const due = dueLabel(f.dueAt);
              return (
                <Link key={f.id} to={`/findings?open=${f.id}`} className="fcard" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <div className="row"><SeverityBadge s={f.severity} /><span className="mono" style={{ fontSize: 12.5 }}>{f.id}</span><FindingStatusBadge s={f.status} /></div>
                  <div className="t">{f.title}</div>
                  <div className="m"><span>{f.source} · {f.sourceRef}</span><span>Owner: {f.owner}</span><span className={due.overdue ? 'overdue' : ''} style={{ fontWeight: 600 }}>{due.text}</span></div>
                </Link>
              );
            })}
          </div>
        </Card>
        <Card title="Recent runs" icon={<History />} meta={<Link to={`/runs?app=${app.id}`}>Run history</Link>} pad={false}>
          <table className="table compact">
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="mono muted" style={{ width: 70 }}>{fmtDate(r.at)}</td>
                  <td><div style={{ fontWeight: 550 }}>{r.kind}, {r.version}</div><div className="muted" style={{ fontSize: 12 }}>{r.detail}</div></td>
                  <td style={{ textAlign: 'right' }}><Badge tone={r.result === 'Blocked' || r.result === 'Alert' ? 'bad' : 'good'}>{r.result}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted" style={{ fontSize: 12, padding: '10px 20px', borderTop: '1px solid var(--border)' }}>Next scheduled scan {fmtDate(app.nextScheduledScan)} ({SCAN_CADENCE[app.tier].toLowerCase()}) {app.nextManualTest && `· next manual exercise ${fmtDate(app.nextManualTest)}`}</div>
        </Card>
      </div>
    </div>
  );
}

function CriteriaCard({ title, icon, rows, footer }: { title: string; icon: React.ReactNode; rows: Criterion[]; footer?: React.ReactNode }) {
  const counted = rows.filter((r) => r.status !== 'N/A');
  const passed = counted.filter((r) => r.status !== 'Fail').length;
  return (
    <Card title={title} icon={icon} meta={<span style={{ fontWeight: 650, color: passed === counted.length ? 'var(--good-text)' : 'var(--bad-text)' }}>{passed} of {counted.length} passed</span>} pad={false}>
      <table className="table">
        <thead><tr><th>Criterion</th><th className="num">Result</th><th className="num">Limit</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}{r.reason && <div className="muted" style={{ fontSize: 12 }}>{r.reason}</div>}</td>
              <td className="num" style={{ color: r.status === 'Fail' ? 'var(--bad-text)' : undefined, fontWeight: r.status === 'Fail' ? 650 : 400 }}>{r.result}</td>
              <td className="num muted">{r.limit}</td>
              <td style={{ textAlign: 'right' }}><CritBadge s={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {footer && <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: 13.5 }}>{footer}</div>}
    </Card>
  );
}

function ThreatModel({ app }: { app: Application }) {
  const tm = app.threatModel;
  const relevant = THREATS.filter((t) => t.owasp.split(', ').some((o) => tm.threats.includes(o)));
  return (
    <div className="stack">
      <div className="grid-3">
        <Card title="What it can access"><div className="chips">{tm.dataAccess.length ? tm.dataAccess.map((d) => <Badge key={d}><span className="mono">{d}</span></Badge>) : <span className="muted">None declared</span>}</div></Card>
        <Card title="What it can do"><div className="chips">{tm.actions.length ? tm.actions.map((d) => <Badge key={d} tone="serious"><span className="mono">{d}</span></Badge>) : <span className="muted">Read-only, no actions</span>}</div></Card>
        <Card title="Entry points it reads"><div className="chips">{tm.entryPoints.map((d) => <Badge key={d} tone="accent">{d}</Badge>)}</div></Card>
      </div>
      <Card title="Threats in scope" meta={`Version ${tm.version} · approved by ${tm.approvedBy}`} pad={false}>
        <table className="table">
          <thead><tr><th>Threat</th><th>What it looks like</th><th>OWASP LLM</th><th>Most relevant to</th></tr></thead>
          <tbody>
            {relevant.map((t) => (
              <tr key={t.threat}><td style={{ fontWeight: 550 }}>{t.threat}</td><td className="dim">{t.looks}</td><td><span className="mono" title={t.owasp.split(', ').map((o) => OWASP[o]).join(', ')}>{t.owasp}</span></td><td className="dim">{t.relevant}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
      {tm.entryPoints.length > 1 && <div className="callout info"><span>Red teaming must cover every entry point the application reads, not only user input: {tm.entryPoints.join(', ')}.</span></div>}
    </div>
  );
}

function Config({ app }: { app: Application }) {
  const { state } = useStore();
  const t = state.thresholds[app.tier];
  const scan = state.scans.find((s) => s.id === app.release.scanId);
  const slug = app.id.replace('uc-', '').split('-')[0];
  const y = (k: string, v: string, indent = 0) => <>{' '.repeat(indent)}<span className="k">{k}</span>: {v}{'\n'}</>;
  return (
    <Card title="Registry entry" meta="Application configuration with red teaming settings (Appendix A)">
      <pre className="code">
        <span className="k">application</span>:{'\n'}
        {y('id', app.id, 2)}{y('type', app.type.toLowerCase().replace(/ /g, '_').replace('-', '_'), 2)}{y('risk_tier', app.tier.toLowerCase(), 2)}
        {y('owner', `{team: ${app.owner}, ec_member: "${app.ecMember}"}`, 2)}
        <span className="k">threat_model</span>:{'\n'}
        {y('data_access', `[${app.threatModel.dataAccess.join(', ')}]`, 2)}{y('actions', `[${app.threatModel.actions.join(', ')}]`, 2)}
        {y('entry_points', `[${app.threatModel.entryPoints.map((e) => e.toLowerCase().replace(/ /g, '_')).join(', ')}]`, 2)}
        <span className="k">evaluation</span>:{'\n'}
        {y('profile', app.profile, 2)}{y('golden_set', `"${app.release.goldenSet}"`, 2)}
        {(app.type === 'Agent' || app.type === 'Multi-agent') && y('repetitions', '5', 2)}
        <span className="k">red_team</span>:{'\n'}
        {'  '}<span className="k">automated</span>:{'\n'}
        {y('risk_categories', `[${(scan?.heat.map((h) => h.category.toLowerCase().replace(/ and /g, '_').replace(/[ -]/g, '_')) ?? []).join(', ')}]`, 4)}
        {y('complexity', `[${t.complexity.join(', ').toLowerCase()}]`, 4)}
        {y('strategies', `[${(scan?.strategies ?? []).join(', ').toLowerCase().replace('-', '_')}]`, 4)}
        {y('custom_seeds', `restricted://redteam/seeds/${slug}/v1`, 4)}
        {y('schedule', SCAN_CADENCE[app.tier].toLowerCase(), 4)}
        {y('canaries', `restricted://redteam/canaries/${slug}/v1`, 2)}
        {y('manual', `{required: ${t.manualTest === 'Required'}, next_exercise: "${app.nextManualTest?.slice(0, 10) ?? 'TBD'}"}`, 2)}
        <span className="k">gate</span>:{'\n'}
        {y('max_asr_overall', (t.maxAsrOverall / 100).toFixed(2), 2)}{y('max_asr_per_category', (t.maxAsrCategory / 100).toFixed(2), 2)}
        {y('canary_leaks', String(t.canaryLeaks), 2)}{y('open_findings', `{critical: ${t.openCritical}, high: ${t.openHigh ?? 'not_gated'}}`, 2)}
      </pre>
    </Card>
  );
}
