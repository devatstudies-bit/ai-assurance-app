import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Play, Square, Plus, Bug, Lock, Clock, Target } from 'lucide-react';
import { useStore } from '../store/store';
import { Badge, Card, Locked, PageHead, useToast } from '../components/ui';
import { LogFindingModal } from './Findings';
import { can, RISK_CATEGORIES } from '../domain/framework';
import type { Attempt, EntryPoint } from '../domain/types';
import { fmtDate, fmtDateTime } from '../domain/util';

const CATS = [...RISK_CATEGORIES.map((c) => c.name), 'System prompt leakage', 'Agent impersonation', 'Unbounded consumption', 'Prompt injection'];

export default function SessionWorkspace() {
  const { id } = useParams();
  const { state, api } = useStore();
  const toast = useToast();
  const s = state.sessions.find((x) => x.id === id);
  const [category, setCategory] = useState(CATS[0]);
  const [technique, setTechnique] = useState('');
  const [entry, setEntry] = useState<EntryPoint>('User');
  const [outcome, setOutcome] = useState<Attempt['outcome']>('Defended');
  const [note, setNote] = useState('');
  const [findingFor, setFindingFor] = useState<Attempt | null>(null);

  if (!can(state.role, 'manualTesting')) return <Locked>Manual testing sessions are restricted to Security analysts and authorized testers.</Locked>;
  if (!s) return <div className="empty">Session not found. <Link to="/manual">All exercises</Link></div>;
  const app = state.applications.find((a) => a.id === s.appId)!;
  const auth = state.authorizations.find((a) => a.id === s.authorizationId);
  const active = s.status === 'Active';

  const log = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await api.logAttempt(s.id, { category, technique, entry, outcome, note }))) return;
    setTechnique(''); setNote('');
    toast('Attempt logged');
  };

  const counts = { Defended: 0, Partial: 0, Succeeded: 0 };
  s.attempts.forEach((a) => counts[a.outcome]++);

  return (
    <>
      <PageHead crumbs={<><Link to="/manual">Manual testing</Link><span>/</span><span className="mono">{s.id}</span></>} title={s.title}
        actions={<>
          {s.status === 'Planned' && <button className="btn primary" onClick={() => void api.setSessionStatus(s.id, 'Active')}><Play />Start session</button>}
          {active && <button className="btn" onClick={async () => { if (await api.setSessionStatus(s.id, 'Completed')) toast('Exercise completed and recorded in run history'); }}><Square />Complete exercise</button>}
        </>}>
        <div className="facts">
          <span><b>Status</b><Badge tone={active ? 'accent' : s.status === 'Completed' ? 'good' : ''}>{s.status}</Badge></span>
          <span><b>Window</b>{fmtDate(s.start)} – {fmtDate(s.end)}</span>
          <span><b>Testers</b>{s.testers.join(', ')}</span>
        </div>
      </PageHead>
      <div className="stack">
        <div className="grid-3">
          <Card title="Target" icon={<Target />}>
            <dl className="dl" style={{ gridTemplateColumns: '100px 1fr' }}>
              <dt>Application</dt><dd><Link to={`/applications/${app.id}`}>{app.name}</Link> {app.release.version}</dd>
              <dt>Endpoint</dt><dd className="mono" style={{ fontSize: 12.5 }}>{app.sandbox}</dd>
              <dt>Environment</dt><dd>{auth?.environment ?? '—'} · synthetic data</dd>
            </dl>
          </Card>
          <Card title="Authorization" icon={<Lock />}>
            <dl className="dl" style={{ gridTemplateColumns: '100px 1fr' }}>
              <dt>Record</dt><dd className="mono">{auth?.id}</dd>
              <dt>Approved by</dt><dd>{auth?.approvedBy}</dd>
              <dt>Valid</dt><dd>{fmtDate(auth?.from)} – {fmtDate(auth?.to)}</dd>
            </dl>
          </Card>
          <Card title="Progress" icon={<Clock />}>
            <div className="row" style={{ gap: 18 }}>
              <div><div className="mono" style={{ fontSize: 22, fontWeight: 650 }}>{s.attempts.length}</div><div className="muted" style={{ fontSize: 12 }}>attempts</div></div>
              <div><div className="mono" style={{ fontSize: 22, fontWeight: 650, color: 'var(--good-text)' }}>{counts.Defended}</div><div className="muted" style={{ fontSize: 12 }}>defended</div></div>
              <div><div className="mono" style={{ fontSize: 22, fontWeight: 650, color: 'var(--warn-text)' }}>{counts.Partial}</div><div className="muted" style={{ fontSize: 12 }}>partial</div></div>
              <div><div className="mono" style={{ fontSize: 22, fontWeight: 650, color: 'var(--bad-text)' }}>{counts.Succeeded}</div><div className="muted" style={{ fontSize: 12 }}>succeeded</div></div>
            </div>
            {s.optOuts.length > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Opt-outs: {s.optOuts.join(', ')}</div>}
          </Card>
        </div>

        <Card title="Objectives">
          <div className="chips">{s.objectives.map((o) => <Badge key={o} tone="accent">{o}</Badge>)}</div>
        </Card>

        {active && (
          <Card title="Log attempt" icon={<Plus />}>
            <form onSubmit={log} className="stack" style={{ gap: 14 }}>
              <div className="form-grid">
                <label className="field"><span>Category</span><select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>{CATS.filter((c) => !s.optOuts.includes(c)).map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="field"><span>Technique</span><input className="input" value={technique} onChange={(e) => setTechnique(e.target.value)} placeholder="e.g. Forged reviewer handoff" required /></label>
                <label className="field"><span>Entry point</span><select className="select" value={entry} onChange={(e) => setEntry(e.target.value as EntryPoint)}>{app.threatModel.entryPoints.map((x) => <option key={x}>{x}</option>)}</select></label>
                <label className="field"><span>Outcome</span><select className="select" value={outcome} onChange={(e) => setOutcome(e.target.value as Attempt['outcome'])}><option>Defended</option><option>Partial</option><option>Succeeded</option></select></label>
              </div>
              <label className="field"><span>Observation (summary only — raw transcript is captured to restricted storage)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <div><button className="btn primary" type="submit"><Plus />Log attempt</button></div>
            </form>
          </Card>
        )}

        <Card title="Attempt log" pad={false}>
          <table className="table">
            <thead><tr><th>#</th><th>When</th><th>Tester</th><th>Category</th><th>Technique</th><th>Entry</th><th>Outcome</th><th>Observation</th><th /></tr></thead>
            <tbody>
              {s.attempts.length === 0 && <tr><td colSpan={9} className="empty">No attempts logged yet.</td></tr>}
              {[...s.attempts].reverse().map((a) => (
                <tr key={a.id}>
                  <td className="mono muted">{a.id}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{fmtDateTime(a.at)}</td>
                  <td>{a.tester}</td><td>{a.category}</td><td>{a.technique}</td><td className="dim">{a.entry}</td>
                  <td><Badge tone={a.outcome === 'Defended' ? 'good' : a.outcome === 'Partial' ? 'warn' : 'bad'}>{a.outcome}</Badge></td>
                  <td className="dim" style={{ maxWidth: 280 }}>{a.note}</td>
                  <td style={{ textAlign: 'right' }}>
                    {a.findingId ? <Link className="mono" to={`/findings?open=${a.findingId}`}>{a.findingId}</Link>
                      : a.outcome !== 'Defended' && <button className="btn sm" onClick={() => setFindingFor(a)}><Bug size={14} />Create finding</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      {findingFor && (
        <LogFindingModal onClose={() => setFindingFor(null)}
          preset={{ appId: app.id, title: `${findingFor.technique} (${findingFor.category.toLowerCase()})`, severity: findingFor.outcome === 'Succeeded' ? 'High' : 'Medium', category: findingFor.category, source: 'Manual exercise', sourceRef: `${s.id} · ${findingFor.id}`, evidence: findingFor.note }}
          attempt={{ sessionId: s.id, attemptId: findingFor.id }} />
      )}
    </>
  );
}
