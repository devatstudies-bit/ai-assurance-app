import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type MouseEvent } from 'react';
import { CircleCheck, CircleX, CircleMinus, TriangleAlert, Lock, X, Check } from 'lucide-react';
import type { CriterionStatus } from '../domain/types';
import type { FindingStatus, RiskTier, Severity } from '../domain/types';

export function PageHead({ crumbs, title, sub, actions, children }: { crumbs?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        {crumbs && <div className="crumbs">{crumbs}</div>}
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
        {children}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, icon, meta, children, pad = true, className = '', style }: { title?: ReactNode; icon?: ReactNode; meta?: ReactNode; children: ReactNode; pad?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <section className={`card ${className}`} style={style}>
      {title && (
        <div className="card-head">
          <h2>{icon}{title}</h2>
          {meta && <div className="meta">{meta}</div>}
        </div>
      )}
      <div className={pad ? 'card-body' : ''}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, note, tone, icon }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'good' | 'bad'; icon?: ReactNode }) {
  return (
    <div className={`card kpi ${tone ?? ''}`}>
      <div className="label">{icon}{label}</div>
      <div className="value">{value}</div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

export function Badge({ tone, children, title }: { tone?: string; children: ReactNode; title?: string }) {
  return <span className={`badge ${tone ?? ''}`} title={title}>{children}</span>;
}

const SEV_TONE: Record<Severity, string> = { Critical: 'solid-bad', High: 'serious', Medium: 'warn', Low: '' };
export const SeverityBadge = ({ s }: { s: Severity }) => <Badge tone={SEV_TONE[s]}>{s}</Badge>;

const TIER_TONE: Record<RiskTier, string> = { High: 'bad', Medium: 'warn', Low: 'good' };
export const TierBadge = ({ t }: { t: RiskTier }) => <Badge tone={TIER_TONE[t]}><span className="dot" style={{ background: 'currentColor' }} />{t} risk</Badge>;

export function CritBadge({ s }: { s: CriterionStatus }) {
  if (s === 'Pass') return <Badge tone="good"><CircleCheck />Pass</Badge>;
  if (s === 'Fail') return <Badge tone="bad"><CircleX />Fail</Badge>;
  if (s === 'Warn') return <Badge tone="warn"><TriangleAlert />Advisory</Badge>;
  return <Badge><CircleMinus />N/A</Badge>;
}

const FS_TONE: Partial<Record<FindingStatus, string>> = { New: 'accent', Triaged: 'warn', 'In fix': 'serious', 'Retest pending': 'accent', Closed: 'good', 'Accepted risk': 'outline' };
export const FindingStatusBadge = ({ s }: { s: FindingStatus }) => <Badge tone={FS_TONE[s]}>{s}</Badge>;

export function GateBadge({ passed }: { passed: boolean }) {
  return passed ? <Badge tone="good"><CircleCheck />Gate passed</Badge> : <Badge tone="bad"><CircleX />Blocked</Badge>;
}

export function Modal({ title, onClose, children, footer, width }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEscape(onClose);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ onClose, children, head }: { onClose: () => void; children: ReactNode; head: ReactNode }) {
  useEscape(onClose);
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="modal-head" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>{head}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

function useEscape(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && fn();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [fn]);
}

export function Locked({ children }: { children: ReactNode }) {
  return <div className="lock"><Lock />{children}</div>;
}

export function Chips<T extends string>({ options, value, onChange, disabled }: { options: readonly T[]; value: T[]; onChange: (v: T[]) => void; disabled?: (o: T) => boolean }) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = value.includes(o);
        const dis = disabled?.(o);
        return (
          <button type="button" key={o} className={`chip ${on ? 'on' : ''}`} disabled={dis} style={dis ? { opacity: 0.5 } : undefined}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])} aria-pressed={on}>
            {on && <Check />}{o}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Toast ---------- */
type ToastTone = 'success' | 'error';
const ToastCtx = createContext<(msg: string, tone?: ToastTone) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; tone: ToastTone } | null>(null);
  const show = useCallback((msg: string, tone: ToastTone = 'success') => setToast({ msg, tone }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tone === 'error' ? 5000 : 3200);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast ${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
          {toast.tone === 'error' ? <CircleX /> : <CircleCheck />}{toast.msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- Tooltip ---------- */
type Tip = { x: number; y: number; content: ReactNode } | null;
const TipCtx = createContext<{ show: (e: MouseEvent, c: ReactNode) => void; showAt: (x: number, y: number, c: ReactNode) => void; hide: () => void }>({ show: () => {}, showAt: () => {}, hide: () => {} });
export function TooltipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<Tip>(null);
  const show = useCallback((e: MouseEvent, content: ReactNode) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top, content });
  }, []);
  const showAt = useCallback((x: number, y: number, content: ReactNode) => setTip({ x, y, content }), []);
  const hide = useCallback(() => setTip(null), []);
  // A hovered element can unmount on navigation without firing mouseleave
  useEffect(() => {
    window.addEventListener('hashchange', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('hashchange', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [hide]);
  return (
    <TipCtx.Provider value={{ show, showAt, hide }}>
      {children}
      {tip && <div className="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.content}</div>}
    </TipCtx.Provider>
  );
}
export const useTooltip = () => useContext(TipCtx);
