import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/store';
import { Badge, Card, PageHead } from '../components/ui';
import type { RunRecord } from '../domain/types';
import { fmtDateTime } from '../domain/util';

const KINDS: RunRecord['kind'][] = ['Release gate', 'Evaluation', 'Release scan', 'Developer scan', 'Scheduled scan', 'Manual exercise', 'Online evaluation'];

export default function RunHistory() {
  const { state } = useStore();
  const [params, setParams] = useSearchParams();
  const app = params.get('app') ?? 'all';
  const kind = params.get('kind') ?? 'all';
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v === 'all') p.delete(k); else p.set(k, v); setParams(p); };
  const runs = state.runs
    .filter((r) => (app === 'all' || r.appId === app) && (kind === 'all' || r.kind === kind))
    .sort((a, b) => b.at.localeCompare(a.at));
  const name = (id: string) => state.applications.find((a) => a.id === id)?.name ?? id;

  const refLink = (r: RunRecord) => {
    if (!r.ref) return null;
    if (r.ref.startsWith('RT-')) return <Link to={`/scans/${r.ref}`} className="mono">{r.ref}</Link>;
    if (r.ref.startsWith('EX-')) return <Link to={`/manual/${r.ref}`} className="mono">{r.ref}</Link>;
    if (r.ref.startsWith('EV-')) return <Link to={`/evaluations/${r.ref}`} className="mono">{r.ref}</Link>;
    return <span className="mono">{r.ref}</span>;
  };

  return (
    <>
      <PageHead title="Run history" sub="All evaluation runs, red team scans, gate decisions and manual exercises with versions, results and evidence."
        actions={<>
          <select className="select" style={{ width: 'auto' }} value={app} onChange={(e) => set('app', e.target.value)} aria-label="Application">
            <option value="all">All applications</option>{state.applications.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="select" style={{ width: 'auto' }} value={kind} onChange={(e) => set('kind', e.target.value)} aria-label="Run type">
            <option value="all">All run types</option>{KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
        </>} />
      <Card pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Run</th><th>When</th><th>Application</th><th>Type</th><th>Version</th><th>Detail</th><th>Evidence</th><th>Result</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="mono muted">{r.id}</td>
                  <td className="mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDateTime(r.at)}</td>
                  <td><Link to={`/applications/${r.appId}`}>{name(r.appId)}</Link></td>
                  <td>{r.kind}</td>
                  <td className="mono">{r.version}</td>
                  <td className="dim">{r.detail}</td>
                  <td>{refLink(r)}</td>
                  <td><Badge tone={r.result === 'Blocked' || r.result === 'Alert' ? 'bad' : r.result === 'Running' ? 'accent' : 'good'}>{r.result}</Badge></td>
                </tr>
              ))}
              {runs.length === 0 && <tr><td colSpan={8} className="empty">No runs match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
