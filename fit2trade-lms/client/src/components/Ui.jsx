import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Icons } from './Icons.jsx';

const ToastCtx = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, kind = 'info') => { const id = Math.random(); setToasts((t) => [...t, { id, message, kind }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200); }, []);
  const toast = { info: (m) => push(m, 'info'), success: (m) => push(m, 'success'), error: (m) => push(m?.message || String(m), 'error') };
  return <ToastCtx.Provider value={toast}>{children}<div className="toasts">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>)}</div></ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

export const Button = ({ variant = '', size = '', icon: Icon, children, className = '', ...p }) => (
  <button className={`btn ${variant} ${size} ${className}`} {...p}>{Icon && <Icon />}{children}</button>
);
export const Badge = ({ tone = '', children, ...rest }) => <span className={`badge ${tone}`} {...rest}>{children}</span>;
export const StatusBadge = ({ status }) => {
  const map = { completed: ['', 'Completed'], in_progress: ['blue', 'In progress'], enrolled: ['grey', 'Not started'], not_started: ['grey', 'Not started'], failed: ['red', 'Failed'], published: ['', 'Published'], draft: ['amber', 'Draft'], archived: ['grey', 'Archived'], active: ['', 'Active'], inactive: ['grey', 'Inactive'], scheduled: ['blue', 'Scheduled'], cancelled: ['red', 'Cancelled'], registered: ['blue', 'Registered'], attended: ['', 'Attended'], absent: ['red', 'Absent'], sent: ['', 'Sent'], skipped: ['amber', 'Skipped (no SMTP)'], queued: ['blue', 'Queued'], preview: ['amber', 'Preview'] };
  const [tone, label] = map[status] || ['grey', status];
  return <Badge tone={tone}>{label}</Badge>;
};
export const Progress = ({ value = 0, tone = '' }) => <div className={`progress ${tone}`}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
export const Ring = ({ value = 0, size = 64 }) => { const r = (size - 8) / 2, c = 2 * Math.PI * r; return (<div className="ring" style={{ width: size, height: size }}><svg width={size} height={size}><circle cx={size / 2} cy={size / 2} r={r} stroke="#e9edeb" strokeWidth="7" fill="none" /><circle cx={size / 2} cy={size / 2} r={r} stroke="#275c4d" strokeWidth="7" fill="none" strokeDasharray={c} strokeDashoffset={c - (c * Math.min(100, value)) / 100} strokeLinecap="round" /></svg><div className="txt">{Math.round(value)}%</div></div>); };
export const Stat = ({ icon: Icon = Icons.chart, tone = '', value, label }) => (<div className="stat"><div className={`ico ${tone}`}><Icon /></div><div><div className="val">{value}</div><div className="lbl">{label}</div></div></div>);
export const Spinner = () => <div className="spinner" aria-label="Loading" />;
export const Empty = ({ icon: Icon = Icons.book, title, children }) => (<div className="empty"><Icon /><div className="strong">{title}</div><div className="small">{children}</div></div>);
export const Avatar = ({ user, size = '' }) => <div className={`avatar ${size}`}>{(user?.first_name?.[0] || '') + (user?.last_name?.[0] || '')}</div>;

export function Modal({ title, children, onClose, footer, wide }) {
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose?.(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="head"><h3>{title}</h3><button className="iconbtn" onClick={onClose} aria-label="Close"><Icons.x /></button></div>
        <div className="body">{children}</div>
        {footer && <div className="foot">{footer}</div>}
      </div>
    </div>
  );
}

export const Field = ({ label, hint, children }) => (<div className="field">{label && <label>{label}</label>}{children}{hint && <div className="hint">{hint}</div>}</div>);
export const Input = (p) => <input className="input" {...p} />;
export const Select = ({ children, ...p }) => <select className="select" {...p}>{children}</select>;
export const Textarea = (p) => <textarea className="textarea" {...p} />;
export const Tabs = ({ tabs, value, onChange }) => <div className="tabs">{tabs.map((t) => <button key={t.id} className={value === t.id ? 'active' : ''} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>;

export function Bars({ data, labelKey = 'label', valueKey = 'value' }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey] || 0));
  return <div className="bars">{data.map((d, i) => <div className="bar" key={i} title={`${d[labelKey]}: ${d[valueKey]}`}><span className="tiny strong">{d[valueKey] || ''}</span><i style={{ height: `${((d[valueKey] || 0) / max) * 100}%` }} /><b>{d[labelKey]}</b></div>)}</div>;
}
export function HBars({ data, labelKey = 'label', valueKey = 'value', totalKey }) {
  const max = Math.max(1, ...data.map((d) => d[totalKey || valueKey] || 0));
  return <div>{data.map((d, i) => <div className="hbar" key={i}><span className="nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{d[labelKey]}</span><div className="progress"><span style={{ width: `${((d[valueKey] || 0) / max) * 100}%` }} /></div><span className="right small">{d[valueKey]}{totalKey ? ` / ${d[totalKey]}` : ''}</span></div>)}</div>;
}
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const reload = useCallback(() => { setState((s) => ({ ...s, loading: s.data == null })); return fn().then((data) => setState({ loading: false, data, error: null })).catch((error) => setState({ loading: false, data: null, error })); }, deps); // eslint-disable-line
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) };
}
export const confirmDialog = (msg) => window.confirm(msg);
