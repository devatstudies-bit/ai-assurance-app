import { useState } from 'react';
import { Plus, Gavel, Radar, KeyRound, PlugZap, Star, Pencil, Lock, CircleCheck, CircleX, ShieldCheck } from 'lucide-react';
import { useStore, type ModelInput } from '../store/store';
import { Badge, Card, Modal, PageHead, useToast } from '../components/ui';
import { calibrationStatus } from '../components/ModelPicker';
import { can, CALIBRATION_MAX_DAYS, CALIBRATION_MIN_AGREEMENT } from '../domain/framework';
import type { ModelDeployment, ModelProvider, ModelPurpose } from '../domain/types';
import { fmtDate } from '../domain/util';

const PROVIDERS: Record<ModelPurpose, { id: ModelProvider; label: string }[]> = {
  judge: [
    { id: 'azure-openai', label: 'Azure OpenAI / Azure AI Foundry' },
    { id: 'anthropic', label: 'Anthropic Claude API' },
    { id: 'openai-compatible', label: 'OpenAI-compatible endpoint' },
    { id: 'simulated', label: 'Local simulation (no model calls)' },
  ],
  attack: [
    { id: 'azure-redteam-service', label: 'Azure AI Red Teaming Agent (hosted)' },
    { id: 'simulated', label: 'Local simulation (no model calls)' },
  ],
};

export default function Models() {
  const { state, api } = useStore();
  const toast = useToast();
  const manage = can(state.role, 'manageModels');
  const [editing, setEditing] = useState<ModelDeployment | 'new-judge' | 'new-attack' | null>(null);
  const [tests, setTests] = useState<Record<string, { ok: boolean; detail: string; latencyMs: number } | 'running'>>({});

  const test = async (m: ModelDeployment) => {
    setTests((t) => ({ ...t, [m.id]: 'running' }));
    const r = await api.testModel(m.id);
    setTests((t) => { const n = { ...t }; if (r) n[m.id] = r; else delete n[m.id]; return n; });
  };

  const section = (purpose: ModelPurpose) => {
    const models = state.models.filter((m) => m.purpose === purpose);
    return (
      <Card title={purpose === 'judge' ? 'Judge models' : 'Attack engines'} icon={purpose === 'judge' ? <Gavel /> : <Radar />}
        meta={purpose === 'judge'
          ? 'Score evaluation runs (LLM-as-judge). Choose one per run.'
          : 'Run automated red team scans; each engine generates and scores its own attacks. Choose one per scan.'}
        pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th style={{ minWidth: 230 }}>Model</th><th>Provider and deployment</th><th>Credentials</th>{purpose === 'judge' && <th>Calibration</th>}<th /></tr></thead>
            <tbody>
              {models.map((m) => {
                const cal = calibrationStatus(m);
                const t = tests[m.id];
                return (
                  <tr key={m.id} style={!m.enabled ? { opacity: 0.55 } : undefined}>
                    <td>
                      <div className="row" style={{ gap: 6 }}><b style={{ fontWeight: 600 }}>{m.name}</b>{m.isDefault && <Badge tone="accent"><Star />default</Badge>}{!m.enabled && <Badge>disabled</Badge>}</div>
                      <div className="muted" style={{ fontSize: 12, maxWidth: 300 }}>{m.notes}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 550 }}>{m.providerLabel}</div>
                      <div className="mono" style={{ fontSize: 12.5 }}>{m.deployment ?? '—'}{m.modelVersion ? ` · ${m.modelVersion}` : ''}</div>
                      {m.endpoint && <div className="muted mono" style={{ fontSize: 11, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.endpoint}>{m.endpoint}</div>}
                      <div className="row" style={{ gap: 4, marginTop: 3 }}>
                        {m.effort && <Badge>effort {m.effort}</Badge>}
                        {m.temperature !== null && <Badge>temp {m.temperature}</Badge>}
                        {m.provider !== 'simulated' && (m.dedicated ? <Badge tone="good"><ShieldCheck />dedicated</Badge> : <Badge tone="warn" title="Section 10.2: judge and attack models should never share production deployments">shared</Badge>)}
                      </div>
                    </td>
                    <td>
                      {m.provider === 'simulated' ? <span className="muted">None needed</span>
                        : m.auth === 'entra' ? <Badge tone="good">Entra ID</Badge>
                        : <span title={m.secretConfigured ? 'Set on the API server' : 'Not set on the API server'}>
                            <Badge tone={m.secretConfigured ? 'good' : 'warn'}><KeyRound />{m.apiKeyEnv}</Badge>
                          </span>}
                      {t && t !== 'running' && <div style={{ fontSize: 12, marginTop: 4, color: t.ok ? 'var(--good-text)' : 'var(--bad-text)', maxWidth: 240 }}>
                        {t.ok ? <CircleCheck size={12} style={{ verticalAlign: -2 }} /> : <CircleX size={12} style={{ verticalAlign: -2 }} />} {t.detail}{t.ok && t.latencyMs ? ` (${t.latencyMs} ms)` : ''}
                      </div>}
                    </td>
                    {purpose === 'judge' && <td>{m.provider === 'simulated' ? <span className="muted">—</span> : <Badge tone={cal.ok ? 'good' : 'warn'}>{cal.label}</Badge>}</td>}
                    <td style={{ textAlign: 'right' }}>
                      {manage && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                          <button className="btn sm" onClick={() => test(m)} disabled={t === 'running'}><PlugZap size={14} />{t === 'running' ? 'Testing…' : 'Test'}</button>
                          <button className="btn sm" onClick={() => setEditing(m)} aria-label={`Edit ${m.name}`}><Pencil size={14} /></button>
                        </div>
                        {!m.isDefault && m.enabled && <button className="btn sm ghost" onClick={async () => { if (await api.setDefaultModel(m.id)) toast(`${m.name} is now the default ${purpose} model`); }}>Make default</button>}
                      </div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    );
  };

  return (
    <>
      <PageHead title="AI models" sub="Judge and attack models used by evaluations and red team scans. Dedicated, version-pinned deployments that never serve production traffic (§10.2)."
        actions={manage && <>
          <button className="btn" onClick={() => setEditing('new-attack')}><Plus />Add attack engine</button>
          <button className="btn primary" onClick={() => setEditing('new-judge')}><Plus />Add judge model</button>
        </>} />
      <div className="stack">
        {!manage && <div className="callout"><Lock /><span>Models are maintained by the AI platform team. You are viewing as {state.role}.</span></div>}
        <div className="callout info"><KeyRound /><span>API keys are never stored or shown. Each model names the environment variable that holds its key on the API server (for example one backed by Key Vault), or uses Entra ID.</span></div>
        {section('judge')}
        {section('attack')}
        <div className="muted" style={{ fontSize: 12 }}>Judges should be recalibrated against human labels at least every {CALIBRATION_MAX_DAYS} days with ≥ {CALIBRATION_MIN_AGREEMENT * 100}% agreement (§12.2). Releases scored by a judge outside that window get an advisory on the gate.</div>
      </div>
      {editing && <ModelForm model={typeof editing === 'string' ? undefined : editing} purpose={editing === 'new-attack' ? 'attack' : editing === 'new-judge' ? 'judge' : (editing as ModelDeployment).purpose} onClose={() => setEditing(null)} />}
    </>
  );
}

function ModelForm({ model, purpose, onClose }: { model?: ModelDeployment; purpose: ModelPurpose; onClose: () => void }) {
  const { api } = useStore();
  const toast = useToast();
  const [f, setF] = useState<ModelInput>(() => model
    ? { name: model.name, provider: model.provider, endpoint: model.endpoint, deployment: model.deployment, modelVersion: model.modelVersion, apiVersion: model.apiVersion,
        auth: model.auth, apiKeyEnv: model.apiKeyEnv, effort: model.effort, temperature: model.temperature, dedicated: model.dedicated, enabled: model.enabled, notes: model.notes, calibration: model.calibration }
    : { purpose, provider: PROVIDERS[purpose][0].id, auth: 'api-key', dedicated: true, enabled: true, notes: '', temperature: null, effort: null, apiVersion: purpose === 'judge' ? '2024-10-21' : null });
  const set = <K extends keyof ModelInput>(k: K, v: ModelInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const p = f.provider!;
  const [cal, setCal] = useState({ agreement: model?.calibration?.agreement ?? '', sampleSize: model?.calibration?.sampleSize ?? '', calibratedAt: model?.calibration?.calibratedAt?.slice(0, 10) ?? '' });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const body: ModelInput = { ...f };
    for (const k of ['endpoint', 'deployment', 'modelVersion', 'apiVersion', 'apiKeyEnv'] as const) if (body[k] === '') body[k] = null;
    if (p === 'simulated' || p === 'azure-redteam-service') { body.apiKeyEnv = null; body.temperature = null; body.effort = null; }
    if (p !== 'anthropic') body.effort = null;
    if (purpose === 'judge' && cal.agreement !== '' && cal.sampleSize !== '' && cal.calibratedAt) {
      body.calibration = { agreement: Number(cal.agreement), sampleSize: Number(cal.sampleSize), calibratedAt: new Date(cal.calibratedAt).toISOString() };
    } else delete body.calibration;
    if (model) { delete body.provider; delete body.purpose; } // fixed after creation
    setBusy(true);
    const r = model ? await api.updateModel(model.id, body) : await api.createModel(body);
    setBusy(false);
    if (r) { toast(`${r.name} ${model ? 'updated' : 'added'}`); onClose(); }
  };

  const del = async () => { if (model && (await api.deleteModel(model.id))) { toast(`${model.name} deleted`); onClose(); } };

  return (
    <Modal title={model ? `Edit ${model.name}` : purpose === 'judge' ? 'Add judge model' : 'Add attack engine'} onClose={onClose} width={720}
      footer={<>
        {model && !model.isDefault && <button className="btn ghost" style={{ marginRight: 'auto', color: 'var(--bad-text)' }} onClick={del}>Delete</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !f.name?.trim()} onClick={save}>{model ? 'Save' : 'Add model'}</button>
      </>}>
      <div className="form-grid">
        <label className="field"><span>Display name</span><input className="input" value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder={purpose === 'judge' ? 'e.g. GPT-4.1 judge' : 'e.g. Azure AI Red Teaming Agent (UK South)'} /></label>
        <label className="field"><span>Provider</span>
          <select className="select" value={p} disabled={!!model} onChange={(e) => set('provider', e.target.value as ModelProvider)}>
            {PROVIDERS[purpose].map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </label>
      </div>
      {p !== 'simulated' && (
        <div className="form-grid">
          {p !== 'anthropic' && <label className="field"><span>{p === 'azure-redteam-service' ? 'Foundry project endpoint' : 'Endpoint'}</span>
            <input className="input mono" value={f.endpoint ?? ''} onChange={(e) => set('endpoint', e.target.value)} placeholder={p === 'azure-openai' ? 'https://<resource>.openai.azure.com' : p === 'azure-redteam-service' ? 'https://<hub>.services.ai.azure.com/api/projects/<project>' : 'https://host/v1'} /></label>}
          {p !== 'azure-redteam-service' && <label className="field"><span>{p === 'azure-openai' ? 'Deployment name' : 'Model ID'}</span>
            <input className="input mono" value={f.deployment ?? ''} onChange={(e) => set('deployment', e.target.value)} placeholder={p === 'anthropic' ? 'claude-opus-5-5' : p === 'azure-openai' ? 'judge-gpt-4.1' : 'model name'} /></label>}
          <label className="field"><span>Pinned model version</span><input className="input mono" value={f.modelVersion ?? ''} onChange={(e) => set('modelVersion', e.target.value)} placeholder="e.g. 2025-04-14" /></label>
          {p === 'azure-openai' && <label className="field"><span>API version</span><input className="input mono" value={f.apiVersion ?? ''} onChange={(e) => set('apiVersion', e.target.value)} /></label>}
          {p === 'anthropic' && <label className="field"><span>Endpoint (optional)</span><input className="input mono" value={f.endpoint ?? ''} onChange={(e) => set('endpoint', e.target.value)} placeholder="Default: Claude API" /></label>}
        </div>
      )}
      {(p === 'azure-openai' || p === 'openai-compatible' || p === 'anthropic') && (
        <div className="form-grid">
          {p === 'azure-openai' && <label className="field"><span>Authentication</span>
            <select className="select" value={f.auth} onChange={(e) => set('auth', e.target.value as 'api-key' | 'entra')}><option value="api-key">API key</option><option value="entra">Entra ID (managed identity)</option></select></label>}
          {f.auth !== 'entra' && <label className="field"><span>API key environment variable</span>
            <input className="input mono" value={f.apiKeyEnv ?? ''} onChange={(e) => set('apiKeyEnv', e.target.value.toUpperCase())} placeholder={p === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'AZURE_OPENAI_JUDGE_KEY'} /></label>}
          {p === 'anthropic'
            ? <label className="field"><span>Effort</span>
                <select className="select" value={f.effort ?? ''} onChange={(e) => set('effort', (e.target.value || null) as ModelInput['effort'])}>
                  <option value="">Model default</option>{['low', 'medium', 'high', 'xhigh', 'max'].map((x) => <option key={x}>{x}</option>)}
                </select></label>
            : <label className="field"><span>Temperature</span>
                <input className="input mono" type="number" step="0.1" min="0" max="2" value={f.temperature ?? ''} placeholder="Model default" onChange={(e) => set('temperature', e.target.value === '' ? null : Number(e.target.value))} /></label>}
        </div>
      )}
      {p === 'anthropic' && <div className="muted" style={{ fontSize: 12 }}>Current Claude models reject sampling parameters; control depth with effort instead. Requests opt into server-side refusal fallback on the Claude API.</div>}
      {purpose === 'judge' && p !== 'simulated' && (
        <div className="field"><span>Calibration against human labels (§12.2)</span>
          <div className="form-grid">
            <input className="input mono" type="number" step="0.01" min="0" max="1" value={cal.agreement} onChange={(e) => setCal({ ...cal, agreement: e.target.value })} placeholder="Agreement, e.g. 0.88" aria-label="Agreement" />
            <input className="input mono" type="number" min="1" value={cal.sampleSize} onChange={(e) => setCal({ ...cal, sampleSize: e.target.value })} placeholder="Sample size" aria-label="Sample size" />
            <input className="input" type="date" value={cal.calibratedAt} onChange={(e) => setCal({ ...cal, calibratedAt: e.target.value })} aria-label="Calibrated on" />
          </div>
        </div>
      )}
      <div className="row" style={{ gap: 18 }}>
        {p !== 'simulated' && <label className="row" style={{ fontSize: 13.5 }}><input type="checkbox" checked={!!f.dedicated} onChange={(e) => set('dedicated', e.target.checked)} />Dedicated deployment (not shared with production)</label>}
        <label className="row" style={{ fontSize: 13.5 }}><input type="checkbox" checked={!!f.enabled} onChange={(e) => set('enabled', e.target.checked)} />Enabled</label>
      </div>
      <label className="field"><span>Notes</span><input className="input" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></label>
      {model && <div className="muted" style={{ fontSize: 12 }}>Last updated {fmtDate(model.updatedAt)}. Models that scored or ran recorded runs can be disabled but not deleted, so evidence keeps its provenance.</div>}
    </Modal>
  );
}
