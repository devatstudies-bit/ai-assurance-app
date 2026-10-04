import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Radar } from 'lucide-react';
import { useStore } from '../store/store';
import { Badge, Card, Kpi, PageHead } from '../components/ui';
import NewScanModal from '../components/NewScanModal';
import { can, RISK_CATEGORIES, STRATEGY_GROUPS } from '../domain/framework';
import { asr } from '../domain/gate';
import { fmtDateTime } from '../domain/util';

export default function Scans() {
  const { state } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const scans = [...state.scans].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const done = scans.filter((s) => s.status === 'Completed');
  const attempts = done.reduce((a, s) => a + s.attempts, 0);
  const successes = done.reduce((a, s) => a + s.successes, 0);
  const cats = new Set(done.flatMap((s) => s.heat.map((h) => h.category)));

  return (
    <>
      <PageHead title="Red team scans" sub="Automated scans run by the AI Red Teaming Agent across risk categories, attack strategies and complexity levels."
        actions={can(state.role, 'runScans') && <button className="btn primary" onClick={() => setOpen(true)}><Play />New scan</button>} />
      <div className="stack">
        <div className="kpis">
          <Kpi icon={<Radar />} label="Scans" value={scans.length} note={`${scans.filter((s) => s.status === 'Running').length} running`} />
          <Kpi label="Attack attempts" value={attempts.toLocaleString()} note="Across completed scans" />
          <Kpi label="Overall success rate" value={`${attempts ? ((successes / attempts) * 100).toFixed(1) : 0}%`} note={`${successes} successful attempts`} />
          <Kpi label="Category coverage" value={`${cats.size} / ${RISK_CATEGORIES.length}`} note={`${STRATEGY_GROUPS.length} strategy groups`} />
        </div>
        <Card pad={false}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Scan</th><th>Application</th><th>Version</th><th>Mode</th><th>Started</th><th>Complexity</th><th className="num">Attempts</th><th className="num">ASR</th><th className="num">Canary leaks</th><th>Status</th></tr></thead>
              <tbody>
                {scans.map((s) => {
                  const app = state.applications.find((a) => a.id === s.appId)!;
                  const v = s.status === 'Completed' ? asr(s) : 0;
                  const over = v > state.thresholds[app.tier].maxAsrOverall;
                  return (
                    <tr key={s.id} className="click" onClick={() => navigate(`/scans/${s.id}`)}>
                      <td className="mono"><Link to={`/scans/${s.id}`} onClick={(e) => e.stopPropagation()}>{s.id}</Link></td>
                      <td>{app.name}</td>
                      <td className="mono">{s.version}</td>
                      <td>{s.mode}</td>
                      <td className="mono" style={{ fontSize: 12.5 }}>{fmtDateTime(s.startedAt)}</td>
                      <td className="dim">{s.complexities.join(', ')}</td>
                      <td className="num">{s.status === 'Completed' ? s.attempts.toLocaleString() : '—'}</td>
                      <td className="num" style={{ color: over ? 'var(--bad-text)' : undefined, fontWeight: over ? 650 : 400 }}>{s.status === 'Completed' ? `${v.toFixed(1)}%` : '—'}</td>
                      <td className="num" style={{ color: s.canaryLeaks ? 'var(--bad-text)' : undefined }}>{s.status === 'Completed' ? s.canaryLeaks : '—'}</td>
                      <td>{s.status === 'Running'
                        ? <div style={{ width: 110 }}><div className="progress"><div style={{ width: `${s.progress}%` }} /></div><span className="muted" style={{ fontSize: 11.5 }}>{s.progress}%</span></div>
                        : s.status === 'Failed' ? <Badge tone="bad" title={s.error ?? ''}>Failed</Badge> : <Badge tone="good">Completed</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      {open && <NewScanModal onClose={() => setOpen(false)} />}
    </>
  );
}
