import { Link, useNavigate, useParams } from 'react-router-dom';
import { Printer, Download, FileCheck, CircleCheck, CircleX } from 'lucide-react';
import { useApp, useGate, useStore } from '../store/store';
import { Badge, CritBadge, GateBadge, PageHead, SeverityBadge, TierBadge, FindingStatusBadge, useToast } from '../components/ui';
import { asr } from '../domain/gate';
import { fmtDate, fmtDateLong, fmtDateTime } from '../domain/util';

export default function EvidencePacks() {
  const { id } = useParams();
  const { state } = useStore();
  const navigate = useNavigate();
  const app = useApp(id ?? state.applications[0].id)!;
  const gate = useGate(app)!;
  const toast = useToast();
  const scan = state.scans.find((s) => s.id === app.release.scanId);
  const evalRun = state.evaluations.find((r) => r.id === app.release.evaluationRunId);
  const findings = state.findings.filter((f) => f.appId === app.id);
  const runs = state.runs.filter((r) => r.appId === app.id).slice(0, 8);
  const regs = state.regressionTests.filter((r) => r.appId === app.id);
  const t = state.thresholds[app.tier];

  const exportJson = () => {
    const pack = {
      generatedAt: new Date().toISOString(), generatedBy: state.user,
      application: { id: app.id, name: app.name, type: app.type, tier: app.tier, owner: app.owner, ecMember: app.ecMember },
      release: { ...app.release },
      gate: { passed: gate.passed, criteria: gate.criteria },
      scan: scan && { id: scan.id, attempts: scan.attempts, successes: scan.successes, asr: asr(scan), categories: scan.heat.map((h) => ({ category: h.category, asr: h.overall })), canaryLeaks: scan.canaryLeaks, scenarios: scan.scenarios.map((s) => ({ id: s.id, defended: s.defended })) },
      findings: findings.map(({ history: _h, evidence: _e, ...f }) => f),
      regressionTests: regs, approvals: app.release.signOffs, thresholds: t,
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }));
    a.download = `evidence-${app.id}-${app.release.version}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Evidence pack exported');
  };

  return (
    <>
      <PageHead title="Evidence packs" sub="One-click release evidence for governance and audit: gate decision, metrics, scans, findings and approvals."
        actions={<>
          <select className="select no-print" style={{ width: 'auto' }} value={app.id} onChange={(e) => navigate(`/evidence/${e.target.value}`)} aria-label="Application">
            {state.applications.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button className="btn no-print" onClick={() => window.print()}><Printer />Print / PDF</button>
          <button className="btn primary no-print" onClick={exportJson}><Download />Export JSON</button>
        </>} />

      <article className="card" style={{ padding: '32px 36px', display: 'flex', flexDirection: 'column', gap: 26 }}>
        <header className="between" style={{ alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 20 }}>
          <div>
            <div className="row muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}><FileCheck size={14} />Release evidence pack</div>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{app.name} {app.release.version}</h2>
            <div className="row" style={{ marginTop: 8 }}><TierBadge t={app.tier} /><Badge>{app.type}</Badge><Badge>Owner: {app.owner}</Badge></div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12.5 }} className="muted">
            Generated {fmtDateTime(new Date().toISOString())}<br />by {state.user} ({state.role})<br />Pipeline {app.release.pipeline}
          </div>
        </header>

        <section className={`gate ${gate.passed ? 'passed' : 'blocked'}`} style={{ boxShadow: 'none' }}>
          <div className="gate-title"><div className="left"><span className="gate-chip">{gate.passed ? <CircleCheck /> : <CircleX />}{gate.passed ? 'Gate passed' : 'Gate blocked'}</span>
            <h2 style={{ fontSize: 17 }}>{gate.passed ? `All ${gate.evaluated} criteria passed` : `${gate.failed.length} of ${gate.evaluated} criteria failed`}</h2></div>
            <span className="muted" style={{ fontSize: 12.5 }}>Evaluated {fmtDateTime(app.release.date)}</span></div>
          <div className="facts"><span><b>Model</b>{app.release.model}</span><span><b>Prompt</b>{app.release.prompt}</span><span><b>Golden set</b>{app.release.goldenSet}</span><span><b>Profile</b>{app.profile}</span>
            {evalRun && <span><b>Judge</b>{evalRun.judge.name}{evalRun.judge.modelVersion ? ` (${evalRun.judge.modelVersion})` : ''} · {evalRun.id}</span>}
            {scan && <span><b>Attack engine</b>{scan.attackModel}</span>}</div>
        </section>

        <Section n={1} title="Gate criteria">
          <table className="table compact">
            <thead><tr><th>Group</th><th>Criterion</th><th className="num">Result</th><th className="num">Limit</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
            <tbody>{gate.criteria.map((c) => <tr key={c.group + c.name}><td className="muted">{c.group}</td><td>{c.name}</td><td className="num">{c.result}</td><td className="num muted">{c.limit}</td><td style={{ textAlign: 'right' }}><CritBadge s={c.status} /></td></tr>)}</tbody>
          </table>
        </Section>

        {scan && scan.status === 'Completed' && (
          <Section n={2} title={`Automated red team scan ${scan.id}`}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>{scan.attempts.toLocaleString()} attempts · {asr(scan).toFixed(1)}% overall success · complexity {scan.complexities.join(', ').toLowerCase()} · {scan.canaryLeaks} canary leak{scan.canaryLeaks === 1 ? '' : 's'} · {scan.scenarios.filter((s) => s.defended).length} of {scan.scenarios.length} scenarios defended</div>
            <table className="table compact">
              <thead><tr><th>Category</th><th className="num">Attack success</th><th className="num">Limit</th></tr></thead>
              <tbody>{scan.heat.map((h) => <tr key={h.category}><td>{h.category}</td><td className="num" style={{ color: h.overall > t.maxAsrCategory ? 'var(--bad-text)' : undefined }}>{h.overall.toFixed(1)}%</td><td className="num muted">{t.maxAsrCategory}%</td></tr>)}</tbody>
            </table>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Raw attack prompts and responses are not included; they remain in restricted storage.</div>
          </Section>
        )}

        <Section n={3} title="Findings">
          <table className="table compact">
            <thead><tr><th>ID</th><th>Severity</th><th>Title</th><th>Status</th><th>Regression test</th></tr></thead>
            <tbody>
              {findings.map((f) => <tr key={f.id}><td className="mono">{f.id}</td><td><SeverityBadge s={f.severity} /></td><td>{f.title}</td><td><FindingStatusBadge s={f.status} /></td><td className="mono">{f.regressionTestId ?? '—'}</td></tr>)}
              {!findings.length && <tr><td colSpan={5} className="muted">No findings recorded.</td></tr>}
            </tbody>
          </table>
        </Section>

        <Section n={4} title="Run history">
          <table className="table compact">
            <tbody>{runs.map((r) => <tr key={r.id}><td className="mono muted" style={{ width: 90 }}>{fmtDate(r.at)}</td><td>{r.kind}, {r.version}</td><td className="dim">{r.detail}</td><td style={{ textAlign: 'right' }}>{r.result}</td></tr>)}</tbody>
          </table>
        </Section>

        <Section n={5} title="Approvals">
          <div className="row">
            {t.signOff.map((role) => {
              const s = app.release.signOffs.find((x) => x.role === role);
              return <Badge key={role} tone={s ? 'good' : ''}>{s ? <CircleCheck /> : null}{role}: {s ? `${s.by}, ${fmtDateLong(s.at)}` : 'pending'}</Badge>;
            })}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            Release status: <GateBadge passed={gate.passed} /> {gate.passed && app.release.signOffs.length >= t.signOff.length ? 'Approved for release.' : 'Not yet approved for release.'}
            {' '}<Link className="no-print" to={`/applications/${app.id}`}>Open application →</Link>
          </div>
        </Section>
      </article>
    </>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 style={{ fontSize: 15, fontWeight: 650, marginBottom: 10 }}><span className="muted mono" style={{ marginRight: 8 }}>{n}.</span>{title}</h3>
      {children}
    </section>
  );
}
