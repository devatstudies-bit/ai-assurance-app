import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Gavel, Play, ListChecks, CircleX, LoaderCircle, Bot, FileText } from 'lucide-react';
import { useStore } from '../store/store';
import { Badge, Card, CritBadge, Kpi, PageHead } from '../components/ui';
import { RunEvaluationModal } from '../components/ModelPicker';
import { can } from '../domain/framework';
import type { EvalRunMetric, EvaluationRun } from '../domain/types';
import { fmtDateTime } from '../domain/util';

const fmt = (m: { format: string }, v: number) => (m.format === 'pct' ? `${v}%` : m.format === 'ratio' ? v.toFixed(2) : v.toFixed(1));
const passes = (m: EvalRunMetric) => (m.op === '>=' ? m.value >= m.limit : m.value <= m.limit);

function StatusBadge({ r }: { r: EvaluationRun }) {
  if (r.status === 'Running') return <Badge tone="accent">Running {r.progress}%</Badge>;
  if (r.status === 'Failed') return <Badge tone="bad" title={r.error ?? ''}>Failed</Badge>;
  const failed = r.metrics.filter((m) => !passes(m)).length + (r.contentSafetyDefectPct ? 1 : 0);
  return failed ? <Badge tone="bad">{failed} below threshold</Badge> : <Badge tone="good">All within thresholds</Badge>;
}

export default function Evaluations() {
  const { state } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const runs = state.evaluations;
  const name = (id: string) => state.applications.find((a) => a.id === id)?.name ?? id;
  const judges = state.models.filter((m) => m.purpose === 'judge' && m.enabled);

  return (
    <>
      <PageHead title="Evaluations" sub="Golden-dataset evaluation runs. Judge metrics are scored by the selected judge model; deterministic metrics are computed in code."
        actions={can(state.role, 'runScans') && <button className="btn primary" onClick={() => setOpen(true)}><Play />Run evaluation</button>} />
      <div className="stack">
        <div className="kpis">
          <Kpi icon={<Gavel />} label="Evaluation runs" value={runs.length} note={`${runs.filter((r) => r.status === 'Running').length} running`} />
          <Kpi icon={<Bot />} label="Judge models available" value={judges.length} note={judges.map((j) => j.name).slice(0, 2).join(', ') + (judges.length > 2 ? '…' : '')} />
          <Kpi label="Judge calls (completed runs)" value={runs.reduce((a, r) => a + r.judgeCalls, 0).toLocaleString()} />
          <Kpi label="Failed runs" value={runs.filter((r) => r.status === 'Failed').length} tone={runs.some((r) => r.status === 'Failed') ? 'bad' : undefined} />
        </div>
        <Card pad={false}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Run</th><th>Application</th><th>Version</th><th>Mode</th><th>Judge</th><th>Dataset</th><th className="num">Cases</th><th>Started</th><th>Result</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="click" onClick={() => navigate(`/evaluations/${r.id}`)}>
                    <td className="mono"><Link to={`/evaluations/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.id}</Link></td>
                    <td>{name(r.appId)}</td>
                    <td className="mono">{r.version}</td>
                    <td>{r.mode}</td>
                    <td><span style={{ fontWeight: 550 }}>{r.judge.name}</span>{r.judge.modelVersion && <div className="muted mono" style={{ fontSize: 11 }}>{r.judge.modelVersion}</div>}</td>
                    <td className="mono muted" style={{ fontSize: 12 }}>{r.dataset}</td>
                    <td className="num">{r.cases || '—'}</td>
                    <td className="mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDateTime(r.startedAt)}</td>
                    <td><StatusBadge r={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      {open && <RunEvaluationModal onClose={() => setOpen(false)} />}
    </>
  );
}

export function EvaluationDetail() {
  const { id } = useParams();
  const { state, api } = useStore();
  const summary = state.evaluations.find((r) => r.id === id);
  const [detail, setDetail] = useState<EvaluationRun | null>(null);

  // Case-level results are loaded on demand; the snapshot only carries summaries
  useEffect(() => {
    if (!id || summary?.status !== 'Completed') return;
    let live = true;
    api.getEvaluation(id).then((d) => live && setDetail(d)).catch(() => {});
    return () => { live = false; };
  }, [id, summary?.status, api]);

  if (!summary) return <div className="empty">Evaluation not found. <Link to="/evaluations">All evaluations</Link></div>;
  const r = detail ?? summary;
  const app = state.applications.find((a) => a.id === r.appId)!;
  const judgeModel = state.models.find((m) => m.id === r.judgeModelId);
  const ofRecord = app.release.evaluationRunId === r.id;

  return (
    <>
      <PageHead crumbs={<><Link to={`/applications/${app.id}`}>{app.name}</Link><span>/</span><Link to="/evaluations">Evaluations</Link><span>/</span><span className="mono">{r.id}</span></>}
        title={`Evaluation ${r.id}`}>
        <div className="facts">
          <span><b>Release</b>{r.version}</span><span><b>Mode</b>{r.mode}</span><span><b>Profile</b>{r.profile}</span>
          <span><b>Dataset</b><span className="mono">{r.dataset}</span></span><span><b>Started</b>{fmtDateTime(r.startedAt)}</span>
          {ofRecord && <Badge tone="accent">Evaluation of record for {r.version}</Badge>}
        </div>
      </PageHead>
      <div className="stack">
        <Card title="Judge" icon={<Bot />}>
          <dl className="dl">
            <dt>Model</dt><dd><b>{r.judge.name}</b> · {judgeModel?.providerLabel ?? r.judge.provider}</dd>
            <dt>Deployment</dt><dd className="mono">{r.judge.deployment ?? '—'}{r.judge.modelVersion ? ` · ${r.judge.modelVersion}` : ''}</dd>
            <dt>Judge calls</dt><dd>{r.judgeCalls.toLocaleString()}</dd>
          </dl>
        </Card>

        {r.status === 'Running' && (
          <Card><div className="stack" style={{ alignItems: 'center', gap: 12, padding: '20px 0' }}>
            <LoaderCircle size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
            <div style={{ fontWeight: 600 }}>Scoring with {r.judge.name}…</div>
            <div style={{ width: 'min(420px, 100%)' }}><div className="progress"><div style={{ width: `${r.progress}%` }} /></div></div>
            <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
          </div></Card>
        )}
        {r.status === 'Failed' && <div className="callout bad"><CircleX /><span><b>Evaluation failed.</b> {r.error} The release keeps its previous evaluation of record.</span></div>}

        {r.status === 'Completed' && (
          <Card title="Metrics" icon={<ListChecks />} meta={`${r.cases || 'Simulated'} cases`} pad={false}>
            <table className="table">
              <thead><tr><th>Metric</th><th>Scored by</th><th className="num">Result</th><th className="num">Limit</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
              <tbody>
                {r.metrics.map((m) => (
                  <tr key={m.name}>
                    <td>{m.name}</td>
                    <td>{m.kind === 'judge' ? <Badge tone="accent"><Gavel />{r.judge.name}</Badge> : <Badge>Deterministic</Badge>}</td>
                    <td className="num" style={{ color: passes(m) ? undefined : 'var(--bad-text)', fontWeight: passes(m) ? 400 : 650 }}>{fmt(m, m.value)}</td>
                    <td className="num muted">{m.op === '>=' ? '≥' : '≤'} {fmt(m, m.limit)}</td>
                    <td style={{ textAlign: 'right' }}><CritBadge s={passes(m) ? 'Pass' : 'Fail'} /></td>
                  </tr>
                ))}
                {r.contentSafetyDefectPct !== null && (
                  <tr><td>Content safety defects</td><td><Badge tone="accent"><Gavel />{r.judge.name}</Badge></td><td className="num">{r.contentSafetyDefectPct}%</td><td className="num muted">0%</td><td style={{ textAlign: 'right' }}><CritBadge s={r.contentSafetyDefectPct === 0 ? 'Pass' : 'Fail'} /></td></tr>
                )}
                {r.passK !== null && (
                  <tr><td>Agent consistency (pass^k)</td><td><Badge tone="accent"><Gavel />{r.judge.name}</Badge></td><td className="num">{r.passK}%</td><td className="num muted">by tier</td><td /></tr>
                )}
              </tbody>
            </table>
          </Card>
        )}

        {r.status === 'Completed' && (
          <Card title="Case results" icon={<FileText />} meta={r.caseResults.length ? 'Judge reasons per case' : undefined} pad={false}>
            {!detail ? <div className="empty">Loading…</div> : detail.caseResults.length === 0
              ? <div className="empty">{r.judge.provider === 'simulated' ? 'The simulated judge does not score individual cases.' : 'No case-level results were recorded for this run.'}</div>
              : (
                <table className="table">
                  <thead><tr><th>Case</th><th>Query and response</th><th>Judge verdicts</th></tr></thead>
                  <tbody>
                    {detail.caseResults.map((c) => (
                      <tr key={c.id} style={{ verticalAlign: 'top' }}>
                        <td className="mono muted">{c.id}</td>
                        <td style={{ maxWidth: 420 }}><div style={{ fontWeight: 550 }}>{c.query}</div><div className="dim" style={{ fontSize: 12.5, marginTop: 4 }}>{c.response}</div></td>
                        <td>
                          {Object.entries(c.scores).map(([k, v]) => (
                            <div key={k} style={{ fontSize: 12.5, marginBottom: 6 }}>
                              <Badge tone={v.pass === false || (v.pass === null && v.value < 4) ? 'warn' : 'good'}>{k.replace(/_/g, ' ')}: {v.pass === null ? v.value : v.pass ? 'pass' : 'fail'}</Badge>
                              <div className="muted" style={{ marginTop: 2 }}>{v.reason}</div>
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </Card>
        )}
      </div>
    </>
  );
}
