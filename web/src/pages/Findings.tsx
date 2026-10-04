import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, ShieldCheck, TriangleAlert, Lock, ArrowRight, Undo2, Bug, Search } from 'lucide-react';
import { useStore } from '../store/store';
import { Badge, Drawer, FindingStatusBadge, Kpi, Modal, PageHead, SeverityBadge, useToast } from '../components/ui';
import { can, FINDING_FLOW, OPEN_STATUSES, OWASP, RISK_CATEGORIES, SEVERITIES, SEVERITY_INFO } from '../domain/framework';
import type { AppState, Finding, FindingSource, FindingStatus, Role, Severity } from '../domain/types';
import { DAY, daysFromNow, dueLabel, fmtDate, fmtDateTime } from '../domain/util';

const COLUMNS: { status: FindingStatus; label: string }[] = [
  { status: 'New', label: 'New' }, { status: 'Triaged', label: 'Triaged' }, { status: 'In fix', label: 'In fix' },
  { status: 'Retest pending', label: 'Retest pending' }, { status: 'Closed', label: 'Closed, last 30 days' }, { status: 'Accepted risk', label: 'Accepted risk' },
];

// Which moves the lifecycle allows (section 8.2), and who may make them (section 10.5)
export function allowedMove(f: Finding, to: FindingStatus, role: Role): string | null {
  if (f.status === to) return 'Already in this state';
  if (!can(role, 'moveFindings') && to !== 'Accepted risk') return `${role} has read-only access to findings`;
  if (f.status === 'Closed' || f.status === 'Accepted risk') return 'Finding is no longer open';
  if (to === 'Accepted risk') return can(role, 'acceptRisk') ? null : 'Only the governance board can accept risk';
  if (to === 'Triaged' && !can(role, 'triage')) return 'Triage is led by Security';
  const from = FINDING_FLOW.indexOf(f.status);
  const target = FINDING_FLOW.indexOf(to);
  if (target === from + 1) return null;
  if (f.status === 'Retest pending' && to === 'In fix') return null;
  return `Cannot move from ${f.status} to ${to}`;
}

export default function Findings() {
  const { state, api } = useStore();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [app, setApp] = useState(params.get('app') ?? 'all');
  const [sev, setSev] = useState<Severity | 'all'>('all');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [over, setOver] = useState<FindingStatus | null>(null);
  const [closing, setClosing] = useState<Finding | null>(null);
  const [accepting, setAccepting] = useState<Finding | null>(null);
  const [logging, setLogging] = useState(false);
  const openId = params.get('open');
  const selected = state.findings.find((f) => f.id === openId);
  const setOpen = (id: string | null) => { const p = new URLSearchParams(params); if (id) p.set('open', id); else p.delete('open'); setParams(p, { replace: true }); };

  const name = (id: string) => state.applications.find((a) => a.id === id)?.name ?? id;
  const list = useMemo(() => state.findings.filter((f) =>
    (app === 'all' || f.appId === app) && (sev === 'all' || f.severity === sev) &&
    (!q || `${f.id} ${f.title} ${f.category} ${f.owner}`.toLowerCase().includes(q.toLowerCase())) &&
    !(f.status === 'Closed' && f.closedAt && Date.now() - new Date(f.closedAt).getTime() > 30 * DAY)), [state.findings, app, sev, q]);

  const open = state.findings.filter((f) => OPEN_STATUSES.includes(f.status));
  const crit = open.filter((f) => f.severity === 'Critical');
  const high = open.filter((f) => f.severity === 'High');
  const closed30 = state.findings.filter((f) => f.status === 'Closed' && f.closedAt && Date.now() - new Date(f.closedAt).getTime() <= 30 * DAY);

  const move = (f: Finding, to: FindingStatus) => {
    const why = allowedMove(f, to, state.role);
    if (why) return toast(why);
    if (to === 'Closed' && !f.regressionTestId) return setClosing(f);
    if (to === 'Accepted risk') return setAccepting(f);
    void api.moveFinding(f.id, to).then((r) => r && toast(`${f.id} moved to ${to}`));
  };

  return (
    <>
      <PageHead title="Findings" sub="All applications · A finding closes only when its regression test is in the evaluation suite"
        actions={<>
          <div className="search" style={{ width: 220, background: 'var(--surface)' }}><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter findings" aria-label="Filter findings" /></div>
          <select className="select" style={{ width: 'auto' }} value={app} onChange={(e) => setApp(e.target.value)} aria-label="Application">
            <option value="all">All applications</option>{state.applications.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="select" style={{ width: 'auto' }} value={sev} onChange={(e) => setSev(e.target.value as Severity | 'all')} aria-label="Severity">
            <option value="all">All severities</option>{SEVERITIES.map((s) => <option key={s}>{s}</option>)}
          </select>
          {can(state.role, 'logFinding') && <button className="btn primary" onClick={() => setLogging(true)}><Plus />Log finding</button>}
        </>} />

      <div className="stack">
        <div className="kpis">
          <Kpi icon={<Bug />} label="Open findings" value={open.length} note={`Across ${new Set(open.map((f) => f.appId)).size} applications`} />
          <Kpi label="Critical" value={crit.length} note={crit.length ? `Blocks ${Array.from(new Set(crit.map((f) => name(f.appId)))).join(', ')}` : 'None open'} tone={crit.length ? 'bad' : 'good'} />
          <Kpi label="High" value={high.length} note={`${high.filter((f) => dueLabel(f.dueAt).overdue).length} overdue`} />
          <Kpi label="Medium and low" value={open.length - crit.length - high.length} note={`${open.filter((f) => f.severity === 'Medium').length} medium, ${open.filter((f) => f.severity === 'Low').length} low`} />
          <Kpi label="Closed with regression test" value={closed30.length ? `${Math.round((closed30.filter((f) => f.regressionTestId).length / closed30.length) * 100)}%` : '—'} note={`Last 30 days, ${closed30.filter((f) => f.regressionTestId).length} of ${closed30.length}`} tone="good" />
        </div>

        <section className="board" aria-label="Findings board">
          {COLUMNS.map((col) => {
            const cards = list.filter((f) => f.status === col.status).sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
            return (
              <div key={col.status} className={`col ${over === col.status ? 'over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOver(col.status); }} onDragLeave={() => setOver(null)}
                onDrop={(e) => { e.preventDefault(); setOver(null); const f = state.findings.find((x) => x.id === e.dataTransfer.getData('text/plain')); if (f) move(f, col.status); }}>
                <div className="col-head"><span>{col.label}</span><span className="n">{cards.length}</span></div>
                {cards.map((f) => {
                  const due = f.status === 'Closed' ? { text: `Closed ${fmtDate(f.closedAt)}`, overdue: false } : f.status === 'Accepted risk' ? { text: `Expires ${fmtDate(f.acceptance?.expires)}`, overdue: false } : dueLabel(f.dueAt);
                  return (
                    <article key={f.id} className="fcard" draggable={can(state.role, 'moveFindings') || can(state.role, 'acceptRisk')}
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', f.id)} onClick={() => setOpen(f.id)}
                      tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(f.id)}>
                      <div className="row" style={{ gap: 6 }}><SeverityBadge s={f.severity} /><span className="mono" style={{ fontSize: 12 }}>{f.id}</span></div>
                      <div className="t">{f.title}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{name(f.appId)} · {f.owasp.length ? f.owasp.join(', ') : 'Hardening'}</div>
                      <div className="m"><span>{f.status === 'Closed' && f.regressionTestId ? `Regression ${f.regressionTestId}` : f.owner}</span><span className={due.overdue ? 'overdue' : ''} style={{ fontWeight: 600 }}>{due.text}</span></div>
                    </article>
                  );
                })}
                {cards.length === 0 && <div className="muted" style={{ fontSize: 12, textAlign: 'center', padding: 14 }}>Nothing here</div>}
              </div>
            );
          })}
        </section>
        <div className="muted" style={{ fontSize: 12 }}>Drag cards between columns or open a finding to move it. Your role ({state.role}) controls which moves are allowed.</div>
      </div>

      {selected && <FindingDrawer f={selected} state={state} onClose={() => setOpen(null)} onMove={(to) => move(selected, to)} />}
      {closing && <CloseModal f={closing} onClose={() => setClosing(null)} />}
      {accepting && <AcceptModal f={accepting} onClose={() => setAccepting(null)} />}
      {logging && <LogFindingModal onClose={() => setLogging(false)} />}
    </>
  );
}

function FindingDrawer({ f, state, onClose, onMove }: { f: Finding; state: AppState; onClose: () => void; onMove: (to: FindingStatus) => void }) {
  const { api } = useStore();
  const app = state.applications.find((a) => a.id === f.appId)!;
  const due = dueLabel(f.dueAt);
  const idx = FINDING_FLOW.indexOf(f.status);
  const next = idx >= 0 && idx < FINDING_FLOW.length - 1 ? FINDING_FLOW[idx + 1] : null;
  const nextBlock = next ? allowedMove(f, next, state.role) : null;
  const canEdit = can(state.role, 'triage');

  return (
    <Drawer onClose={onClose} head={<>
      <div className="row" style={{ marginBottom: 6 }}><SeverityBadge s={f.severity} /><span className="mono">{f.id}</span><FindingStatusBadge s={f.status} /></div>
      <h3 style={{ fontSize: 17, lineHeight: 1.4 }}>{f.title}</h3>
    </>}>
      {OPEN_STATUSES.includes(f.status) && (
        <div className="row">
          {next && <button className="btn primary sm" disabled={!!nextBlock} title={nextBlock ?? ''} onClick={() => onMove(next)}>{next === 'Closed' ? <ShieldCheck size={15} /> : <ArrowRight size={15} />}Move to {next}</button>}
          {f.status === 'Retest pending' && <button className="btn sm" disabled={!!allowedMove(f, 'In fix', state.role)} onClick={() => onMove('In fix')}><Undo2 size={15} />Still reproduces</button>}
          {can(state.role, 'acceptRisk') && <button className="btn sm" onClick={() => onMove('Accepted risk')}>Accept risk</button>}
          {nextBlock && <span className="muted" style={{ fontSize: 12 }}>{nextBlock}</span>}
        </div>
      )}
      {f.status === 'Retest pending' && !f.regressionTestId && <div className="callout warn"><TriangleAlert /><span>Closing requires adding this attack to {app.name}’s regression set.</span></div>}
      <dl className="dl">
        <dt>Application</dt><dd><Link to={`/applications/${app.id}`}>{app.name}</Link> · {app.tier} risk</dd>
        <dt>Source</dt><dd>{f.source} · <span className="mono">{f.sourceRef}</span></dd>
        <dt>Category</dt><dd>{f.category}</dd>
        <dt>OWASP LLM</dt><dd>{f.owasp.length ? f.owasp.map((o) => `${o} ${OWASP[o]}`).join('; ') : 'Not mapped (hardening)'}</dd>
        <dt>Severity</dt><dd>{canEdit && OPEN_STATUSES.includes(f.status)
          ? <select className="select" style={{ height: 30, width: 'auto' }} value={f.severity} onChange={(e) => void api.updateFinding(f.id, { severity: e.target.value as Severity })}>{SEVERITIES.map((s) => <option key={s}>{s}</option>)}</select>
          : f.severity} <span className="muted" style={{ fontSize: 12 }}>· {SEVERITY_INFO[f.severity].deadline}</span></dd>
        <dt>Owner</dt><dd>{canEdit && OPEN_STATUSES.includes(f.status)
          ? <input className="input" style={{ height: 30 }} defaultValue={f.owner} onBlur={(e) => e.target.value !== f.owner && void api.updateFinding(f.id, { owner: e.target.value })} />
          : f.owner}</dd>
        <dt>Opened</dt><dd>{fmtDateTime(f.openedAt)} · found {f.foundIn.toLowerCase()}</dd>
        {OPEN_STATUSES.includes(f.status) && <><dt>Deadline</dt><dd className={due.overdue ? 'overdue' : ''}>{due.text}</dd></>}
        <dt>Work item</dt><dd>{f.workItem ? <span className="mono">{f.workItem}</span> : <span className="muted">Created automatically when moved to In fix</span>}</dd>
        {f.regressionTestId && <><dt>Regression test</dt><dd><span className="mono">{f.regressionTestId}</span> · {state.regressionTests.find((r) => r.id === f.regressionTestId)?.title}</dd></>}
        {f.acceptance && <><dt>Risk acceptance</dt><dd>{f.acceptance.approvedBy}, expires {fmtDate(f.acceptance.expires)}<div className="muted" style={{ fontSize: 12.5 }}>{f.acceptance.controls}</div></dd></>}
      </dl>
      <div>
        <div style={{ fontWeight: 650, marginBottom: 8 }}>Evidence</div>
        {can(state.role, 'viewAttackContent')
          ? <div className="callout"><Lock /><span>{f.evidence}. Full prompt, response and trace in restricted storage.</span></div>
          : <div className="callout"><Lock /><span>Summary: {f.evidence.split(';')[0]}. Raw attack content is visible to Security analysts and authorized testers only.</span></div>}
      </div>
      <div>
        <div style={{ fontWeight: 650, marginBottom: 10 }}>History</div>
        <div className="timeline">
          {[...f.history].reverse().map((h, i) => (
            <div className="tl-item" key={i}><span className="tl-dot" /><div><div style={{ fontSize: 13.5 }}>{h.text}</div><div className="muted" style={{ fontSize: 12 }}>{h.by} · {fmtDateTime(h.at)}</div></div></div>
          ))}
        </div>
      </div>
    </Drawer>
  );
}

function CloseModal({ f, onClose }: { f: Finding; onClose: () => void }) {
  const { api } = useStore();
  const toast = useToast();
  const [title, setTitle] = useState(`${f.category}: ${f.title.split(' ').slice(0, 8).join(' ')} is defended`);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <Modal title={`Close ${f.id}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={!title.trim() || !confirmed} onClick={async () => { const r = await api.moveFinding(f.id, 'Closed', { regressionTitle: title }); if (r) { toast(`${f.id} closed · ${r.regressionTestId} added to the regression set`); onClose(); } }}><ShieldCheck size={16} />Add test and close</button></>}>
      <div className="callout info"><ShieldCheck /><span>A finding cannot be closed until its attack has been added to the application’s regression set. From then on it runs on every release as part of evaluation.</span></div>
      <label className="field"><span>Regression test name</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="muted" style={{ fontSize: 12.5 }}>Will be added to <span className="mono">datasets/{f.appId}/regression.jsonl</span>, including the original attack and its variations from <span className="mono">{f.sourceRef}</span>.</div>
      <label className="row" style={{ fontSize: 13.5 }}><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Retest confirmed the original attack and its variations no longer reproduce</label>
    </Modal>
  );
}

function AcceptModal({ f, onClose }: { f: Finding; onClose: () => void }) {
  const { api } = useStore();
  const toast = useToast();
  const [expires, setExpires] = useState(daysFromNow(90).slice(0, 10));
  const [controls, setControls] = useState('');
  return (
    <Modal title={`Accept risk for ${f.id}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={!controls.trim()} onClick={async () => { if (await api.moveFinding(f.id, 'Accepted risk', { acceptance: { expires: new Date(expires).toISOString(), controls } })) { toast(`Risk accepted for ${f.id}`); onClose(); } }}>Approve acceptance</button></>}>
      <div className="callout warn"><TriangleAlert /><span>Accepted risk requires governance approval, an expiry date and compensating controls.</span></div>
      <label className="field"><span>Expiry date</span><input type="date" className="input" value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
      <label className="field"><span>Compensating controls</span><textarea className="textarea" value={controls} onChange={(e) => setControls(e.target.value)} /></label>
    </Modal>
  );
}

// With `attempt`, the finding is created from a manual-testing attempt and linked to it on the server
export function LogFindingModal({ onClose, preset, attempt }: { onClose: () => void; preset?: Partial<Finding>; attempt?: { sessionId: string; attemptId: string } }) {
  const { state, api } = useStore();
  const toast = useToast();
  const [appId, setAppId] = useState(preset?.appId ?? state.applications[0].id);
  const [title, setTitle] = useState(preset?.title ?? '');
  const [severity, setSeverity] = useState<Severity>(preset?.severity ?? 'Medium');
  const [category, setCategory] = useState(preset?.category ?? RISK_CATEGORIES[0].name);
  const [owasp, setOwasp] = useState(preset?.owasp?.[0] ?? 'LLM01');
  const [source, setSource] = useState<FindingSource>(preset?.source ?? 'Manual exercise');
  const [sourceRef, setSourceRef] = useState(preset?.sourceRef ?? '');
  const [evidence, setEvidence] = useState(preset?.evidence ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const owaspIds = owasp ? [owasp] : [];
    const f = attempt
      ? await api.findingFromAttempt(attempt.sessionId, attempt.attemptId, { title, severity, category, owasp: owaspIds, evidence })
      : await api.logFinding({ appId, title, severity, category, owasp: owaspIds, source, sourceRef: sourceRef || '—', evidence: evidence || 'See restricted storage' });
    setBusy(false);
    if (!f) return;
    toast(`${f.id} logged`);
    onClose();
  };

  return (
    <Modal title="Log finding" onClose={onClose} width={680} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !title.trim()} onClick={save}>Log finding</button></>}>
      <label className="field"><span>Title</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What went wrong, in one sentence" /></label>
      <div className="form-grid">
        <label className="field"><span>Application</span><select className="select" value={appId} onChange={(e) => setAppId(e.target.value)}>{state.applications.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className="field"><span>Severity</span><select className="select" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>{SEVERITIES.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="field"><span>Category</span><select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>{[...RISK_CATEGORIES.map((c) => c.name), 'System prompt leakage', 'Agent impersonation', 'Unbounded consumption', 'Hardening'].map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="field"><span>OWASP LLM</span><select className="select" value={owasp} onChange={(e) => setOwasp(e.target.value)}><option value="">Not mapped</option>{Object.entries(OWASP).map(([k, v]) => <option key={k} value={k}>{k} {v}</option>)}</select></label>
        <label className="field"><span>Source</span><select className="select" value={source} onChange={(e) => setSource(e.target.value as FindingSource)}>{(['Automated scan', 'Scenario', 'Manual exercise', 'Production monitoring'] as FindingSource[]).map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="field"><span>Source reference</span><input className="input" value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="EX-015 · A-3" /></label>
      </div>
      <label className="field"><span>Evidence summary</span><textarea className="textarea" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Canary hit, trace ID, reproduction rate. Raw prompts and responses go to restricted storage." /></label>
      <div className="muted" style={{ fontSize: 12.5 }}>Deadline: {SEVERITY_INFO[severity].deadline}. {SEVERITY_INFO[severity].blocks && <Badge tone="bad">Blocks release</Badge>}</div>
    </Modal>
  );
}
