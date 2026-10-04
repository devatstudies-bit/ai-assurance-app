import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LoaderCircle, ServerCrash } from 'lucide-react';
import { ApiError, request } from '../api/client';
import { useToast } from '../components/ui';
import type {
  AppState, Application, Attempt, Complexity, EvaluationRun, Finding, FindingStatus, GateThresholds, ManualSession, ModelDeployment, RiskTier, Role, Scan,
  ScanMode, Severity, StrategyGroup,
} from '../domain/types';

const ROLE_KEY = 'ai-assurance-role';

export interface ScanConfig {
  appId: string;
  attackModelId: string;
  mode: ScanMode;
  complexities: Complexity[];
  strategies: StrategyGroup[];
  categories: string[];
}

export type ModelInput = Partial<Omit<ModelDeployment, 'id' | 'providerLabel' | 'secretConfigured' | 'isDefault' | 'updatedAt'>>;

export interface FindingInput {
  appId: string; title: string; severity: Severity; category: string; owasp: string[]; source: Finding['source']; sourceRef: string; evidence: string;
}

function loadRole(): Role {
  try {
    return (localStorage.getItem(ROLE_KEY) as Role) || 'AI platform engineer';
  } catch {
    return 'AI platform engineer';
  }
}

type Api = ReturnType<typeof useApiActions>;
const Ctx = createContext<{ state: AppState; api: Api } | null>(null);

// Every action calls the backend, then refreshes the snapshot. Failures surface as a toast and resolve to undefined.
function useApiActions(role: Role, setRole: (r: Role) => void, refresh: () => Promise<void>) {
  const toast = useToast();
  return useMemo(() => {
    const call = async <T,>(method: string, path: string, body?: unknown): Promise<T | undefined> => {
      try {
        const out = await request<T>(role, method, path, body);
        await refresh();
        return out ?? (true as T); // 204 responses resolve to true so callers can tell success from failure
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Request failed', 'error');
        return undefined;
      }
    };
    return {
      setRole,
      refresh,
      reset: () => call<true>('POST', '/api/admin/reset'),
      registerApp: (body: { name: string; type: Application['type']; tier: RiskTier; owner: string; ecMember: string; description: string; entryPoints: string[]; threats: string[] }) =>
        call<Application>('POST', '/api/applications', body),
      rerunGate: (appId: string) => call<{ gate: { passed: boolean } }>('POST', `/api/applications/${appId}/gate-runs`),
      signOff: (appId: string) => call<Application>('POST', `/api/applications/${appId}/sign-offs`),
      startScan: (config: ScanConfig) => call<Scan>('POST', '/api/scans', config),
      logFinding: (body: FindingInput) => call<Finding>('POST', '/api/findings', body),
      updateFinding: (id: string, patch: Partial<Pick<Finding, 'owner' | 'severity' | 'workItem'>>) => call<Finding>('PATCH', `/api/findings/${id}`, patch),
      moveFinding: (id: string, to: FindingStatus, extra: { regressionTitle?: string; acceptance?: { expires: string; controls: string } } = {}) =>
        call<Finding>('POST', `/api/findings/${id}/transitions`, { to, ...extra }),
      updateThresholds: (tier: RiskTier, patch: Partial<GateThresholds>) => call<GateThresholds>('PATCH', `/api/thresholds/${tier}`, patch),
      createSession: (body: { appId: string; authorizationId: string; objectives: string[]; optOuts: string[] }) => call<ManualSession>('POST', '/api/sessions', body),
      setSessionStatus: (id: string, status: ManualSession['status']) => call<ManualSession>('POST', `/api/sessions/${id}/status`, { status }),
      logAttempt: (id: string, attempt: Omit<Attempt, 'id' | 'at' | 'tester' | 'findingId'>) => call<Attempt>('POST', `/api/sessions/${id}/attempts`, attempt),
      findingFromAttempt: (id: string, attemptId: string, body: { title: string; severity: Severity; category: string; owasp: string[]; evidence: string }) =>
        call<Finding>('POST', `/api/sessions/${id}/attempts/${attemptId}/finding`, body),
      startEvaluation: (body: { appId: string; judgeModelId: string; datasetId?: string; mode: EvaluationRun['mode'] }) =>
        call<EvaluationRun>('POST', '/api/evaluations', body),
      createModel: (body: ModelInput) => call<ModelDeployment>('POST', '/api/models', body),
      updateModel: (id: string, patch: ModelInput) => call<ModelDeployment>('PATCH', `/api/models/${id}`, patch),
      setDefaultModel: (id: string) => call<ModelDeployment>('POST', `/api/models/${id}/default`),
      deleteModel: (id: string) => call<true>('DELETE', `/api/models/${id}`),
      // Read-only calls: no snapshot refresh
      testModel: async (id: string) => {
        try {
          return await request<{ ok: boolean; latencyMs: number; detail: string }>(role, 'POST', `/api/models/${id}/test`);
        } catch (e) {
          toast(e instanceof ApiError ? e.message : 'Request failed', 'error');
          return undefined;
        }
      },
      getEvaluation: (id: string) => request<EvaluationRun>(role, 'GET', `/api/evaluations/${id}`),
    };
  }, [role, setRole, refresh, toast]);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(loadRole);
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roleRef = useRef(role);

  const refresh = useCallback(async () => {
    try {
      const s = await request<AppState>(roleRef.current, 'GET', '/api/state');
      setState(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const setRole = useCallback((r: Role) => {
    try { localStorage.setItem(ROLE_KEY, r); } catch { /* ignore */ }
    roleRef.current = r;
    setRoleState(r);
  }, []);

  useEffect(() => { void refresh(); }, [role, refresh]);

  // Poll while a scan or evaluation is running so progress and results appear without a reload
  const running = (state?.scans.some((s) => s.status === 'Running') || state?.evaluations.some((e) => e.status === 'Running')) ?? false;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void refresh(), 1000);
    return () => clearInterval(t);
  }, [running, refresh]);

  const api = useApiActions(role, setRole, refresh);
  const value = useMemo(() => (state ? { state, api } : null), [state, api]);

  if (!value) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
        <div className="card card-pad" style={{ maxWidth: 480, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          {error ? (
            <>
              <ServerCrash size={28} color="var(--bad)" />
              <h2 style={{ fontSize: 18 }}>Cannot reach the AI Assurance API</h2>
              <p className="dim" style={{ margin: 0 }}>Start the backend, then retry:</p>
              <pre className="code" style={{ textAlign: 'left', width: '100%' }}>cd backend{'\n'}.venv/bin/uvicorn app.main:app --reload</pre>
              <button className="btn primary" onClick={() => void refresh()}>Retry</button>
            </>
          ) : (
            <><LoaderCircle size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} /><span className="dim">Loading…</span><style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style></>
          )}
        </div>
      </div>
    );
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore outside provider');
  return c;
}

export function useApp(id?: string) {
  const { state } = useStore();
  return state.applications.find((a) => a.id === id);
}

export const useGate = (app?: Application) => app?.gate;
