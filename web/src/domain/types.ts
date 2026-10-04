// Domain model for the AI Assurance application.
// Mirrors the data model in section 10.3 of the AI Evaluation and Red Teaming Framework.

export type RiskTier = 'Low' | 'Medium' | 'High';
export type AppType = 'RAG assistant' | 'Chat tool' | 'Agent' | 'Multi-agent' | 'MCP server';
export type LifecycleStage = 'Design' | 'Build' | 'Pre-release' | 'Launch' | 'Production';
export type Complexity = 'Easy' | 'Moderate' | 'Difficult';
export type StrategyGroup = 'Baseline' | 'Encoding' | 'Jailbreak' | 'Indirect' | 'Multi-turn';
export type EntryPoint = 'User' | 'Document' | 'Tool output' | 'MCP response' | 'Peer agent' | 'Upload';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export type FindingStatus = 'New' | 'Triaged' | 'In fix' | 'Retest pending' | 'Closed' | 'Accepted risk';
export type FindingSource = 'Automated scan' | 'Scenario' | 'Manual exercise' | 'Production monitoring';
export type ScanMode = 'Release' | 'Developer' | 'Scheduled';

export type Role =
  | 'Product team member'
  | 'Product owner'
  | 'Security analyst'
  | 'AI platform engineer'
  | 'Governance board member'
  | 'Auditor';

export interface ThreatModel {
  dataAccess: string[];
  actions: string[];
  entryPoints: EntryPoint[];
  threats: string[]; // OWASP LLM ids
  approvedBy: string;
  version: number;
}

export interface EvalMetric {
  name: string;
  value: number;
  limit: number;
  op: '>=' | '<=';
  format: 'score' | 'ratio' | 'pct';
}

export interface Release {
  version: string;
  date: string;
  pipeline: string;
  model: string;
  prompt: string;
  goldenSet: string;
  metrics: EvalMetric[];
  contentSafetyDefectPct: number;
  passK?: number; // agent consistency (pass^k), %
  scanId?: string;
  evaluationRunId?: string;
  judgeModelId?: string;
  signOffs: { role: Role; by: string; at: string }[];
}

export interface Application {
  id: string;
  name: string;
  type: AppType;
  tier: RiskTier;
  stage: LifecycleStage;
  owner: string;
  ecMember: string;
  description: string;
  profile: string;
  sandbox: string;
  qualityIndex: number; // 0-100, from online evaluation
  threatModel: ThreatModel;
  release: Release; // current release candidate
  lastManualTest?: string;
  nextManualTest?: string;
  nextScheduledScan: string;
  asrHistory: { version: string; asr: number }[];
  gate: GateResult; // computed by the server's gate engine
}

export type CriterionStatus = 'Pass' | 'Fail' | 'Warn' | 'N/A';

export interface Criterion {
  group: 'Evaluation' | 'Red teaming';
  name: string;
  result: string;
  limit: string;
  status: CriterionStatus;
  reason?: string | null;
}

export interface GateResult {
  passed: boolean;
  criteria: Criterion[];
  failed: Criterion[];
  evaluated: number;
}

export interface ScenarioResult {
  id: string;
  name: string;
  entry: EntryPoint;
  critical: boolean;
  defended: boolean;
  detection?: string | null;
  reproduced?: string | null;
  findingId?: string | null;
}

export interface Scan {
  id: string;
  appId: string;
  version: string;
  mode: ScanMode;
  status: 'Running' | 'Completed' | 'Failed';
  progress: number;
  error?: string | null;
  categories?: string[];
  startedAt: string;
  durationMin: number;
  complexities: Complexity[];
  strategies: StrategyGroup[];
  attackModel: string;
  attackModelId?: string | null;
  attempts: number;
  successes: number;
  // ASR (%) per category per strategy group, plus category overall
  heat: { category: string; cells: Partial<Record<StrategyGroup, number>>; overall: number }[];
  byComplexity: Partial<Record<Complexity, number>>;
  scenarios: ScenarioResult[];
  canaryLeaks: number;
  summary?: string;
}

export interface FindingEvent {
  at: string;
  by: string;
  text: string;
}

export interface Finding {
  id: string;
  appId: string;
  title: string;
  severity: Severity;
  status: FindingStatus;
  source: FindingSource;
  sourceRef: string;
  category: string;
  owasp: string[];
  owner: string;
  openedAt: string;
  dueAt?: string;
  closedAt?: string;
  regressionTestId?: string;
  workItem?: string;
  foundIn: 'Pre-release' | 'Production';
  evidence: string;
  acceptance?: { approvedBy: string; expires: string; controls: string };
  history: FindingEvent[];
}

export type LibraryKind = 'Golden dataset' | 'Agent scenarios' | 'Red team scenarios' | 'Attack seeds' | 'Canary set' | 'Regression set';

export interface LibraryItem {
  id: string;
  appId: string | 'shared';
  kind: LibraryKind;
  name: string;
  version: number;
  items: number | null; // null when restricted for the caller's role
  updatedAt: string;
  restricted: boolean;
  coverage: string;
  path: string;
}

export interface RegressionTest {
  id: string;
  appId: string;
  findingId: string;
  title: string;
  addedAt: string;
}

export interface RunRecord {
  id: string;
  appId: string;
  at: string;
  kind: 'Release gate' | 'Release scan' | 'Developer scan' | 'Scheduled scan' | 'Manual exercise' | 'Online evaluation' | 'Evaluation';
  version: string;
  detail: string;
  result: 'Passed' | 'Blocked' | 'Completed' | 'Within limits' | 'Alert' | 'Running';
  ref?: string;
}

export interface Attempt {
  id: string;
  at: string;
  tester: string;
  category: string;
  technique: string;
  entry: EntryPoint;
  outcome: 'Defended' | 'Partial' | 'Succeeded';
  note: string;
  findingId?: string;
}

export interface Authorization {
  id: string;
  appId: string;
  environment: 'Sandbox' | 'Staging';
  from: string;
  to: string;
  testers: string[];
  approvedBy: string;
}

export interface ManualSession {
  id: string;
  appId: string;
  authorizationId: string;
  title: string;
  status: 'Planned' | 'Active' | 'Completed';
  start: string;
  end: string;
  testers: string[];
  objectives: string[];
  optOuts: string[];
  attempts: Attempt[];
}

export interface GateThresholds {
  maxAsrOverall: number;
  maxAsrCategory: number;
  complexity: Complexity[];
  scenarios: 'Not required' | 'Critical defended' | 'All defended';
  canaryLeaks: number;
  openCritical: number;
  openHigh: number | null; // null: not gated
  manualTest: 'Not required' | 'Recommended' | 'Required';
  passK: number | null;
  signOff: Role[];
}

export type ModelPurpose = 'judge' | 'attack';
export type ModelProvider = 'simulated' | 'azure-openai' | 'openai-compatible' | 'anthropic' | 'azure-redteam-service';

export interface ModelDeployment {
  id: string;
  name: string;
  purpose: ModelPurpose;
  provider: ModelProvider;
  providerLabel: string;
  endpoint: string | null;
  deployment: string | null;
  modelVersion: string | null;
  apiVersion: string | null;
  auth: 'api-key' | 'entra';
  apiKeyEnv: string | null;
  secretConfigured: boolean;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null;
  temperature: number | null;
  dedicated: boolean;
  enabled: boolean;
  isDefault: boolean;
  calibration: { agreement: number; sampleSize: number; calibratedAt: string } | null;
  notes: string;
  updatedAt: string;
}

export interface EvalRunMetric extends EvalMetric {
  key: string;
  kind: 'judge' | 'deterministic';
}

export interface EvaluationRun {
  id: string;
  appId: string;
  version: string;
  mode: 'Pre-release' | 'Online';
  status: 'Running' | 'Completed' | 'Failed';
  progress: number;
  startedAt: string;
  finishedAt: string | null;
  judgeModelId: string;
  judge: { id: string; name: string; provider: string; deployment: string | null; modelVersion: string | null };
  datasetId: string | null;
  dataset: string;
  profile: string;
  cases: number;
  metrics: EvalRunMetric[];
  contentSafetyDefectPct: number | null;
  passK: number | null;
  caseResults: { id: string; query: string | null; response: string; scores: Record<string, { value: number; pass: boolean | null; reason: string }> }[];
  judgeCalls: number;
  error: string | null;
}

export interface AppState {
  role: Role;
  user: string;
  models: ModelDeployment[];
  evaluations: EvaluationRun[];
  applications: Application[];
  scans: Scan[];
  findings: Finding[];
  library: LibraryItem[];
  regressionTests: RegressionTest[];
  runs: RunRecord[];
  sessions: ManualSession[];
  authorizations: Authorization[];
  thresholds: Record<RiskTier, GateThresholds>;
}
