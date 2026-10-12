import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Icons } from './Icons.jsx';
import { api } from '../api.js';
import { Avatar } from './Ui.jsx';

export default function Layout() {
  const { user, logout, unread, setUnread, isStaff, isAdmin, brand, theme } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const ref = useRef();
  useEffect(() => { const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setShowNotif(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const openNotifs = async () => { setShowNotif((s) => !s); if (!showNotif) { const d = await api.get('/api/notifications'); setNotifs(d.notifications); } };
  const markAll = async () => { await api.post('/api/notifications/read', {}); setUnread(0); setNotifs((n) => n.map((x) => ({ ...x, read: 1 }))); };
  const openNotif = async (n) => { if (!n.read) { await api.post('/api/notifications/read', { ids: [n.id] }); setUnread((u) => Math.max(0, u - 1)); } setShowNotif(false); if (n.link) nav(n.link); };

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="logo"><Link to="/"><img src={theme.logoUrl} alt={theme.companyName} style={{ background: theme.logoBackground, borderRadius: 6 }} /></Link><div className="portal">{brand.name}</div></div>
        <nav className="nav" onClick={() => setOpen(false)}>
          <div className="section">My learning</div>
          <NavLink to="/" end><Icons.home />Dashboard</NavLink>
          <NavLink to="/catalog"><Icons.grid />Course catalogue</NavLink>
          <NavLink to="/sessions"><Icons.calendar />Live sessions</NavLink>
          <NavLink to="/certificates"><Icons.award />Certificates</NavLink>
          {isStaff && (<>
            <div className="section">Manage</div>
            <NavLink to="/admin" end><Icons.chart />Overview</NavLink>
            <NavLink to="/admin/courses"><Icons.book />Courses</NavLink>
            <NavLink to="/admin/paths"><Icons.layers />Learning paths</NavLink>
            <NavLink to="/admin/enrollments"><Icons.tick />Enrolments</NavLink>
            <NavLink to="/admin/sessions"><Icons.video />Live sessions</NavLink>
            {isAdmin && <NavLink to="/admin/users"><Icons.users />Users & groups</NavLink>}
            <NavLink to="/admin/reports"><Icons.chart />Reports</NavLink>
            {isAdmin && <NavLink to="/admin/import"><Icons.database />Migrate / import</NavLink>}
            {isAdmin && <NavLink to="/admin/companies"><Icons.layers />Companies & branding</NavLink>}
            {isAdmin && <NavLink to="/admin/settings"><Icons.settings />Settings</NavLink>}
          </>)}
        </nav>
        <div className="foot">{brand.company} · {brand.tagline}<br /><a href={brand.website} target="_blank" rel="noreferrer">{String(brand.website || '').replace(/^https?:\/\/(www\.)?/, '')}</a></div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="iconbtn" style={{ display: 'none' }} id="menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Menu"><Icons.menu /></button>
          <form className="search" onSubmit={(e) => { e.preventDefault(); nav(`/catalog?q=${encodeURIComponent(e.target.q.value)}`); }}><Icons.search /><input name="q" placeholder="Search courses…" aria-label="Search courses" /></form>
          <div className="spacer" />
          <div style={{ position: 'relative' }} ref={ref}>
            <button className="iconbtn" onClick={openNotifs} aria-label="Notifications" data-testid="notif-bell"><Icons.bell />{unread > 0 && <span className="dot">{unread}</span>}</button>
            {showNotif && (
              <div className="dropdown">
                <div className="card-head"><h3>Notifications</h3><button className="btn ghost sm" onClick={markAll}>Mark all read</button></div>
                <div className="list">{notifs.length === 0 && <div className="empty small">You're all caught up.</div>}
                  {notifs.map((n) => <div key={n.id} className={`notif ${n.read ? '' : 'unread'}`} style={{ cursor: 'pointer' }} onClick={() => openNotif(n)}><div><div className="t">{n.title}</div><div className="b">{n.body}</div><div className="tiny muted">{new Date(n.created_at).toLocaleString('en-IE')}</div></div></div>)}
                </div>
              </div>
            )}
          </div>
          <Link to="/profile" className="userchip" style={{ color: 'inherit', textDecoration: 'none' }}><Avatar user={user} /><div><div className="name">{user.name}</div><div className="role">{user.role}</div></div></Link>
          <button className="iconbtn" onClick={async () => { await logout(); nav('/login'); }} title="Sign out" aria-label="Sign out"><Icons.logout /></button>
        </header>
        <main className="content"><Outlet /></main>
      </div>
      <style>{`@media (max-width: 980px) { #menu-btn { display: inline-flex !important; } }`}</style>
    </div>
  );
}

export const PageHead = ({ title, sub, children }) => (<div className="page-head"><div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>{children && <div className="actions">{children}</div>}</div>);
