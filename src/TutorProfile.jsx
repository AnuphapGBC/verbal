import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, MessageCircle, Star } from 'lucide-react';
import { api, dateTime, timeZone, imageFallback, defaultAvatar } from './api';

function Reviews({ tutorId }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api(`/tutors/${tutorId}/reviews`, { signal: controller.signal }).then(data => setReviews(data.reviews)).catch(err => { if (err.name !== 'AbortError') setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tutorId, version]);
  return <section className="profile-reviews"><h3>Learner reviews</h3>{loading ? <p className="muted" role="status">Loading reviews…</p> : error ? <p className="form-error" role="alert">{error} <button onClick={() => setVersion(value => value + 1)}>Try again</button></p> : !reviews.length ? <p className="muted">No reviews yet. Every review comes from a completed lesson.</p> : <div className="review-list">{reviews.map(review => <article className="review-row" key={review.id}><div><strong>{review.learnerName}</strong><span><Star size={12} fill="currentColor" /> {review.rating}/5</span></div>{review.body && <p>{review.body}</p>}<time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time></article>)}</div>}</section>;
}

export default function TutorProfile({ tutor, user, onAuth, onMessage, onBooked, onDashboard }) {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [day, setDay] = useState('');
  const [offset, setOffset] = useState(0);
  const [slotId, setSlotId] = useState('');
  const [goal, setGoal] = useState(user?.goal || '');
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setOffset(0); setSlotId('');
    api(`/tutors/${tutor.id}/availability`, { signal: controller.signal })
      .then(data => { setSlots(data.slots); setDay(data.slots[0] ? new Date(data.slots[0].startsAt).toLocaleDateString('en-CA') : ''); })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tutor.id, retry]);
  const days = [...new Set(slots.map(slot => new Date(slot.startsAt).toLocaleDateString('en-CA')))];
  const chosen = slots.find(slot => slot.id === slotId);
  const own = tutor.userId && tutor.userId === user?.id;
  async function reserve() {
    if (!user) { onAuth(); return; }
    setBusy(true); setError('');
    try {
      const { booking: record } = await api('/bookings', { method: 'POST', body: { slotId, goal } });
      setBooking({ ...record, startsAt: record.startsAt || chosen.startsAt });
      onBooked();
    } catch (err) {
      setError(err.message);
      if (err.status === 409) { setSlotId(''); setRetry(value => value + 1); }
    } finally { setBusy(false); }
  }
  if (booking) return <div className="confirmation">
    <CheckCircle2 size={48} /><div className="eyebrow">YOU’VE TAKEN THE FIRST STEP</div>
    <h2>A new conversation awaits.</h2>
    <p>Your {tutor.isDemo ? 'sample ' : ''}lesson with {tutor.name} is reserved for <strong>{dateTime(booking.startsAt)}</strong>.</p>
    <p className="muted">50 minutes · ${booking.price || tutor.price} USD · Pay later<br />{timeZone}</p>
    {tutor.isDemo && <p className="sample-notice">This is a sample tutor profile for exploring Verbal. A real lesson will not take place.</p>}
    <button className="dark-btn" onClick={onDashboard}>View my lessons <ArrowRight size={18} /></button>
  </div>;
  return <>
    <div className="profile-top"><img src={tutor.image || defaultAvatar} onError={imageFallback} alt={tutor.name} /><div><div className="eyebrow">{tutor.flag} {tutor.language.toUpperCase()} TUTOR</div><h2>Meet {tutor.name}</h2><span className="rating">{Number(tutor.rating) > 0 ? <><Star size={14} fill="currentColor" /> {tutor.rating} · {tutor.reviews} {tutor.isDemo ? 'sample reviews' : 'reviews'}</> : 'New to Verbal'}</span></div></div>
    {tutor.isDemo && <p className="sample-notice">Sample profile · Illustrative tutor, reviews, and availability. Explore booking without arranging a real lesson.</p>}
    <h3>{tutor.tag}</h3><p className="profile-bio">{tutor.bio}</p><p className="muted">Speaks {tutor.native}</p>
    {!tutor.isDemo && <Reviews tutorId={tutor.id} />}
    {!own && !tutor.isDemo && <button className="outlined-btn profile-message" onClick={() => user ? onMessage(tutor) : onAuth()}><MessageCircle size={17} /> Message {tutor.name.split(' ')[0]}</button>}
    <div className="booking-area"><div className="booking-heading"><h3>{own ? 'Your available lessons' : 'Try a conversation'}</h3><span>${tutor.price} <small>/ 50 minutes</small></span></div><p className="muted">Choose a day · {timeZone}</p>
      {loading ? <p className="loading-state" role="status">Finding available times…</p> : <>
        {!!days.length && <><div className="calendar-nav"><button aria-label="Earlier dates" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 5))}><ChevronLeft size={17} /></button><span>Available dates</span><button aria-label="Later dates" disabled={offset + 5 >= days.length} onClick={() => setOffset(offset + 5)}><ChevronRight size={17} /></button></div><div className="date-picker">{days.slice(offset, offset + 5).map(value => { const d = new Date(`${value}T12:00:00`); return <button key={value} className={day === value ? 'selected' : ''} aria-pressed={day === value} onClick={() => { setDay(value); setSlotId(''); }}><small>{d.toLocaleDateString(undefined, { weekday: 'short' })}</small><strong>{d.getDate()}</strong><small>{d.toLocaleDateString(undefined, { month: 'short' })}</small></button>; })}</div><div className="time-picker">{slots.filter(slot => new Date(slot.startsAt).toLocaleDateString('en-CA') === day).map(slot => <button key={slot.id} className={slotId === slot.id ? 'selected' : ''} aria-pressed={slotId === slot.id} onClick={() => setSlotId(slot.id)}>{new Date(slot.startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</button>)}</div></>}
        {!days.length && !error && <p className="empty-inline">No open times right now. Message this tutor to ask about availability.</p>}
      </>}
      {error && <div className="form-error" role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
      {own ? <p className="sample-notice">This is your tutor profile. Manage times from your teaching dashboard.</p> : <><label className="booking-goal">What would you like to work on?<textarea value={goal} maxLength={1000} onChange={event => setGoal(event.target.value)} placeholder="Tell your tutor a little about your goals…" rows={2} /></label><button className="dark-btn full" disabled={!slotId || busy || loading} onClick={reserve}>{busy ? 'Reserving…' : !user ? 'Sign in to reserve' : slotId ? 'Reserve lesson · Pay later' : 'Choose a time to continue'} <ArrowRight size={18} /></button><small className="booking-disclaimer">No card required. You can cancel a future lesson from your dashboard.</small></>}
    </div>
  </>;
}
