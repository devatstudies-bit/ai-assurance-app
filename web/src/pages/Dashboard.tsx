import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Boxes, ShieldAlert, Clock, GitPullRequestArrow, Target, CalendarClock, Activity, Bug } from 'lucide-react';
import { useStore } from '../store/store';
import { Card, GateBadge, Kpi, PageHead, TierBadge } from '../components/ui';
import { CountBars, TrendChart } from '../components/charts';
import { OPEN_STATUSES } from '../domain/framework';
import { asr } from '../domain/gate';
import { DAY, dueLabel, fmtDate } from '../domain/util';

export default function Dashboard() {
  const { state } = useStore();
  const navigate = useNavigate();
  const [trendApp, setTrendApp] = useState(state.applications[0]?.id);

  const rows = useMemo(() => state.applications.map((app) => {
    const scan = state.scans.find((s) => s.id === app.release.scanId);
    const gate = app.gate;
    const open = state.findings.filter((f) => f.appId === app.id && OPEN_STATUSES.includes(f.status));
    return { app, gate, asr: scan && scan.status === 'Completed' ? asr(scan) : undefined, critHigh: open.filter((f) => f.severity === 'Critical' || f.severity === 'High').length, open: open.length };
  }), [state]);

  const open = state.findings.filter((f) => OPEN_STATUSES.includes(f.status));
  const overdue = open.filter((f) => dueLabel(f.dueAt).overdue);
  const closed = state.findings.filter((f) => f.status === 'Closed');
  const withReg = closed.filter((f) => f.regressionTestId).length;
  const gates = state.runs.filter((r) => r.kind === 'Release gate');
  const passRate = gates.length ? Math.round((gates.filter((g) => g.result === 'Passed').length / gates.length) * 100) : 0;
  const assessed = state.applications.filter((a) => a.release.scanId).length;
  const portfolioAsr = rows.filter((r) => r.asr !== undefined).reduce((a, r, _, arr) => a + r.asr! / arr.length, 0);
  const mttf = closed.length ? closed.reduce((a, f) => a + (new Date(f.closedAt!).getTime() - new Date(f.openedAt).getTime()) / DAY, 0) / closed.length : 0;
  const prod = state.findings.filter((f) => f.foundIn === 'Production').length;

  const app = state.applications.find((a) => a.id === trendApp)!;
  const upcoming = [
    ...state.applications.map((a) => ({ at: a.nextScheduledScan, what: `Scheduled scan · ${a.name}`, kind: 'scan' })),
    ...state.applications.filter((a) => a.nextManualTest).map((a) => ({ at: a.nextManualTest!, what: `Manual exercise due · ${a.name}`, kind: 'manual' })),
    ...state.sessions.filter((s) => s.status === 'Planned').map((s) => ({ at: s.start, what: s.title, kind: 'manual' })),
  ].sort((a, b) => a.at.localeCompare(b.at)).slice(0, 6);

  return (
    <>
      <PageHead title="Assurance overview" sub="One answer to “is this application ready and safe?” across quality, safety and security." />
      <div className="stack">
        <div className="kpis">
          <Kpi icon={<Boxes />} label="Applications assessed" value={`${assessed} / ${state.applications.length}`} note="Registered with a scan of record" />
          <Kpi icon={<GitPullRequestArrow />} label="Gate pass rate" value={`${passRate}%`} note={`${gates.length} release gate runs`} />
          <Kpi icon={<Target />} label="Portfolio attack success" value={`${portfolioAsr.toFixed(1)}%`} note="Mean of latest scans" />
          <Kpi icon={<ShieldAlert />} label="Open critical / high" value={open.filter((f) => f.severity === 'Critical' || f.severity === 'High').length} note={`${open.length} open in total`} tone={open.some((f) => f.severity === 'Critical') ? 'bad' : undefined} />
          <Kpi icon={<Clock />} label="Overdue fixes" value={overdue.length} note={overdue.map((f) => f.id).join(', ') || 'None'} tone={overdue.length ? 'bad' : 'good'} />
          <Kpi icon={<Activity />} label="Closed with regression test" value={`${closed.length ? Math.round((withReg / closed.length) * 100) : 100}%`} note={`Mean time to fix ${mttf.toFixed(0)} days`} tone="good" />
        </div>

        <Card title="Application assurance status" icon={<Boxes />} meta="Quality index, attack success rate and open findings per application" pad={false}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Application</th><th>Risk</th><th>Stage</th><th className="num">Quality index</th><th className="num">Attack success</th><th className="num">Open crit/high</th><th>Release gate</th></tr>
              </thead>
              <tbody>
                {rows.map(({ app: a, gate, asr: v, critHigh }) => (
                  <tr key={a.id} className="click" onClick={() => navigate(`/applications/${a.id}`)}>
                    <td><div style={{ fontWeight: 600 }}>{a.name}</div><div className="muted" style={{ fontSize: 12 }}>{a.type} · {a.owner}</div></td>
                    <td><TierBadge t={a.tier} /></td>
                    <td className="dim">{a.stage}</td>
                    <td className="num">{a.qualityIndex}</td>
                    <td className="num" style={{ color: v !== undefined && v > state.thresholds[a.tier].maxAsrOverall ? 'var(--bad-text)' : undefined }}>{v !== undefined ? `${v.toFixed(1)}%` : '—'}</td>
                    <td className="num" style={{ color: critHigh ? 'var(--bad-text)' : undefined, fontWeight: critHigh ? 650 : 400 }}>{critHigh}</td>
                    <td><GateBadge passed={gate.passed} /> {!gate.passed && <span className="muted" style={{ fontSize: 12 }}>{gate.failed.length} failed</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid-2">
          <Card title="Attack success rate across releases" icon={<Target />} meta={
            <select className="select" style={{ height: 30, width: 'auto' }} value={trendApp} onChange={(e) => setTrendApp(e.target.value)} aria-label="Application">
              {state.applications.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          }>
            <TrendChart label={`Attack success rate by release for ${app.name}`} points={app.asrHistory.map((h) => ({ x: h.version, y: h.asr }))} limit={state.thresholds[app.tier].maxAsrOverall} />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Overall limit for {app.tier.toLowerCase()} risk: {state.thresholds[app.tier].maxAsrOverall}%. Whether defenses are improving release over release.</div>
          </Card>

          <div className="stack">
            <Card title="Open findings by severity" icon={<Bug />} meta={<Link to="/findings">Findings board</Link>}>
              <CountBars rows={(['Critical', 'High', 'Medium', 'Low'] as const).map((s) => ({
                name: s, value: open.filter((f) => f.severity === s).length,
                color: { Critical: 'var(--bad)', High: 'var(--serious)', Medium: 'var(--warn)', Low: 'var(--text-3)' }[s],
              }))} />
              <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>{prod} of {state.findings.length} findings were found in production; the rest before release.</div>
            </Card>
            <Card title="Coming up" icon={<CalendarClock />} pad={false}>
              <table className="table compact">
                <tbody>
                  {upcoming.map((u, i) => (
                    <tr key={i}><td className="mono muted" style={{ width: 80 }}>{fmtDate(u.at)}</td><td>{u.what}</td><td style={{ textAlign: 'right' }}><span className={`badge ${u.kind === 'manual' ? 'accent' : ''}`}>{u.kind === 'manual' ? 'Manual' : 'Automated'}</span></td></tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
