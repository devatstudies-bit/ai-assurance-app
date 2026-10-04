import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FlaskConical, ShieldCheck, Lock } from 'lucide-react';
import { useStore } from '../store/store';
import { Badge, Card, Chips, Locked, Modal, PageHead, useToast } from '../components/ui';
import { can } from '../domain/framework';
import { fmtDate } from '../domain/util';

const SAFETY = [
  ['Authorization', 'No red teaming without written authorization naming the application, environment, period and testers'],
  ['Environment', 'Sandbox or staging only, with synthetic data; never production data or real customer accounts'],
  ['Attack material', 'Seeds and transcripts stored in a restricted area with access logging'],
  ['Harmful content', 'Testers can opt out of harmful content categories; assignments rotate; support available'],
];

export default function ManualTesting() {
  const { state } = useStore();
  const [plan, setPlan] = useState(false);
  const allowed = can(state.role, 'manualTesting');
  const name = (id: string) => state.applications.find((a) => a.id === id)?.name ?? id;

  return (
    <>
      <PageHead title="Manual testing workspace" sub="Time-boxed expert exercises by authorized testers against sandboxed targets, with every attempt logged."
        actions={allowed && <button className="btn primary" onClick={() => setPlan(true)}><Plus />Plan exercise</button>} />
      {!allowed ? (
        <Locked>The manual testing workspace is available to Security analysts and authorized testers.<br />Switch role in the top bar to preview it.</Locked>
      ) : (
        <div className="stack">
          <div className="grid-3">
            {state.sessions.map((s) => (
              <Link key={s.id} to={`/manual/${s.id}`} className="card card-pad" style={{ color: 'inherit', textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="between"><span className="mono muted">{s.id}</span><Badge tone={s.status === 'Active' ? 'accent' : s.status === 'Completed' ? 'good' : ''}>{s.status}</Badge></div>
                <div style={{ fontWeight: 650, fontSize: 15 }}>{s.title}</div>
                <div className="dim" style={{ fontSize: 13 }}>{name(s.appId)} · {fmtDate(s.start)} – {fmtDate(s.end)}</div>
                <div className="chips">{s.objectives.slice(0, 3).map((o) => <Badge key={o}>{o}</Badge>)}{s.objectives.length > 3 && <Badge>+{s.objectives.length - 3}</Badge>}</div>
                <div className="between" style={{ borderTop: '1px solid var(--border)', paddingTop: 10, fontSize: 12.5 }}>
                  <span className="muted">{s.testers.length} tester{s.testers.length === 1 ? '' : 's'}</span>
                  <span className="muted">{s.attempts.length} attempts · {s.attempts.filter((a) => a.findingId).length} findings</span>
                </div>
              </Link>
            ))}
          </div>
          <Card title="Rules of engagement" icon={<ShieldCheck />} pad={false}>
            <table className="table compact">
              <tbody>{SAFETY.map(([a, r]) => <tr key={a}><td style={{ fontWeight: 600, width: 170 }}>{a}</td><td className="dim">{r}</td></tr>)}</tbody>
            </table>
          </Card>
        </div>
      )}
      {plan && <PlanModal onClose={() => setPlan(false)} />}
    </>
  );
}

function PlanModal({ onClose }: { onClose: () => void }) {
  const { state, api } = useStore();
  const toast = useToast();
  const [appId, setAppId] = useState(state.applications[0].id);
  const auths = state.authorizations.filter((a) => a.appId === appId);
  const [auth, setAuth] = useState(auths[0]?.id ?? '');
  const [objectives, setObjectives] = useState('');
  const [opt, setOpt] = useState<string[]>([]);
  const app = state.applications.find((a) => a.id === appId)!;
  const a = state.authorizations.find((x) => x.id === auth && x.appId === appId);

  const save = async () => {
    const s = await api.createSession({ appId, authorizationId: a!.id, objectives: objectives.split('\n').map((x) => x.trim()).filter(Boolean), optOuts: opt });
    if (!s) return;
    toast(`Exercise ${s.id} planned`);
    onClose();
  };

  return (
    <Modal title="Plan expert exercise" onClose={onClose} width={640} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!a || !objectives.trim()} onClick={save}>Create exercise</button></>}>
      <div className="form-grid">
        <label className="field"><span>Application</span><select className="select" value={appId} onChange={(e) => { setAppId(e.target.value); setAuth(state.authorizations.find((x) => x.appId === e.target.value)?.id ?? ''); }}>{state.applications.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="field"><span>Written authorization</span>
          <select className="select" value={auth} onChange={(e) => setAuth(e.target.value)} disabled={!auths.length}>
            {auths.length ? auths.map((x) => <option key={x.id} value={x.id}>{x.id} · {x.environment}, {fmtDate(x.from)}–{fmtDate(x.to)}</option>) : <option>None on file</option>}
          </select>
        </label>
      </div>
      {a ? <div className="callout info"><Lock /><span>Target resolved from the registry: <span className="mono">{app.sandbox}</span> ({a.environment}). Approved by {a.approvedBy}. Testers: {a.testers.join(', ')}.</span></div>
        : <div className="callout bad"><Lock /><span>No written authorization on file for {app.name}. Red teaming cannot start without one naming the application, environment, period and testers.</span></div>}
      <label className="field"><span>Objectives (one per line)</span><textarea className="textarea" value={objectives} onChange={(e) => setObjectives(e.target.value)} placeholder={'Approval bypass through tool output\nCross-user leakage'} /></label>
      <div className="field"><span>Harmful content opt-outs</span><Chips options={['Self-harm', 'Violence', 'Sexual', 'Hate and unfairness']} value={opt} onChange={setOpt} /></div>
      <div className="muted" style={{ fontSize: 12 }}><FlaskConical size={12} style={{ verticalAlign: -1 }} /> Plan → Prepare → Test → Triage → Report → Retest</div>
    </Modal>
  );
}
