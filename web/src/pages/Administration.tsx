import { useState } from 'react';
import { SlidersHorizontal, Users, CalendarClock, RotateCcw, Lock, Layers } from 'lucide-react';
import { useStore } from '../store/store';
import { Badge, Card, Chips, Modal, PageHead, TierBadge, useToast } from '../components/ui';
import { can, COMPLEXITIES, ROLES, SEVERITIES, SEVERITY_INFO, TIER_INFO } from '../domain/framework';
import type { GateThresholds, RiskTier } from '../domain/types';

const TIERS: RiskTier[] = ['Low', 'Medium', 'High'];

const CADENCE = [
  ['Evaluation and automated scan', 'Every release'], ['Scheduled automated scan', 'Weekly for high risk; monthly for medium; quarterly for low'],
  ['Online evaluation', 'Continuous'], ['Manual expert exercise', 'Before launch and at least twice a year for high risk'],
  ['Threat model review', 'On major change and at least yearly'], ['Judge and scoring calibration', 'Quarterly'], ['Program review with governance', 'Quarterly'],
];

export default function Administration() {
  const { state, api } = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<'gate' | 'tiers' | 'roles' | 'cadence'>('gate');
  const [reset, setReset] = useState(false);
  const editable = can(state.role, 'editThresholds');
  const upd = (tier: RiskTier, patch: Partial<GateThresholds>) => void api.updateThresholds(tier, patch);

  const num = (tier: RiskTier, key: 'maxAsrOverall' | 'maxAsrCategory') => (
    <input type="number" step="0.5" min="0" className="input mono" style={{ height: 32, width: 86, textAlign: 'right' }} disabled={!editable}
      value={state.thresholds[tier][key]} onChange={(e) => upd(tier, { [key]: Number(e.target.value) })} aria-label={`${tier} ${key}`} />
  );

  return (
    <>
      <PageHead title="Administration" sub="Profiles, thresholds, risk tiers, roles and cadence. Thresholds are tuned during onboarding, then locked through governance."
        actions={<button className="btn" onClick={() => setReset(true)}><RotateCcw />Reset sample data</button>} />
      <div className="tabs" role="tablist">
        {([['gate', 'Gate thresholds', <SlidersHorizontal size={15} />], ['tiers', 'Risk tiers & severity', <Layers size={15} />], ['roles', 'Roles and access', <Users size={15} />], ['cadence', 'Cadence', <CalendarClock size={15} />]] as const).map(([k, l, i]) => (
          <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)} role="tab" aria-selected={tab === k}>{i}{l}</button>
        ))}
      </div>

      {tab === 'gate' && (
        <div className="stack">
          {!editable && <div className="callout"><Lock /><span>Gate thresholds are maintained by the AI platform and approved by the governance board. You are viewing as {state.role}.</span></div>}
          <Card pad={false} title="Unified release gate" meta="Changes apply immediately to every application in the tier">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Criterion</th>{TIERS.map((t) => <th key={t}><TierBadge t={t} /></th>)}</tr></thead>
                <tbody>
                  <tr><td>Overall attack success rate ≤ (%)</td>{TIERS.map((t) => <td key={t}>{num(t, 'maxAsrOverall')}</td>)}</tr>
                  <tr><td>Attack success rate in any single category ≤ (%)</td>{TIERS.map((t) => <td key={t}>{num(t, 'maxAsrCategory')}</td>)}</tr>
                  <tr><td>Automated scan complexity</td>{TIERS.map((t) => <td key={t}>{editable
                    ? <Chips options={COMPLEXITIES} value={state.thresholds[t].complexity} onChange={(v) => upd(t, { complexity: v })} />
                    : state.thresholds[t].complexity.join(', ')}</td>)}</tr>
                  <tr><td>Scenario-based attacks</td>{TIERS.map((t) => <td key={t}><select className="select" style={{ height: 32 }} disabled={!editable} value={state.thresholds[t].scenarios} onChange={(e) => upd(t, { scenarios: e.target.value as GateThresholds['scenarios'] })}><option>Not required</option><option>Critical defended</option><option>All defended</option></select></td>)}</tr>
                  <tr><td>Agent consistency pass^k ≥ (%)</td>{TIERS.map((t) => <td key={t} className="mono">{state.thresholds[t].passK ?? 'Profile thresholds'}</td>)}</tr>
                  <tr><td>Content safety defects on golden set</td>{TIERS.map((t) => <td key={t} className="mono">0%</td>)}</tr>
                  <tr><td>Canary leakage <Badge tone="outline">fixed</Badge></td>{TIERS.map((t) => <td key={t} className="mono">{state.thresholds[t].canaryLeaks}</td>)}</tr>
                  <tr><td>Open critical / high findings</td>{TIERS.map((t) => <td key={t} className="mono">{state.thresholds[t].openHigh === null ? '0 critical' : '0 / 0'}</td>)}</tr>
                  <tr><td>Manual expert test</td>{TIERS.map((t) => <td key={t}>{state.thresholds[t].manualTest}</td>)}</tr>
                  <tr><td>Sign-off</td>{TIERS.map((t) => <td key={t} className="dim">{state.thresholds[t].signOff.join(' and ')}</td>)}</tr>
                </tbody>
              </table>
            </div>
          </Card>
          <div className="callout info"><span>Attack success thresholds are deliberately not zero for generic categories: automated scoring has some false positives and some strategies will always partially succeed. Canary leakage and actions without approval are held to zero because their impact is direct.</span></div>
        </div>
      )}

      {tab === 'tiers' && (
        <div className="stack">
          <Card pad={false} title="Risk tiers" meta="Set during design; drives the depth of every later stage">
            <table className="table">
              <thead><tr><th>Tier</th><th>Typical applications</th><th>Evaluation</th><th>Red teaming</th><th className="num">Apps</th></tr></thead>
              <tbody>{TIERS.map((t) => <tr key={t}><td><TierBadge t={t} /></td><td className="dim">{TIER_INFO[t].typical}</td><td className="dim">{TIER_INFO[t].evaluation}</td><td className="dim">{TIER_INFO[t].redTeam}</td><td className="num">{state.applications.filter((a) => a.tier === t).length}</td></tr>)}</tbody>
            </table>
          </Card>
          <Card pad={false} title="Finding severity and fix deadlines">
            <table className="table">
              <thead><tr><th>Severity</th><th>Definition</th><th>Fix deadline</th></tr></thead>
              <tbody>{SEVERITIES.map((s) => <tr key={s}><td><Badge tone={s === 'Critical' ? 'solid-bad' : s === 'High' ? 'serious' : s === 'Medium' ? 'warn' : ''}>{s}</Badge></td><td className="dim">{SEVERITY_INFO[s].definition}</td><td>{SEVERITY_INFO[s].deadline}</td></tr>)}</tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === 'roles' && (
        <Card pad={false} title="Roles and access" meta="Use the role switcher in the top bar to preview each role">
          <table className="table">
            <thead><tr><th>Role</th><th>Access</th><th>Sample user</th></tr></thead>
            <tbody>{ROLES.map((r) => <tr key={r.role} style={r.role === state.role ? { background: 'var(--accent-soft)' } : undefined}><td style={{ fontWeight: 600 }}>{r.role} {r.role === state.role && <Badge tone="accent">you</Badge>}</td><td className="dim">{r.access}</td><td>{r.person}</td></tr>)}</tbody>
          </table>
        </Card>
      )}

      {tab === 'cadence' && (
        <Card pad={false} title="Cadence">
          <table className="table"><thead><tr><th>Activity</th><th>Frequency</th></tr></thead>
            <tbody>{CADENCE.map(([a, f]) => <tr key={a}><td style={{ fontWeight: 550 }}>{a}</td><td className="dim">{f}</td></tr>)}</tbody>
          </table>
        </Card>
      )}

      {reset && (
        <Modal title="Reset sample data?" onClose={() => setReset(false)} footer={<><button className="btn" onClick={() => setReset(false)}>Cancel</button><button className="btn danger" onClick={async () => { setReset(false); await api.reset(); toast('Sample data restored'); }}>Reset</button></>}>
          <p style={{ margin: 0 }}>This discards every change stored in the database (findings moved, scans run, thresholds edited) for all users and restores the original sample data.</p>
        </Modal>
      )}
    </>
  );
}
