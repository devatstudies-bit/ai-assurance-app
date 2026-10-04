import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bot, KeyRound, Gavel, TriangleAlert } from 'lucide-react';
import { useStore } from '../store/store';
import { Badge, Modal, TierBadge, useToast } from './ui';
import { CALIBRATION_MAX_DAYS, CALIBRATION_MIN_AGREEMENT } from '../domain/framework';
import type { EvaluationRun, ModelDeployment, ModelPurpose } from '../domain/types';
import { DAY, fmtDate } from '../domain/util';

export function calibrationStatus(m: ModelDeployment): { ok: boolean; label: string } {
  if (m.provider === 'simulated') return { ok: true, label: 'No calibration needed' };
  if (m.purpose === 'attack') return { ok: true, label: 'Scored by the engine' };
  const c = m.calibration;
  if (!c) return { ok: false, label: 'Not calibrated' };
  const age = Math.round((Date.now() - new Date(c.calibratedAt).getTime()) / DAY);
  const ok = c.agreement >= CALIBRATION_MIN_AGREEMENT && age <= CALIBRATION_MAX_DAYS;
  return { ok, label: `${Math.round(c.agreement * 100)}% agreement · ${age}d ago` };
}

/** Radio-card list of enabled models for one purpose. */
export function ModelPicker({ purpose, value, onChange }: { purpose: ModelPurpose; value: string; onChange: (id: string) => void }) {
  const { state } = useStore();
  const models = state.models.filter((m) => m.purpose === purpose && m.enabled);
  return (
    <div role="radiogroup" aria-label={purpose === 'judge' ? 'Judge model' : 'Attack model'} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {models.map((m) => {
        const on = m.id === value;
        const cal = calibrationStatus(m);
        return (
          <button type="button" role="radio" aria-checked={on} key={m.id} onClick={() => onChange(m.id)} className="card"
            style={{ textAlign: 'left', padding: '10px 12px', cursor: 'pointer', display: 'grid', gridTemplateColumns: '18px minmax(0,1fr) auto', gap: 10, alignItems: 'center',
              borderColor: on ? 'var(--accent)' : undefined, boxShadow: on ? '0 0 0 3px var(--accent-soft)' : 'none' }}>
            <span style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`, display: 'grid', placeItems: 'center' }}>
              {on && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{m.name}</span>{m.isDefault && <Badge tone="accent">default</Badge>}
              <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                {m.providerLabel}{m.deployment ? ` · ${m.deployment}` : ''}{m.modelVersion ? ` · ${m.modelVersion}` : ''}
              </span>
            </span>
            <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
              {!m.secretConfigured && <Badge tone="warn" title={`Set ${m.apiKeyEnv} on the API server`}><KeyRound />key missing</Badge>}
              {purpose === 'judge' && m.provider !== 'simulated' && <Badge tone={cal.ok ? 'good' : 'warn'}>{cal.label}</Badge>}
            </span>
          </button>
        );
      })}
      <span className="muted" style={{ fontSize: 12 }}>Manage models on the <Link to="/models">AI models</Link> page.</span>
    </div>
  );
}

export function RunEvaluationModal({ appId, onClose }: { appId?: string; onClose: () => void }) {
  const { state, api } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [app, setApp] = useState(appId ?? state.applications[0].id);
  const defaultJudge = state.models.find((m) => m.purpose === 'judge' && m.isDefault && m.enabled)?.id ?? '';
  const [judge, setJudge] = useState(defaultJudge);
  const [mode, setMode] = useState<EvaluationRun['mode']>('Pre-release');
  const a = state.applications.find((x) => x.id === app)!;
  const datasets = state.library.filter((l) => l.appId === app && (l.kind === 'Golden dataset' || l.kind === 'Agent scenarios'));
  const [dataset, setDataset] = useState(datasets[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const selected = state.models.find((m) => m.id === judge);

  const start = async () => {
    setBusy(true);
    const run = await api.startEvaluation({ appId: app, judgeModelId: judge, datasetId: dataset || undefined, mode });
    setBusy(false);
    if (!run) return;
    toast(`Evaluation ${run.id} started · judge ${selected?.name}`);
    onClose();
    navigate(`/evaluations/${run.id}`);
  };

  return (
    <Modal title="Run evaluation" onClose={onClose} width={680}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !judge} onClick={start}><Gavel size={16} />Run evaluation</button></>}>
      <div className="form-grid">
        <label className="field"><span>Application</span>
          <select className="select" value={app} onChange={(e) => { setApp(e.target.value); setDataset(state.library.find((l) => l.appId === e.target.value && (l.kind === 'Golden dataset' || l.kind === 'Agent scenarios'))?.id ?? ''); }}>
            {state.applications.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Dataset</span>
          <select className="select" value={dataset} onChange={(e) => setDataset(e.target.value)} disabled={!datasets.length}>
            {datasets.length ? datasets.map((d) => <option key={d.id} value={d.id}>{d.name} v{d.version}</option>) : <option value="">No golden dataset</option>}
          </select>
        </label>
        <label className="field"><span>Mode</span>
          <select className="select" value={mode} onChange={(e) => setMode(e.target.value as EvaluationRun['mode'])}>
            <option value="Pre-release">Pre-release (becomes the release's evaluation of record)</option>
            <option value="Online">Online (monitoring only)</option>
          </select>
        </label>
      </div>
      <div className="callout info"><TierBadge t={a.tier} /><span>Profile <span className="mono">{a.profile}</span>, release {a.release.version}. Judge metrics are scored by the model you choose; deterministic metrics are computed in code.</span></div>
      <div className="field"><span><Bot size={14} style={{ verticalAlign: -2 }} /> Judge model</span><ModelPicker purpose="judge" value={judge} onChange={setJudge} /></div>
      {selected && !selected.secretConfigured && <div className="callout warn"><TriangleAlert /><span>{selected.apiKeyEnv} is not set on the API server, so this run will fail. Set it, or choose another judge.</span></div>}
      {selected?.calibration && !calibrationStatus(selected).ok && <div className="callout warn"><TriangleAlert /><span>{selected.name} was last calibrated {fmtDate(selected.calibration.calibratedAt)}. Its scores will carry an advisory on the release gate.</span></div>}
    </Modal>
  );
}
