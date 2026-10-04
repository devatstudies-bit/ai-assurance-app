export const DAY = 86_400_000;

export const now = () => new Date().toISOString();
export const daysFromNow = (d: number, hour = 10) => {
  const x = new Date(Date.now() + d * DAY);
  x.setHours(hour, 0, 0, 0);
  return x.toISOString();
};
export const addDays = (iso: string, d: number) => new Date(new Date(iso).getTime() + d * DAY).toISOString();

export const monthsBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / (DAY * 30.44);
export const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);

export const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
export const fmtDateLong = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
export const fmtDateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    : '—';

export const pct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;

export const dueLabel = (iso?: string) => {
  if (!iso) return { text: 'Backlog', overdue: false };
  const d = daysUntil(iso);
  if (d < 0) return { text: `Overdue ${-d} day${d === -1 ? '' : 's'}`, overdue: true };
  if (d === 0) return { text: 'Due today', overdue: false };
  return { text: `Due ${fmtDate(iso)}`, overdue: false };
};

// Deterministic PRNG so simulated scans are reproducible per seed
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
