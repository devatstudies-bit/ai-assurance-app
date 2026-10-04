import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import { useStore } from '../store/store';
import { Chips, Modal, TierBadge, useToast } from './ui';
import { ModelPicker } from './ModelPicker';
import { COMPLEXITIES, RISK_CATEGORIES, STRATEGY_GROUPS } from '../domain/framework';
import type { Complexity, ScanMode, StrategyGroup } from '../domain/types';

export default function NewScanModal({ appId, onClose }: { appId?: string; onClose: () => void }) {
  const { state, api } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [app, setApp] = useState(appId ?? state.applications[0].id);
  const a = state.applications.find((x) => x.id === app)!;
  const t = state.thresholds[a.tier];
  const agentic = a.type !== 'RAG assistant' && a.type !== 'Chat tool';
  const prev = state.scans.find((s) => s.appId === app && s.status === 'Completed');

  const [mode, setMode] = useState<ScanMode>('Release');
  const [attack, setAttack] = useState(state.models.find((m) => m.purpose === 'attack' && m.isDefault && m.enabled)?.id ?? '');
  const engine = state.models.find((m) => m.id === attack);
  const [cx, setCx] = useState<Complexity[]>(t.complexity);
  const [st, setSt] = useState<StrategyGroup[]>(STRATEGY_GROUPS.map((g) => g.name));
  const [cats, setCats] = useState<string[]>(prev?.heat.map((h) => h.category) ?? RISK_CATEGORIES.filter((c) => !c.agentOnly).slice(0, 6).map((c) => c.name));

  const switchApp = (id: string) => {
    setApp(id);
    const na = state.applications.find((x) => x.id === id)!;
    setCx(state.thresholds[na.tier].complexity);
    const p = state.scans.find((s) => s.appId === id && s.status === 'Completed');
    setCats(p?.heat.map((h) => h.category) ?? RISK_CATEGORIES.filter((c) => !c.agentOnly).slice(0, 6).map((c) => c.name));
  };

  const missing = mode === 'Release' ? t.complexity.filter((c) => !cx.includes(c)) : [];

  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    const scan = await api.startScan({ appId: app, attackModelId: attack, mode, complexities: cx, strategies: st, categories: cats });
    setBusy(false);
    if (!scan) return;
    toast(`Scan ${scan.id} started against ${a.sandbox}`);
    onClose();
    navigate(`/scans/${scan.id}`);
  };

  return (
    <Modal title="Start automated red team scan" onClose={onClose} width={720}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={start} disabled={busy || !attack || !cx.length || !st.length || !cats.length}><Play />Start scan</button></>}>
      <div className="form-grid">
        <label className="field"><span>Application</span>
          <select className="select" value={app} onChange={(e) => switchApp(e.target.value)}>{state.applications.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </label>
        <label className="field"><span>Mode</span>
          <select className="select" value={mode} onChange={(e) => setMode(e.target.value as ScanMode)}>
            <option value="Release">Release (scan of record for the gate)</option><option value="Developer">Developer (quick check)</option><option value="Scheduled">Scheduled</option>
          </select>
        </label>
      </div>
      <div className="callout info">
        <TierBadge t={a.tier} />
        <span>Target resolved from the registry: <span className="mono">{a.sandbox}</span> ({a.release.version}). Sandboxed, synthetic data only. Tier minimum complexity: {t.complexity.join(', ')}.</span>
      </div>
      <div className="field"><span>Attack engine</span><ModelPicker purpose="attack" value={attack} onChange={setAttack} /></div>
      {engine?.provider === 'azure-redteam-service' && <div className="muted" style={{ fontSize: 12 }}>The hosted agent generates attacks and scores responses in its Foundry project ({engine.endpoint}).</div>}
      <div className="field"><span>Complexity</span><Chips options={COMPLEXITIES} value={cx} onChange={setCx} /></div>
      {missing.length > 0 && <div className="callout warn"><span>This scan will not satisfy the gate: {a.tier.toLowerCase()} risk requires {missing.join(', ').toLowerCase()} complexity.</span></div>}
      <div className="field"><span>Attack strategies</span><Chips options={STRATEGY_GROUPS.map((g) => g.name)} value={st} onChange={setSt} /></div>
      <div className="field"><span>Risk categories</span>
        <Chips options={RISK_CATEGORIES.map((c) => c.name)} value={cats} onChange={setCats} disabled={(o) => !agentic && !!RISK_CATEGORIES.find((c) => c.name === o)?.agentOnly && !cats.includes(o)} />
        {!agentic && <span className="muted" style={{ fontSize: 12 }}>Agent-only categories are available for agents, multi-agent systems and MCP servers.</span>}
      </div>
    </Modal>
  );
}
