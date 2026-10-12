import React, { useState } from 'react';
import { useAuth } from '../../auth.jsx';
import { api } from '../../api.js';
import { Button, Field, Input, useToast, Avatar } from '../../components/Ui.jsx';
import { PageHead } from '../../components/Layout.jsx';

export default function Profile() {
  const { user, refresh } = useAuth(); const toast = useToast();
  const [f, setF] = useState({ first_name: user.first_name, last_name: user.last_name, job_title: user.job_title || '', department: user.department || '', location: user.location || '', email_notifications: !!user.email_notifications });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const save = async (e) => { e.preventDefault(); try { await api.put('/api/auth/me', f); await refresh(); toast.success('Profile saved'); } catch (err) { toast.error(err); } };
  const changePw = async (e) => { e.preventDefault(); try { await api.put('/api/auth/me/password', pw); setPw({ currentPassword: '', newPassword: '' }); toast.success('Password changed'); } catch (err) { toast.error(err); } };
  return (
    <>
      <PageHead title="My profile" />
      {user.must_change_password ? <div className="notice amber mb">Your account was migrated or created with a temporary password. Please set a new password below.</div> : null}
      <div className="grid cols-2">
        <form className="card pad" onSubmit={save}><div className="row mb"><Avatar user={user} size="lg" /><div><div className="strong">{user.name}</div><div className="small muted">{user.email} · {user.role}</div></div></div>
          <div className="form-row"><Field label="First name"><Input value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></Field><Field label="Last name"><Input value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></Field></div>
          <div className="form-row"><Field label="Job title"><Input value={f.job_title} onChange={(e) => setF({ ...f, job_title: e.target.value })} /></Field><Field label="Department"><Input value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></Field></div>
          <Field label="Location"><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
          <label className="check mb"><input type="checkbox" checked={f.email_notifications} onChange={(e) => setF({ ...f, email_notifications: e.target.checked })} /> Email me about enrolments, due dates and certificate expiry</label>
          <Button>Save profile</Button></form>
        <form className="card pad" onSubmit={changePw}><h3>Change password</h3>
          <Field label="Current password"><Input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required /></Field>
          <Field label="New password" hint="At least 8 characters."><Input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required minLength={8} /></Field>
          <Button variant="secondary">Update password</Button></form>
      </div>
    </>
  );
}
