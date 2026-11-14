import React, { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Globe2, MessageCircle, Star } from 'lucide-react';
import { api, dateTime, timeZone, imageFallback, defaultAvatar } from './api';
import './forms.css';

const localDay = value => new Date(value).toLocaleDateString('en-CA');
const dayDate = day => new Date(`${day}T12:00:00`);
const dayLabel = day => dayDate(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const timeLabel = value => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function Reviews({ tutorId }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api(`/tutors/${tutorId}/reviews`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setReviews(data.reviews); })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tutorId, version]);
  return <section className="profile-reviews"><h3>From other learners</h3>{loading ? <p className="muted" role="status">Loading reviews…</p> : error ? <p className="form-error" role="alert">{error} <button onClick={() => setVersion(value => value + 1)}>Try again</button></p> : !reviews.length ? <p className="muted">A fresh start. Reviews appear here after completed lessons.</p> : <div className="review-list">{reviews.map(review => <article className="review-row" key={review.id}><div><strong>{review.learnerName}</strong><span aria-label={`${review.rating} out of 5 stars`}><Star size={14} fill="currentColor" /> {review.rating}/5</span></div>{review.body && <p>{review.body}</p>}<time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time></article>)}</div>}</section>;
}

export default function TutorProfile({ tutor, user, onAuth, onMessage, onBooked, onDashboard }) {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [day, setDay] = useState('');
  const [offset, setOffset] = useState(0);
  const [slotId, setSlotId] = useState('');
  const [goal, setGoal] = useState(user?.goal || '');
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError(''); setOffset(0); setSlotId('');
    api(`/tutors/${tutor.id}/availability`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setSlots(data.slots); setDay(data.slots[0] ? localDay(data.slots[0].startsAt) : ''); } })
      .catch(err => { if (err.name !== 'AbortError') setLoadError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tutor.id, retry]);
  const days = [...new Set(slots.map(slot => localDay(slot.startsAt)))];
  const chosen = slots.find(slot => slot.id === slotId);
  const own = tutor.userId && tutor.userId === user?.id;
  const preview = own || ['tutor', 'admin'].includes(user?.role);
  function changePage(next) { setOffset(next); setDay(days[next] || ''); setSlotId(''); }
  async function reserve() {
    if (preview) return;
    if (!user) { onAuth(); return; }
    if (!chosen) return;
    setBusy(true); setBookingError('');
    try {
      const { booking: record } = await api('/bookings', { method: 'POST', body: { slotId, goal } });
      setBooking({ ...record, startsAt: record.startsAt || chosen.startsAt }); onBooked();
    } catch (err) {
      setBookingError(err.message);
      if (err.status === 409 || err.status === 404) { setSlotId(''); setRetry(value => value + 1); }
    } finally { setBusy(false); }
  }
  if (booking) return <div className="confirmation booking-confirmation">
    <span className="confirmation-icon"><CheckCircle2 size={38} /></span><div className="eyebrow">ONE SMALL STEP. A NEW BEGINNING.</div>
    <h2>You’re on the calendar.</h2>
    <p>Your {tutor.isDemo ? 'sample ' : ''}{tutor.language.toLowerCase()} lesson with <strong>{tutor.name}</strong> is reserved.</p>
    <div className="confirmation-details"><span><CalendarDays size={18} /><strong>{dateTime(booking.startsAt)}</strong></span><span><Clock3 size={18} />50 minutes · ${booking.price || tutor.price} USD · Pay later</span><small>Times shown in {timeZone}</small></div>
    {tutor.isDemo ? <p className="sample-notice">This is a sample reservation for exploring Verbal. A real lesson will not take place.</p> : <p className="muted">You can message your tutor to share your goals and agree on how you’ll meet.</p>}
    <button className="dark-btn full" onClick={onDashboard}>Go to my lessons <ArrowRight size={18} /></button>
    {!tutor.isDemo && <button className="booking-message-link" onClick={() => onMessage(tutor)}><MessageCircle size={17} /> Say hello to {tutor.name.split(' ')[0]}</button>}
  </div>;
  return <div className="tutor-profile-content">
    <div className="profile-top"><img src={tutor.image || defaultAvatar} onError={imageFallback} alt={tutor.name} /><div><div className="eyebrow">{tutor.flag} {tutor.language} tutor</div><h2>Hi, I’m {tutor.name}.</h2><span className="rating">{Number(tutor.rating) > 0 ? <><Star size={15} fill="currentColor" /> {Number(tutor.rating).toFixed(1)} <span>· {tutor.reviews} {tutor.isDemo ? 'sample reviews' : 'reviews'}</span></> : <><span className="new-tutor-dot" /> New to Verbal</>}</span></div></div>
    {tutor.isDemo && <p className="sample-notice">Sample profile. This tutor, their reviews, and their available times are illustrative. You can explore booking without arranging a real lesson.</p>}
    <div className="profile-introduction"><h3>{tutor.tag}</h3><p className="profile-bio">{tutor.bio}</p><p className="profile-languages"><Globe2 size={17} /><span>Speaks {tutor.native}</span></p></div>
    {!preview && !tutor.isDemo && <button className="outlined-btn profile-message" onClick={() => user ? onMessage(tutor) : onAuth()}><MessageCircle size={18} /> Ask a question first</button>}
    <section className="booking-area" aria-labelledby="booking-title"><div className="booking-heading"><div><div className="eyebrow">A LITTLE TIME FOR YOU</div><h3 id="booking-title">{own ? 'Your available times' : 'Find your first conversation'}</h3></div><div className="booking-price"><strong>${tutor.price}</strong><span>USD / 50 min</span></div></div>
      <p className="booking-timezone"><Clock3 size={16} /> All times are shown in <strong>{timeZone}</strong></p>
      {loading ? <p className="loading-state" role="status">Finding a time that works…</p> : loadError ? <div className="form-error" role="alert">{loadError} <button onClick={() => setRetry(value => value + 1)}>Reload available times</button></div> : !days.length ? <div className="booking-empty"><CalendarDays size={28} /><h4>No open times just yet.</h4><p>{own ? 'Add your next lesson times in your teaching space.' : tutor.isDemo ? 'This sample profile has no available times. Try another tutor.' : 'Send a quick message to ask when this tutor is available.'}</p>{!own && !tutor.isDemo && <button className="outlined-btn" onClick={() => user ? onMessage(tutor) : onAuth()}><MessageCircle size={17} /> Ask about availability</button>}</div> : <>
        <fieldset className="booking-step"><legend><span>1</span> Choose a day</legend><div className="calendar-nav"><button aria-label="Earlier available dates" disabled={offset === 0 || busy} onClick={() => changePage(Math.max(0, offset - 5))}><ChevronLeft size={19} /></button><span>{dayDate(days[offset]).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span><button aria-label="Later available dates" disabled={offset + 5 >= days.length || busy} onClick={() => changePage(offset + 5)}><ChevronRight size={19} /></button></div><div className="date-picker">{days.slice(offset, offset + 5).map(value => { const d = dayDate(value); return <button key={value} disabled={busy} className={day === value ? 'selected' : ''} aria-pressed={day === value} aria-label={dayLabel(value)} onClick={() => { setDay(value); setSlotId(''); }}><small>{d.toLocaleDateString(undefined, { weekday: 'short' })}</small><strong>{d.getDate()}</strong><small>{d.toLocaleDateString(undefined, { month: 'short' })}</small></button>; })}</div></fieldset>
        <fieldset className="booking-step"><legend><span>2</span> Pick a time</legend><p className="chosen-day-label">{dayLabel(day)}</p><div className="time-picker">{slots.filter(slot => localDay(slot.startsAt) === day).map(slot => <button key={slot.id} disabled={busy} className={slotId === slot.id ? 'selected' : ''} aria-pressed={slotId === slot.id} aria-label={`${timeLabel(slot.startsAt)} to ${timeLabel(slot.endsAt)}`} onClick={() => { setSlotId(slot.id); setBookingError(''); }}>{timeLabel(slot.startsAt)}{slotId === slot.id && <Check size={15} />}</button>)}</div></fieldset>
      </>}
      {bookingError && <div className="form-error" role="alert">{bookingError}</div>}
      {preview ? <p className="sample-notice">{own ? 'This is your tutor profile. Add or remove available times from your teaching space.' : 'This is a public profile preview. Student accounts can reserve lessons.'}</p> : !!days.length && !loadError && !loading && <div className="booking-reserve"><label className="booking-goal">Anything you’d like to work on? <span>Optional</span><textarea value={goal} maxLength={1000} disabled={busy} onChange={event => setGoal(event.target.value)} placeholder="A trip, a new job, or just feeling more confident…" rows={2} /></label>{chosen && <p className="booking-selection" aria-live="polite"><CheckCircle2 size={18} /><span>{dateTime(chosen.startsAt)}<strong>50 minutes with {tutor.name.split(' ')[0]} · ${tutor.price} USD</strong></span></p>}<button className="dark-btn full" disabled={!slotId || busy} onClick={reserve}>{busy ? 'Reserving your lesson…' : !user ? 'Log in to reserve this time' : slotId ? 'Reserve my lesson' : 'Choose a time above'} <ArrowRight size={18} /></button><small className="booking-disclaimer">Pay later. No card required. Cancel any time before your lesson starts.</small></div>}
    </section>
    {!tutor.isDemo && <Reviews tutorId={tutor.id} />}
  </div>;
}
