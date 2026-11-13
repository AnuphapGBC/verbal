import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api, goals } from './api';

export default function Auth({ onSuccess, reason }) {
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError(''); setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const { user } = await api(`/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: values });
      onSuccess(user);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <div className="auth-panel">
    <div className="eyebrow">YOUR NEXT CHAPTER</div>
    <h2>{mode === 'login' ? 'Welcome back.' : 'Find your voice.'}</h2>
    <p className="muted">{reason || (mode === 'login' ? 'Sign in to your lessons, conversations, and favorite tutors.' : 'Create your account and start a new conversation.')}</p>
    <div className="segmented" aria-label="Account access">
      <button type="button" aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setError(''); }}>Log in</button>
      <button type="button" aria-pressed={mode === 'register'} onClick={() => { setMode('register'); setError(''); }}>Create account</button>
    </div>
    <form key={mode} onSubmit={submit}>
      {mode === 'register' && <label>Your name<input name="name" autoComplete="name" required minLength={2} maxLength={80} placeholder="Alex Taylor" /></label>}
      <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" /></label>
      <label>Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 10 : 1} maxLength={128} placeholder={mode === 'register' ? 'At least 10 characters' : 'Your password'} /></label>
      {mode === 'register' && <><small className="field-hint">Use a unique password with at least 10 characters.</small><label>I’m learning for<select name="goal">{goals.map(goal => <option key={goal}>{goal}</option>)}</select></label></>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="dark-btn full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'} <ArrowRight size={18} /></button>
      {mode === 'register' && <p className="booking-disclaimer">Your name and email are used to manage your account and lessons. You can export or delete your account in Settings.</p>}
    </form>
  </div>;
}
