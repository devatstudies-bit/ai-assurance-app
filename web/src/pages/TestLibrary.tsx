import { useState } from 'react';
import { Lock, Database, ShieldCheck } from 'lucide-react';
import { useStore } from '../store/store';
import { Badge, Card, Kpi, PageHead } from '../components/ui';
import { can } from '../domain/framework';
import type { LibraryKind } from '../domain/types';
import { fmtDate } from '../domain/util';

const KINDS: LibraryKind[] = ['Golden dataset', 'Agent scenarios', 'Red team scenarios', 'Attack seeds', 'Canary set', 'Regression set'];

export default function TestLibrary() {
  const { state } = useStore();
  const [kind, setKind] = useState<LibraryKind | 'All'>('All');
  const items = state.library.filter((l) => kind === 'All' || l.kind === kind);
  const restrictedOk = can(state.role, 'viewAttackContent');
  const name = (id: string) => (id === 'shared' ? 'Shared (all applications)' : state.applications.find((a) => a.id === id)?.name ?? id);
  const closed = state.findings.filter((f) => f.status === 'Closed');

  return (
    <>
      <PageHead title="Test library" sub="Golden datasets, agent scenarios, red team scenarios, custom attack seeds and canary sets — all versioned." />
      <div className="stack">
        <div className="kpis">
          <Kpi icon={<Database />} label="Library items" value={state.library.length} note={`${state.library.reduce((a, l) => a + (l.items ?? 0), 0).toLocaleString()} test cases`} />
          <Kpi icon={<Lock />} label="Restricted" value={state.library.filter((l) => l.restricted).length} note="Attack material, access logged" />
          <Kpi icon={<ShieldCheck />} label="Regression tests" value={state.regressionTests.length} note={`${closed.filter((f) => f.regressionTestId).length} of ${closed.length} closed findings covered`} tone="good" />
          <Kpi label="Apps with golden set" value={`${new Set(state.library.filter((l) => l.kind === 'Golden dataset' || l.kind === 'Agent scenarios').map((l) => l.appId)).size} / ${state.applications.length}`} note="Dataset coverage" />
        </div>

        <div className="tabs" role="tablist">
          {(['All', ...KINDS] as const).map((k) => (
            <button key={k} className={`tab ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)} role="tab" aria-selected={kind === k}>
              {k}<span className="n">{k === 'All' ? state.library.length : state.library.filter((l) => l.kind === k).length}</span>
            </button>
          ))}
        </div>

        {!restrictedOk && items.some((l) => l.restricted) && (
          <div className="callout"><Lock /><span>Restricted items (attack scenarios, seeds and canaries) are listed by name only. Contents are visible to Security analysts and authorized testers.</span></div>
        )}

        <Card pad={false}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>ID</th><th>Name</th><th>Kind</th><th>Application</th><th className="num">Version</th><th className="num">Items</th><th>Coverage</th><th>Location</th><th>Updated</th></tr></thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id}>
                    <td className="mono muted">{l.id}</td>
                    <td style={{ fontWeight: 550 }}>{l.name} {l.restricted && <Lock size={12} style={{ verticalAlign: -1, color: 'var(--text-3)' }} aria-label="Restricted" />}</td>
                    <td><Badge tone={l.restricted ? 'serious' : l.kind === 'Regression set' ? 'good' : 'accent'}>{l.kind}</Badge></td>
                    <td className="dim">{name(l.appId)}</td>
                    <td className="num">v{l.version}</td>
                    <td className="num">{l.items ?? '•••'}</td>
                    <td className="dim">{l.coverage}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{l.restricted && !restrictedOk ? 'restricted://…' : l.path}</td>
                    <td className="mono muted" style={{ fontSize: 12.5 }}>{fmtDate(l.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {(kind === 'All' || kind === 'Regression set') && (
          <Card title="Regression tests from closed findings" icon={<ShieldCheck />} meta="Run on every release as part of evaluation" pad={false}>
            <table className="table compact">
              <thead><tr><th>Test</th><th>Title</th><th>Application</th><th>From finding</th><th>Added</th></tr></thead>
              <tbody>
                {state.regressionTests.map((r) => (
                  <tr key={r.id}><td className="mono">{r.id}</td><td>{r.title}</td><td className="dim">{name(r.appId)}</td><td className="mono">{r.findingId}</td><td className="mono muted">{fmtDate(r.addedAt)}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  );
}
