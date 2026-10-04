import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, GitCompare, Radar, Grid3x3, Swords, Gauge, CircleX, Lock, LoaderCircle } from 'lucide-react';
import { useStore } from '../store/store';
import { Badge, Card, Kpi, Locked, PageHead, useToast } from '../components/ui';
import { HeatLegend, Heatmap } from '../components/charts';
import { can } from '../domain/framework';
import { asr } from '../domain/gate';
import type { Scan } from '../domain/types';
import { fmtDateTime } from '../domain/util';

export default function ScanDetail() {
  const { id } = useParams();
  const { state } = useStore();
  const toast = useToast();
  const scan = state.scans.find((s) => s.id === id);
  const [compare, setCompare] = useState(false);
  if (!scan) return <div className="empty">Scan not found. <Link to="/scans">All scans</Link></div>;
  const app = state.applications.find((a) => a.id === scan.appId)!;
  const t = state.thresholds[app.tier];
  const prev = state.scans.find((s) => s.appId === scan.appId && s.status === 'Completed' && s.startedAt < scan.startedAt);

  const download = () => {
    // Report contains rates and summaries only, never raw attack content
    const { scenarios, ...rest } = scan;
    const blob = new Blob([JSON.stringify({ ...rest, scenarios: scenarios.map(({ id, name, entry, defended, findingId }) => ({ id, name, entry, defended, findingId })) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${scan.id}-report.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`${scan.id} report downloaded`);
  };

  const head = (
    <PageHead
      crumbs={<><Link to={`/applications/${app.id}`}>{app.name}</Link><span>/</span><Link to="/scans">Red team scans</Link><span>/</span><span className="mono">{scan.id}</span></>}
      title={`Automated scan ${scan.id}`}
      actions={scan.status === 'Completed' && <>
        {prev && <button className={`btn ${compare ? 'primary' : ''}`} onClick={() => setCompare((c) => !c)}><GitCompare />{compare ? 'Hide comparison' : `Compare with ${prev.version} scan`}</button>}
        <button className="btn" onClick={download}><Download />Download report</button>
      </>}
    >
      <div className="facts">
        <span><b>Target</b>staging, {scan.version}</span>
        <span><b>Mode</b>{scan.mode}</span>
        <span><b>Started</b>{fmtDateTime(scan.startedAt)}</span>
        {scan.status === 'Completed' && <span><b>Duration</b>{scan.durationMin} min</span>}
        <span><b>Complexity</b>{scan.complexities.join(', ').toLowerCase()}</span>
        <span><b>Attack engine</b>{scan.attackModel}</span>
      </div>
    </PageHead>
  );

  if (scan.status === 'Running') {
    return (
      <>
        {head}
        <Card>
          <div className="stack" style={{ alignItems: 'center', padding: '30px 0', gap: 14 }}>
            <LoaderCircle size={30} className="spin" style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
            <div style={{ fontWeight: 650, fontSize: 16 }}>Generating attack objectives and scoring responses…</div>
            <div style={{ width: 'min(420px, 100%)' }}><div className="progress"><div style={{ width: `${scan.progress}%` }} /></div></div>
            <div className="muted">{scan.progress}% · {scan.strategies.length} strategy groups · {scan.complexities.length} complexity levels · target {app.sandbox}</div>
          </div>
        </Card>
        <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
      </>
    );
  }

  if (scan.status === 'Failed') {
    return (
      <>
        {head}
        <div className="callout bad"><CircleX /><span><b>Scan failed.</b> {scan.error ?? 'The red team engine returned an error.'} No results were recorded and the gate still uses the previous scan of record.</span></div>
      </>
    );
  }

  const v = asr(scan);
  const worst = [...scan.heat].sort((a, b) => b.overall - a.overall)[0];
  const opened = state.findings.filter((f) => f.sourceRef.includes(scan.id));
  const defended = scan.scenarios.filter((s) => s.defended).length;
  const breaches = scan.scenarios.filter((s) => !s.defended);
  const maxCx = Math.max(5, ...Object.values(scan.byComplexity).map((x) => x ?? 0));

  return (
    <>
      {head}
      <div className="stack">
        <div className="kpis">
          <Kpi icon={<Radar />} label="Attack attempts" value={scan.attempts.toLocaleString()} note={`${scan.heat.length} categories, ${scan.strategies.length} strategy groups`} />
          <Kpi label="Successful" value={scan.successes} note={worst ? `Most in ${worst.category.toLowerCase()}` : undefined} />
          <Kpi label="Overall success rate" value={`${v.toFixed(1)}%`} note={`Limit ${t.maxAsrOverall}% for ${app.tier.toLowerCase()} risk`} tone={v > t.maxAsrOverall ? 'bad' : 'good'} />
          {worst && <Kpi label="Highest category" value={`${worst.overall.toFixed(1)}%`} note={`${worst.category}, limit ${t.maxAsrCategory}%`} tone={worst.overall > t.maxAsrCategory ? 'bad' : 'good'} />}
          <Kpi label="Findings opened" value={opened.length} note={opened.map((f) => `${f.severity.toLowerCase()}`).join(', ') || 'None'} />
        </div>

        {compare && prev && <Comparison scan={scan} prev={prev} />}

        <Card title="Attack success rate by category and strategy" icon={<Grid3x3 />} meta={<HeatLegend />}>
          <Heatmap scan={scan} limit={t.maxAsrCategory} />
          {scan.summary && <p style={{ margin: '12px 0 0', color: 'var(--text-2)', lineHeight: 1.55 }}>{scan.summary}</p>}
        </Card>

        <div className="grid-2">
          <Card title="Scenario attacks" icon={<Swords />} meta={scan.scenarios.length ? <span style={{ fontWeight: 650, color: defended === scan.scenarios.length ? 'var(--good-text)' : 'var(--bad-text)' }}>{defended} of {scan.scenarios.length} defended</span> : 'None in this scan'} pad={false}>
            {scan.scenarios.length === 0 ? <div className="empty">Scenario attacks are not required for {app.tier.toLowerCase()}-risk applications.</div> : (
              <table className="table compact">
                <thead><tr><th>Scenario</th><th>Entry point</th><th style={{ textAlign: 'right' }}>Result</th></tr></thead>
                <tbody>
                  {scan.scenarios.map((s) => (
                    <tr key={s.id}>
                      <td><span className="mono muted" style={{ fontSize: 12 }}>{s.id}</span> {s.name}{s.critical && <Badge tone="outline">critical</Badge>}</td>
                      <td className="dim">{s.entry}</td>
                      <td style={{ textAlign: 'right' }}>{s.defended ? <Badge tone="good">Defended</Badge> : <Badge tone="solid-bad">Breached</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <div className="stack">
            {breaches.map((b) => (
              <section key={b.id} className="card card-pad" style={{ borderColor: 'var(--bad)', borderWidth: 2, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="row"><Badge tone="solid-bad"><CircleX />Breached</Badge><span className="mono">{b.id}</span></div>
                <h3 style={{ fontSize: 16, fontWeight: 650 }}>{b.name}</h3>
                <dl className="dl">
                  <dt>Entry point</dt><dd>{b.entry}</dd>
                  {b.detection && <><dt>Detection</dt><dd>{b.detection}</dd></>}
                  {b.reproduced && <><dt>Reproduced</dt><dd>{b.reproduced}</dd></>}
                  {b.findingId && <><dt>Finding</dt><dd><Link to={`/findings?open=${b.findingId}`}>{b.findingId}</Link></dd></>}
                </dl>
                {can(state.role, 'viewAttackContent') ? (
                  <div className="callout"><Lock /><span>Transcript available in restricted storage: <span className="mono">restricted://redteam/transcripts/{scan.id}/{b.id}</span>. Access is logged.</span></div>
                ) : (
                  <Locked>The attack prompt and response are stored in restricted storage.<br />Security analysts and authorized testers can view them.
                    <button className="btn sm" style={{ marginTop: 6 }} onClick={() => toast('Transcript access requested from Security')}>Request transcript access</button></Locked>
                )}
              </section>
            ))}
            <Card title="Success rate by complexity" icon={<Gauge />}>
              <div className="barlist">
                {Object.entries(scan.byComplexity).map(([k, x]) => (
                  <div key={k} className="barrow" style={{ gridTemplateColumns: '90px minmax(0,1fr) 56px' }}>
                    <span>{k}</span>
                    <div className="bartrack" style={{ height: 14 }}><div className="barfill" style={{ width: `${((x ?? 0) / maxCx) * 100}%`, background: 'var(--heat-3)' }} /></div>
                    <span className="mono" style={{ textAlign: 'right' }}>{(x ?? 0).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Scale 0 to {maxCx.toFixed(0)}%.</div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function Comparison({ scan, prev }: { scan: Scan; prev: Scan }) {
  const cats = Array.from(new Set([...scan.heat.map((h) => h.category), ...prev.heat.map((h) => h.category)]));
  return (
    <Card title={`Change since ${prev.id} (${prev.version})`} icon={<GitCompare />} meta={`Overall ${asr(prev).toFixed(1)}% → ${asr(scan).toFixed(1)}%`} pad={false}>
      <table className="table compact">
        <thead><tr><th>Category</th><th className="num">{prev.version}</th><th className="num">{scan.version}</th><th className="num">Change</th></tr></thead>
        <tbody>
          {cats.map((c) => {
            const a = prev.heat.find((h) => h.category === c)?.overall;
            const b = scan.heat.find((h) => h.category === c)?.overall;
            const d = a !== undefined && b !== undefined ? b - a : undefined;
            return (
              <tr key={c}>
                <td>{c}</td><td className="num">{a !== undefined ? `${a.toFixed(1)}%` : '—'}</td><td className="num">{b !== undefined ? `${b.toFixed(1)}%` : '—'}</td>
                <td className="num" style={{ color: d === undefined || Math.abs(d) < 0.05 ? 'var(--text-3)' : d > 0 ? 'var(--bad-text)' : 'var(--good-text)', fontWeight: 600 }}>
                  {d === undefined ? '—' : Math.abs(d) < 0.05 ? 'no change' : `${d > 0 ? '▲ +' : '▼ '}${d.toFixed(1)} pts`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
