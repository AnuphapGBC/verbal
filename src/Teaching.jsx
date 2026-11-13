import React, { useEffect, useState } from 'react';
import { ArrowRight, CalendarPlus, RefreshCw, Trash2 } from 'lucide-react';
import { api, dateTime, languages, timeZone } from './api';
import { LessonList } from './Dashboard';

const countries = [{ name: 'Canada', flag: '🇨🇦' }, { name: 'United States', flag: '🇺🇸' }, { name: 'United Kingdom', flag: '🇬🇧' }, { name: 'Spain', flag: '🇪🇸' }, { name: 'France', flag: '🇫🇷' }, { name: 'Germany', flag: '🇩🇪' }, { name: 'Italy', flag: '🇮🇹' }, { name: 'Japan', flag: '🇯🇵' }, { name: 'Other', flag: '🌍' }];
function TutorForm({ tutor, user, onSaved, notify }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    values.price = Number(values.price); values.flag = countries.find(country => country.name === values.country)?.flag || '🌍';
    try { await api('/teaching', { method: tutor ? 'PATCH' : 'POST', body: values }); notify(tutor ? 'Your tutor profile is updated.' : 'Your tutor profile is published. Add availability to start teaching.'); onSaved(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <form className="tutor-edit-form" onSubmit={submit}><div className="form-grid"><label>Display name<input name="name" defaultValue={tutor?.name || user.name} required minLength={2} maxLength={80} /></label><label>Country<select name="country" defaultValue={tutor?.country || 'Canada'}>{countries.map(country => <option key={country.name}>{country.name}</option>)}</select></label><label>Teaching language<select name="language" defaultValue={tutor?.language || 'English'}>{languages.map(language => <option key={language}>{language}</option>)}</select></label><label>Price per 50-minute lesson (USD)<input name="price" type="number" min={5} max={500} required defaultValue={tutor?.price || 25} /></label></div><label>Languages you speak<input name="native" required minLength={3} maxLength={200} defaultValue={tutor?.native || ''} placeholder="English (Native), French (B2)" /></label><label>Your profile headline<input name="tag" required minLength={5} maxLength={120} defaultValue={tutor?.tag || ''} placeholder="Friendly conversation practice for everyday life" /></label><label>Introduce yourself<textarea name="bio" required minLength={40} maxLength={3000} rows={5} defaultValue={tutor?.bio || ''} placeholder="Tell learners about your approach, experience, and the conversations you love to have. Please share at least 40 characters." /></label>{!tutor && <p className="sample-notice">Publishing creates a public tutor profile with your display name, country, languages, price, and introduction. Profiles are self-published and are not verified by Verbal.</p>}{error && <p className="form-error" role="alert">{error}</p>}<button className="dark-btn" disabled={busy}>{busy ? 'Saving…' : tutor ? 'Save profile' : 'Publish my tutor profile'} <ArrowRight size={18} /></button></form>;
}

export default function Teaching({ user, onUserChanged, onMessage, notify }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState('schedule');
  const [busy, setBusy] = useState(false);
  const [slotError, setSlotError] = useState('');
  useEffect(() => {
    let active = true; setError('');
    api('/teaching').then(result => { if (active) setData(result); }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);
  const refresh = () => { setVersion(value => value + 1); onUserChanged(); };
  async function addSlot(event) {
    event.preventDefault(); setBusy(true); setSlotError(''); const form = event.currentTarget;
    const date = new Date(new FormData(form).get('startsAt'));
    if (!Number.isFinite(date.getTime())) { setSlotError('Choose a valid date and time.'); setBusy(false); return; }
    try { await api('/teaching/availability', { method: 'POST', body: { startsAt: date.toISOString() } }); form.reset(); refresh(); notify('Your new lesson time is available to learners.'); }
    catch (err) { setSlotError(err.message); } finally { setBusy(false); }
  }
  async function removeSlot(slot) {
    if (!window.confirm(`Remove availability on ${dateTime(slot.startsAt)}?`)) return;
    setBusy(true); setSlotError('');
    try { await api(`/teaching/availability/${slot.id}`, { method: 'DELETE' }); refresh(); }
    catch (err) { setSlotError(err.message); } finally { setBusy(false); }
  }
  return <div className="workspace-page"><div className="workspace-title"><div><div className="eyebrow">SHARE YOUR WORLD</div><h1>{data?.tutor ? 'Your teaching space.' : 'Good conversations start with you.'}</h1><p>{data?.tutor ? 'Manage your profile, lesson times, and learner connections.' : 'Help someone find their voice. Create your tutor profile and set your schedule.'}</p></div><button className="icon-btn" aria-label="Refresh teaching dashboard" onClick={() => setVersion(value => value + 1)}><RefreshCw size={18} /></button></div>
    {loading ? <p className="loading-state" role="status">Loading your teaching space…</p> : error ? <p className="form-error" role="alert">{error} <button onClick={() => setVersion(value => value + 1)}>Try again</button></p> : !data?.tutor ? <section className="panel onboarding-panel"><h2>A tutor profile that sounds like you.</h2><p className="muted">Set your own price and add the times you’re available. Reservations are pay later; Verbal does not process payments.</p><TutorForm user={user} onSaved={refresh} notify={notify} /></section> : <>
      <div className="teaching-banner"><div><h2>{data.tutor.name}</h2><p>{data.tutor.language} · ${data.tutor.price} / lesson</p></div><span className="status-pill confirmed">Profile published</span></div>
      <div className="tabs workspace-tabs"><button aria-pressed={tab === 'schedule'} onClick={() => setTab('schedule')}>Availability</button><button aria-pressed={tab === 'lessons'} onClick={() => setTab('lessons')}>My learners & lessons</button><button aria-pressed={tab === 'profile'} onClick={() => setTab('profile')}>Edit profile</button></div>
      {tab === 'profile' && <section className="panel"><h2>Your introduction</h2><TutorForm tutor={data.tutor} user={user} onSaved={refresh} notify={notify} /></section>}
      {tab === 'schedule' && <section className="panel"><div className="panel-heading"><h2>Make time for a conversation.</h2><CalendarPlus size={24} /></div><p className="muted">Add a 50-minute lesson time in {timeZone}. Choose a start between 5 minutes and 90 days from now. Overlapping times cannot be added. Times with booking history cannot be removed.</p><form className="availability-form" onSubmit={addSlot}><label>Lesson start time<input type="datetime-local" name="startsAt" required /></label><button className="dark-btn" disabled={busy}>{busy ? 'Saving…' : 'Add availability'} <CalendarPlus size={17} /></button></form>{slotError && <p className="form-error" role="alert">{slotError}</p>}<div className="availability-list">{!data.slots.length && <div className="empty-inline">No availability yet. Add your first lesson time above.</div>}{data.slots.map(slot => <div className="availability-row" key={slot.id}><span><strong>{dateTime(slot.startsAt)}</strong><small>50 minutes</small></span><span className={`status-pill ${slot.booked ? 'confirmed' : ''}`}>{slot.booked ? 'Reserved' : 'Available'}</span><button className="icon-btn danger-text" aria-label={`Remove ${dateTime(slot.startsAt)}`} disabled={slot.booked || busy} onClick={() => removeSlot(slot)}><Trash2 size={16} /></button></div>)}</div></section>}
      {tab === 'lessons' && <section className="panel"><h2>Your lessons</h2><p className="muted">Times in {timeZone}. Message your learner to arrange how you’ll meet.</p>{!data.bookings.length ? <div className="empty-inline">Your first learner is still to come. Keep your profile and availability up to date.</div> : <LessonList bookings={data.bookings} teaching onRefresh={refresh} onMessage={onMessage} notify={notify} />}</section>}
    </>}
  </div>;
}
