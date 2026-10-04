import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Boxes, History, Radar, Bug, Library, FlaskConical, FileCheck, Settings, Moon, Sun, Search, ShieldCheck, Database, Gavel, Bot,
} from 'lucide-react';
import { useStore } from '../store/store';
import { OPEN_STATUSES, ROLES } from '../domain/framework';
import type { Role } from '../domain/types';

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('ai-assurance-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* ignore */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('ai-assurance-theme', theme); } catch { /* ignore */ }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))] as const;
}

export default function Layout() {
  const { state, api } = useStore();
  const [theme, toggle] = useTheme();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const me = ROLES.find((r) => r.role === state.role)!;
  const openCrit = state.findings.filter((f) => OPEN_STATUSES.includes(f.status) && (f.severity === 'Critical' || f.severity === 'High')).length;
  const running = state.scans.filter((s) => s.status === 'Running').length;
  const runningEvals = state.evaluations.filter((r) => r.status === 'Running').length;
  const judges = state.models.filter((m) => m.purpose === 'judge' && m.enabled).length;
  const engines = state.models.filter((m) => m.purpose === 'attack' && m.enabled).length;

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim().toLowerCase();
    if (!term) return;
    const f = state.findings.find((x) => x.id.toLowerCase() === term);
    if (f) return navigate(`/findings?open=${f.id}`);
    const s = state.scans.find((x) => x.id.toLowerCase() === term);
    if (s) return navigate(`/scans/${s.id}`);
    const a = state.applications.find((x) => x.name.toLowerCase().includes(term) || x.id.includes(term));
    if (a) return navigate(`/applications/${a.id}`);
    navigate(`/findings?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={19} /></div>
          <div>
            <div className="brand-name">AI Assurance</div>
            <div className="brand-sub">Evaluation & Red Teaming</div>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          <div className="nav-label">Overview</div>
          <NavLink to="/" end><LayoutDashboard />Dashboard</NavLink>
          <NavLink to="/applications"><Boxes />Applications</NavLink>
          <div className="nav-label">Assurance</div>
          <NavLink to="/runs"><History />Run history</NavLink>
          <NavLink to="/evaluations"><Gavel />Evaluations{runningEvals > 0 && <span className="count" style={{ background: 'rgba(124,116,255,.2)', color: '#c4c0ff' }}>{runningEvals}</span>}</NavLink>
          <NavLink to="/scans"><Radar />Red team scans{running > 0 && <span className="count" style={{ background: 'rgba(124,116,255,.2)', color: '#c4c0ff' }}>{running}</span>}</NavLink>
          <NavLink to="/findings"><Bug />Findings{openCrit > 0 && <span className="count" title="Open critical and high">{openCrit}</span>}</NavLink>
          <NavLink to="/library"><Library />Test library</NavLink>
          <NavLink to="/manual"><FlaskConical />Manual testing</NavLink>
          <div className="nav-label">Governance</div>
          <NavLink to="/evidence"><FileCheck />Evidence packs</NavLink>
          <NavLink to="/models"><Bot />AI models</NavLink>
          <NavLink to="/admin"><Settings />Administration</NavLink>
        </nav>
        <div className="side-foot">
          <span className="pill-dark"><Database size={12} />API connected · {judges} judges · {engines} attack engines</span>
          <span style={{ color: '#5f6b85' }}>Framework v1.0 · OWASP LLM 2025</span>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <form className="search" onSubmit={onSearch} role="search">
            <Search size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps, FND-0231, RT-1001…" aria-label="Search" />
            <span className="kbd">↵</span>
          </form>
          <div className="spacer" />
          <button className="icon-btn" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <div className="role-select">
            <div className="avatar" aria-hidden>{me.person.split(' ').map((p) => p[0]).join('')}</div>
            <div className="who">
              <b>{me.person}</b>
              <label className="sr-only" htmlFor="role">Viewing as role</label>
              <select id="role" value={state.role} onChange={(e) => api.setRole(e.target.value as Role)} title="Switch role to preview access rules (section 10.5)">
                {ROLES.map((r) => <option key={r.role} value={r.role}>{r.role}</option>)}
              </select>
            </div>
          </div>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
