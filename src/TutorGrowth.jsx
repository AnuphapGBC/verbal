import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Check, Circle, Copy, ExternalLink, Heart, Rocket, RefreshCw, Users } from 'lucide-react';
import { api, dateTime, defaultAvatar, imageFallback } from './api';
import './tutor-growth.css';

export default function TutorGrowth({ user, onTeaching, onSettings, onPreview }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const linkInput = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api('/teaching/growth', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      if (!result || !Object.hasOwn(result, 'tutor') || (result.tutor && (!result.stats || !result.boost || !Array.isArray(result.checklist)))) throw new Error('Your tutor overview could not be loaded.');
      setData(result);
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version, user.image]);
  async function boost() {
    setBusy(true); setError(''); setNotice('');
    try { await api('/teaching/boost', { method: 'POST', body: {} }); setNotice('Your free visibility boost is active for 24 hours.'); setVersion(value => value + 1); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const link = data?.profilePath ? `${window.location.origin}${data.profilePath}` : '';
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setNotice('Your profile link is copied. Share it with someone who would enjoy your lessons.'); }
    catch { linkInput.current?.focus(); linkInput.current?.select(); setNotice('Select and copy your profile link below.'); }
  }
  const checklistAction = id => id === 'photo' ? onSettings() : onTeaching(id === 'availability' ? 'schedule' : 'profile');
  return <div className="workspace-page growth-page">
    <div className="workspace-title"><div><div className="eyebrow">YOUR TEACHING, A LITTLE FURTHER</div><h1>Good teaching deserves<br />to be discovered.</h1><p>Your profile, your reach, and the next student you could help.</p></div><button className="outlined-btn" onClick={() => onTeaching('schedule')}><CalendarDays size={18} /> Manage lesson times</button></div>
    {notice && <p className="growth-notice" role="status"><Check size={18} />{notice}</p>}
    {error && <p className="form-error" role="alert">{error} <button onClick={() => setVersion(value => value + 1)}>Try again</button></p>}
    {loading ? <p className="loading-state" role="status">Getting your teaching overview ready…</p> : !data?.tutor ? !error && <section className="panel"><h2>Your next student starts with your story.</h2><p className="muted">Publish your tutor profile, add a photo, and offer a time for a first conversation.</p><button className="dark-btn" onClick={() => onTeaching('profile')}>Create my tutor profile <ArrowRight size={18} /></button></section> : <>
      <section className="growth-identity"><img src={data.tutor.image || defaultAvatar} onError={imageFallback} alt={`${data.tutor.name}'s profile`} width="72" height="72" /><div><span className="eyebrow">{data.tutor.active ? 'YOUR PROFILE IS PUBLISHED' : 'YOUR PROFILE IS PAUSED'}</span><h2>{data.tutor.name}</h2><p>{data.tutor.language} · ${data.tutor.price} USD per lesson</p></div><button className="mini-btn" onClick={() => onTeaching('profile')}>Edit profile <ArrowRight size={16} /></button></section>
      <dl className="growth-stats"><div><dt><Heart size={17} /> Saved by students</dt><dd>{data.stats.savedBy}</dd></div><div><dt><Users size={17} /> Students booked</dt><dd>{data.stats.learners}</dd></div><div><dt><Check size={17} /> Lessons completed</dt><dd>{data.stats.completedLessons}</dd></div><div><dt><CalendarDays size={17} /> Open lesson times</dt><dd>{data.stats.openSlots}</dd></div></dl>
      <div className="growth-columns"><section className="panel growth-boost"><div className="growth-section-icon"><Rocket size={25} /></div><span className="eyebrow">A LITTLE HELP GETTING SEEN</span><h2>Give your profile a lift.</h2><p>A free 24-hour boost places your profile higher in matching tutor searches. Available once every seven days, with a photo and open lesson times.</p><p className="growth-boost-note">Language and budget filters still apply. A boost helps discovery; bookings depend on student interest.</p>
        {data.boost.active ? <div className="growth-boost-active" role="status"><Check size={18} /><span>Boost active until <strong>{dateTime(data.boost.endsAt)}</strong></span></div> : <button className="dark-btn" disabled={busy || !data.boost.canBoost} onClick={boost}><Rocket size={18} />{busy ? 'Activating…' : 'Activate free boost'}</button>}
        {!data.boost.active && data.boost.nextAvailableAt && new Date(data.boost.nextAvailableAt).getTime() > Date.now() && <p className="field-hint">Your next boost is available {dateTime(data.boost.nextAvailableAt)}.</p>}
        {!data.tutor.active && <p className="field-hint">Your listing is paused. Contact an administrator to restore visibility.</p>}
        {!data.boost.canBoost && !data.boost.active && data.checklist.some(item => !item.complete) && <p className="field-hint">Complete the profile steps beside this panel to get ready.</p>}
      </section><section className="panel growth-readiness"><div className="panel-heading"><h2>Ready for a first hello?</h2><span>{data.checklist.filter(item => item.complete).length}/{data.checklist.length}</span></div><p className="muted">Small details help students choose with confidence.</p><ul>{data.checklist.map(item => <li key={item.id}><span className={item.complete ? 'is-complete' : ''}>{item.complete ? <Check size={18} /> : <Circle size={18} />}</span><div><strong>{item.label}</strong><small>{item.complete ? 'Ready' : 'One small step to go'}</small></div><button className="mini-btn" onClick={() => checklistAction(item.id)}>{item.complete ? 'Edit' : 'Add'}<ArrowRight size={15} /></button></li>)}</ul></section></div>
      <section className="panel growth-share"><div><div className="eyebrow">YOUR OWN LITTLE FRONT DOOR</div><h2>Take your profile with you.</h2><p className="muted">Share your direct profile link on your website or with a community that wants to learn.</p></div><div><label htmlFor="tutor-share-link">Your public profile link<input ref={linkInput} id="tutor-share-link" value={link} readOnly onFocus={event => event.target.select()} /></label><div className="growth-share-actions"><button className="dark-btn" disabled={!data.tutor.active} onClick={copyLink}><Copy size={17} /> Copy link</button><button className="outlined-btn" disabled={!data.tutor.active} onClick={() => onPreview(data.tutor)}><ExternalLink size={17} /> Preview profile</button><button className="icon-btn" aria-label="Refresh tutor overview" onClick={() => setVersion(value => value + 1)}><RefreshCw size={17} /></button></div></div></section>
    </>}
  </div>;
}
