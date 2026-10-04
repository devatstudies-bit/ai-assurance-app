// Display helpers for gate and scan data. The gate decision itself is computed by the backend (backend/app/gate.py).
import type { Scan } from './types';

export type { Criterion, CriterionStatus, GateResult } from './types';

export const asr = (scan: Scan) => (scan.attempts ? (scan.successes / scan.attempts) * 100 : 0);
