import React, { useState } from 'react';
import { Check, Download, LogOut, Trash2 } from 'lucide-react';
import { api, goals } from './api';
import { PasswordField } from './Auth';

export default function Account({ user, onUpdated, onLogout, onDeleted, notify }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  async function update(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const { user: updated } = await api('/account', { method: 'PATCH', body: Object.fromEntries(new FormData(event.currentTarget)) }); onUpdated(updated); notify('Your profile has been updated.'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function exportData() {
    setBusy(true); setError('');
    try { const data = await api('/account/export'); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'verbal-account-export.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function changePassword(event) {
    event.preventDefault(); setBusy(true); setError('');
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (values.newPassword !== values.confirmPassword) { setError('Your new passwords do not match.'); setBusy(false); return; }
    try { await api('/account/password', { method: 'POST', body: { currentPassword: values.currentPassword, newPassword: values.newPassword } }); form.reset(); notify('Your password is changed. Other sessions have been logged out.'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function deleteAccount(event) {
    event.preventDefault();
    if (!window.confirm('Permanently delete your Verbal account, saved tutors, bookings, and messages? This cannot be undone.')) return;
    setBusy(true); setError('');
    try { await api('/account', { method: 'DELETE', body: { password: new FormData(event.currentTarget).get('password') } }); onDeleted(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="workspace-page account-page"><div className="workspace-title"><div><div className="eyebrow">MAKE YOURSELF AT HOME</div><h1>Account settings.</h1><p>A little about you and the way you want to learn.</p></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}<section className="panel"><h2>Your profile</h2><form onSubmit={update}><label>Display name<input required minLength={2} maxLength={80} name="name" defaultValue={user.name} autoComplete="name" /></label><label>Email address<input value={user.email} disabled readOnly /><small className="field-hint">Your email is used to sign in.</small></label><label>Learning goal<select name="goal" defaultValue={user.goal}>{!goals.includes(user.goal) && <option>{user.goal}</option>}{goals.map(goal => <option key={goal}>{goal}</option>)}</select></label><button className="dark-btn" disabled={busy}>Save changes <Check size={17} /></button></form></section>
    <section className="panel"><h2>Your password</h2><p className="muted">Use at least 10 characters. We’ll sign out your other sessions after you change it.</p><form onSubmit={changePassword}><PasswordField label="Current password" name="currentPassword" disabled={busy} /><PasswordField label="New password" name="newPassword" minLength={10} autoComplete="new-password" disabled={busy} /><PasswordField label="Confirm new password" name="confirmPassword" minLength={10} autoComplete="new-password" disabled={busy} /><button className="dark-btn" disabled={busy}>{busy ? 'Saving…' : 'Change password'} <Check size={17} /></button></form></section>
    <section className="panel"><h2>Your data, in your hands.</h2><p className="muted">Download a copy of your profile, lessons, saved tutors, and conversations.</p><div className="account-actions"><button className="outlined-btn" disabled={busy} onClick={exportData}><Download size={17} /> Download my data</button><button className="outlined-btn" disabled={busy} onClick={onLogout}><LogOut size={17} /> Log out</button></div></section>
    <section className="panel danger-panel"><h2>Delete your account</h2><p className="muted">This permanently removes your account, messages, and any tutor profile you’ve published. Cancel upcoming lessons first. Deletion cannot be undone.</p>{!deleting ? <button className="mini-btn danger-text" onClick={() => setDeleting(true)}><Trash2 size={16} /> Delete my account</button> : <form onSubmit={deleteAccount}><PasswordField label="Confirm your password" disabled={busy} /><button className="danger-btn" disabled={busy}>{busy ? 'Deleting…' : 'Permanently delete my account'}</button><button className="mini-btn" type="button" onClick={() => setDeleting(false)}>Keep my account</button></form>}</section>
  </div>;
}
