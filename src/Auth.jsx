import React, { useId, useRef, useState } from 'react';
import { ArrowRight, Eye, EyeOff, MessageCircle } from 'lucide-react';
import { api, goals } from './api';
import './forms.css';

export function PasswordField({ label = 'Password', name = 'password', autoComplete = 'current-password', minLength = 1, disabled = false }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className="password-field"><label htmlFor={id}>{label}</label><div className="password-input"><input id={id} name={name} type={visible ? 'text' : 'password'} required minLength={minLength} maxLength={128} autoComplete={autoComplete} disabled={disabled} /><button type="button" disabled={disabled} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></div>;
}

export default function Auth({ onSuccess, reason, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const uid = useId();
  const tabs = useRef([]);
  const modes = ['login', 'register'];
  function choose(next) { setMode(next); setError(''); }
  function tabKey(event, index) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
    choose(modes[next]); tabs.current[next]?.focus();
  }
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const { user } = await api(`/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: values });
      onSuccess(user);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <div className="auth-panel">
    <span className="form-welcome-icon" aria-hidden="true"><MessageCircle size={24} /></span>
    <div className="eyebrow">YOUR PLACE TO GROW</div>
    <h2>{mode === 'login' ? 'Good to see you.' : 'Let’s start with hello.'}</h2>
    <p className="muted">{reason || (mode === 'login' ? 'Pick up where you left off. Your lessons and conversations are right here.' : 'Find a tutor, make a connection, and learn at your own pace.')}</p>
    <div className="segmented auth-tabs" role="tablist" aria-label="Account access">
      {modes.map((value, index) => <button ref={node => { tabs.current[index] = node; }} key={value} id={`${uid}-${value}`} role="tab" aria-selected={mode === value} aria-controls={`${uid}-panel`} tabIndex={mode === value ? 0 : -1} type="button" disabled={busy} onClick={() => choose(value)} onKeyDown={event => tabKey(event, index)}>{value === 'login' ? 'Log in' : 'Create account'}</button>)}
    </div>
    <form key={mode} id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${mode}`} onSubmit={submit}>
      {mode === 'register' && <label>Your name<input name="name" autoComplete="name" required minLength={2} maxLength={80} placeholder="Alex Taylor" disabled={busy} /></label>}
      <label>Email address<input name="email" type="email" autoComplete="email" autoCapitalize="none" required maxLength={254} placeholder="you@example.com" disabled={busy} /></label>
      <PasswordField minLength={mode === 'register' ? 10 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} disabled={busy} />
      {mode === 'register' && <><small className="field-hint">Use a unique password with at least 10 characters.</small><label>What brings you here?<select name="goal" disabled={busy}>{goals.map(goal => <option key={goal}>{goal}</option>)}</select></label></>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="dark-btn full" disabled={busy}>{busy ? 'One moment…' : mode === 'login' ? 'Log in to my space' : 'Create my account'} <ArrowRight size={18} /></button>
      {mode === 'register' && <p className="booking-disclaimer">Your account helps you manage lessons and messages. You can download or delete your data in Settings.</p>}
    </form>
  </div>;
}
