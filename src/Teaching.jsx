import React, { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, CalendarPlus, Check, Clock3, Globe2, RefreshCw, Trash2 } from 'lucide-react';
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
  return <form className="tutor-edit-form" onSubmit={submit}>
    <fieldset><legend><span>1</span> A little about you</legend><div className="form-grid"><label>Profile name<input name="name" autoComplete="name" defaultValue={tutor?.name || user.name} required minLength={2} maxLength={80} /><small className="field-hint">The name learners will see.</small></label><label>Where are you from?<select name="country" defaultValue={tutor?.country || 'Canada'}>{countries.map(country => <option key={country.name}>{country.name}</option>)}</select></label><label>Language you teach<select name="language" defaultValue={tutor?.language || 'English'}>{languages.map(language => <option key={language}>{language}</option>)}</select></label><label>Your lesson price (USD)<input name="price" type="number" min={5} max={500} step={1} required defaultValue={tutor?.price || 25} /><small className="field-hint">For one 50-minute lesson. Learners pay later.</small></label></div><label>Languages you speak<input name="native" required minLength={3} maxLength={200} defaultValue={tutor?.native || ''} placeholder="For example: English (Native), French (B2)" /></label></fieldset>
    <fieldset><legend><span>2</span> Help learners get to know you</legend><label>A short introduction<input name="tag" required minLength={5} maxLength={120} defaultValue={tutor?.tag || ''} placeholder="Friendly conversation practice for everyday life" /><small className="field-hint">A simple headline that describes your lessons.</small></label><label>Your teaching story<textarea name="bio" required minLength={40} maxLength={3000} rows={5} defaultValue={tutor?.bio || ''} placeholder="What do you enjoy teaching? How do you help people feel comfortable? Tell learners in your own words." /><small className="field-hint">At least 40 characters. Share your approach and experience.</small></label></fieldset>
    {!tutor && <p className="sample-notice">Your name, country, languages, price, and introduction will be public. Tutor profiles are self-published and are not independently verified.</p>}{error && <p className="form-error" role="alert">{error}</p>}<button className="dark-btn" disabled={busy}>{busy ? 'Saving your profile…' : tutor ? 'Save profile changes' : 'Publish my tutor profile'} <ArrowRight size={18} /></button>
  </form>;
}

const localInputDate = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);

export default function Teaching({ user, onUserChanged, onMessage, notify }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState('schedule');
  const [busy, setBusy] = useState(false);
  const [slotError, setSlotError] = useState('');
  useEffect(() => {
    let active = true; setError(''); setLoading(true);
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
  return <div className="workspace-page teaching-page"><div className="workspace-title"><div><div className="eyebrow">YOUR TEACHING CORNER</div><h1>{data?.tutor ? 'Make room for a little progress.' : 'You have a world to share.'}</h1><p>{data?.tutor ? 'Your schedule, your learners, and the conversations you make possible.' : 'Create your profile, add a lesson time, and help someone find their voice.'}</p></div><button className="icon-btn" disabled={loading} aria-label="Refresh teaching dashboard" onClick={() => setVersion(value => value + 1)}><RefreshCw size={18} /></button></div>
    {loading ? <p className="loading-state" role="status">Getting your teaching space ready…</p> : error ? <p className="form-error" role="alert">{error} <button onClick={() => setVersion(value => value + 1)}>Try again</button></p> : !data?.tutor ? <section className="panel onboarding-panel"><div className="onboarding-welcome"><span><Globe2 size={28} /></span><div><h2>A profile that sounds like you.</h2><p>Start with the basics. Your next step will be adding your available times.</p></div></div><p className="muted">Set your own price. Learners reserve now and pay later; Verbal doesn’t process payments.</p><TutorForm user={user} onSaved={refresh} notify={notify} /></section> : <>
      <div className="teaching-banner"><div><span className="eyebrow">YOUR TUTOR PROFILE</span><h2>{data.tutor.name}</h2><p>{data.tutor.language} <span>·</span> ${data.tutor.price} USD per 50-minute lesson</p></div><span className="teaching-profile-icon" aria-hidden="true"><Globe2 size={36} /></span></div>
      <div className="tabs workspace-tabs" aria-label="Teaching views"><button aria-pressed={tab === 'schedule'} onClick={() => setTab('schedule')}>My schedule</button><button aria-pressed={tab === 'lessons'} onClick={() => setTab('lessons')}>Learners & lessons</button><button aria-pressed={tab === 'profile'} onClick={() => setTab('profile')}>My profile</button></div>
      {tab === 'profile' && <section className="panel"><h2>Your introduction</h2><TutorForm tutor={data.tutor} user={user} onSaved={refresh} notify={notify} /></section>}
      {tab === 'schedule' && <section className="panel schedule-panel"><div className="panel-heading"><h2>When would you like to teach?</h2><CalendarPlus size={24} /></div><p className="muted">Pick a start time. We’ll make it a 50-minute lesson.</p><div className="timezone-note"><Globe2 size={17} /><span>All times in <strong>{timeZone.replaceAll('_',' ')}</strong></span></div><form className="availability-form" onSubmit={addSlot}><label>New lesson date and start time<input type="datetime-local" name="startsAt" min={localInputDate(new Date(Date.now()+6*60000))} max={localInputDate(new Date(Date.now()+90*86400000))} required /><small className="field-hint">From 6 minutes to 90 days ahead.</small></label><button className="dark-btn" disabled={busy}>{busy ? 'Adding your time…' : 'Add lesson time'} <CalendarPlus size={18} /></button></form>{slotError && <p className="form-error" role="alert">{slotError}</p>}<div className="schedule-list-heading"><h3>Your lesson times</h3><span>{data.slots.filter(slot=>!slot.booked).length} open · {data.slots.filter(slot=>slot.booked).length} reserved</span></div><div className="availability-list">{!data.slots.length && <div className="empty-inline"><CalendarDays size={28} /><h3>A little space on your calendar.</h3><p>Add your first time above so learners can book a conversation.</p></div>}{data.slots.map(slot => <div className="availability-row" key={slot.id}><span className="availability-calendar" aria-hidden="true"><CalendarDays size={20} /></span><span><strong>{dateTime(slot.startsAt)}</strong><small><Clock3 size={13} /> 50-minute lesson</small></span><span className={`status-pill ${slot.booked ? 'confirmed' : ''}`}>{slot.booked ? <><Check size={12} /> Reserved</> : 'Open to book'}</span><button className="icon-btn danger-text" aria-label={`Remove lesson time ${dateTime(slot.startsAt)}`} disabled={slot.booked || busy} onClick={() => removeSlot(slot)}><Trash2 size={17} /></button></div>)}</div><p className="schedule-footnote">Overlapping times can’t be added. To keep lesson history intact, times with a current or previous reservation can’t be removed.</p></section>}
      {tab === 'lessons' && <section className="panel"><h2>The people learning with you.</h2><p className="muted">Times in {timeZone.replaceAll('_',' ')}. Message each learner to agree on how you’ll meet.</p>{!data.bookings.length ? <div className="empty-inline"><CalendarDays size={28} /><h3>Your first learner is still to come.</h3><p>Keep your profile personal and your lesson times up to date.</p></div> : <LessonList bookings={data.bookings} teaching onRefresh={refresh} onMessage={onMessage} notify={notify} />}</section>}
    </>}
  </div>;
}
