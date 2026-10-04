import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Bot, FileSearch, Network, Server, MessageSquare } from 'lucide-react';
import { useStore } from '../store/store';
import { Badge, Chips, GateBadge, Modal, PageHead, TierBadge, useToast } from '../components/ui';
import { can, DEFAULT_THRESHOLDS, OWASP, SCAN_CADENCE, TIER_INFO } from '../domain/framework';
import type { AppType, EntryPoint, RiskTier } from '../domain/types';
import { daysFromNow, fmtDate } from '../domain/util';
import { useNavigate } from 'react-router-dom';

const TYPE_ICON: Record<AppType, React.ReactNode> = {
  'RAG assistant': <FileSearch size={18} />, 'Chat tool': <MessageSquare size={18} />, Agent: <Bot size={18} />, 'Multi-agent': <Network size={18} />, 'MCP server': <Server size={18} />,
};

export default function Applications() {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<RiskTier | 'All'>('All');
  const apps = state.applications.filter((a) => tier === 'All' || a.tier === tier);

  return (
    <>
      <PageHead title="Application registry" sub="Every AI application is registered once with its type, risk tier, owner and threat model."
        actions={<>
          <select className="select" style={{ width: 'auto' }} value={tier} onChange={(e) => setTier(e.target.value as RiskTier | 'All')} aria-label="Risk tier">
            <option value="All">All tiers</option><option>High</option><option>Medium</option><option>Low</option>
          </select>
          {can(state.role, 'registerApps') && <button className="btn primary" onClick={() => setOpen(true)}><Plus />Register application</button>}
        </>} />
      <div className="grid-3">
        {apps.map((a) => {
          const gate = a.gate;
          return (
            <Link key={a.id} to={`/applications/${a.id}`} className="card card-pad" style={{ color: 'inherit', textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="between">
                <div className="row" style={{ gap: 10 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent)' }}>{TYPE_ICON[a.type]}</span>
                  <div>
                    <div style={{ fontWeight: 650, fontSize: 15 }}>{a.name}</div>
                    <div className="muted mono" style={{ fontSize: 11.5 }}>{a.id}</div>
                  </div>
                </div>
                <TierBadge t={a.tier} />
              </div>
              <div className="dim" style={{ fontSize: 13, minHeight: 40 }}>{a.description}</div>
              <div className="row">
                <Badge>{a.type}</Badge><Badge>{a.stage}</Badge><Badge>{a.release.version}</Badge>
              </div>
              <div className="between" style={{ borderTop: '1px solid var(--border)', paddingTop: 12, fontSize: 12.5 }}>
                <span className="muted">Owner <b style={{ color: 'var(--text)', fontWeight: 550 }}>{a.owner}</b></span>
                <GateBadge passed={gate.passed} />
              </div>
            </Link>
          );
        })}
      </div>
      {open && <RegisterModal onClose={() => setOpen(false)} />}
    </>
  );
}

function RegisterModal({ onClose }: { onClose: () => void }) {
  const { api } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [type, setType] = useState<AppType>('RAG assistant');
  const [tier, setTier] = useState<RiskTier>('Medium');
  const [owner, setOwner] = useState('');
  const [ec, setEc] = useState('');
  const [desc, setDesc] = useState('');
  const [entry, setEntry] = useState<EntryPoint[]>(['User']);
  const [threats, setThreats] = useState<string[]>(['LLM01']);
  const id = 'uc-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const valid = name.trim() && owner.trim();

  const save = async () => {
    const app = await api.registerApp({ name, type, tier, owner, ecMember: ec, description: desc, entryPoints: entry, threats });
    if (!app) return;
    toast(`${app.name} registered in Design stage`);
    onClose();
    navigate(`/applications/${app.id}`);
  };

  return (
    <Modal title="Register application" onClose={onClose} width={720} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!valid} onClick={save}>Register</button></>}>
      <div className="form-grid">
        <label className="field"><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Contract Review Agent" /></label>
        <label className="field"><span>Type</span><select className="select" value={type} onChange={(e) => setType(e.target.value as AppType)}>{(['RAG assistant', 'Chat tool', 'Agent', 'Multi-agent', 'MCP server'] as AppType[]).map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="field"><span>Owning team</span><input className="input" value={owner} onChange={(e) => setOwner(e.target.value)} /></label>
        <label className="field"><span>EC member</span><input className="input" value={ec} onChange={(e) => setEc(e.target.value)} /></label>
      </div>
      <label className="field"><span>Description</span><textarea className="textarea" value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
      <div className="field">
        <span>Risk tier</span>
        <div className="grid-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {(['Low', 'Medium', 'High'] as RiskTier[]).map((t) => (
            <button type="button" key={t} onClick={() => setTier(t)} className="card" style={{ textAlign: 'left', padding: 12, cursor: 'pointer', borderColor: tier === t ? 'var(--accent)' : undefined, boxShadow: tier === t ? '0 0 0 3px var(--accent-soft)' : undefined }}>
              <TierBadge t={t} />
              <div style={{ fontSize: 12, marginTop: 8 }} className="dim">{TIER_INFO[t].typical}</div>
              <div style={{ fontSize: 11.5, marginTop: 6 }} className="muted">ASR ≤ {DEFAULT_THRESHOLDS[t].maxAsrOverall}% · scans {SCAN_CADENCE[t].toLowerCase()}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="field"><span>Entry points the application reads</span>
        <Chips options={['User', 'Document', 'Tool output', 'MCP response', 'Peer agent', 'Upload'] as EntryPoint[]} value={entry} onChange={setEntry} />
      </div>
      <div className="field"><span>Threats in scope (OWASP LLM)</span>
        <Chips options={Object.keys(OWASP)} value={threats} onChange={setThreats} />
      </div>
      {valid && <div className="muted" style={{ fontSize: 12 }}>Registry ID <span className="mono">{id}</span> · next scheduled scan {fmtDate(daysFromNow(7))}</div>}
    </Modal>
  );
}
