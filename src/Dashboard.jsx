import React, { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, MessageCircle, RefreshCw, Star } from 'lucide-react';
import { api, dateTime, imageFallback, timeZone, defaultAvatar } from './api';

function LessonReview({ booking, onSaved, notify }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api(`/bookings/${booking.id}/review`, { method: 'POST', body: { rating: Number(form.get('rating')), body: form.get('body') } });
      setOpen(false); onSaved(); notify('Your review is published. Thank you for sharing your experience.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  if (booking.review) return <span className="reviewed-label"><Star size={12} fill="currentColor" /> Your rating: {booking.review.rating}/5</span>;
  return <div className="lesson-review">
    <button className="mini-btn" aria-expanded={open} onClick={() => setOpen(!open)}><Star size={14} /> {open ? 'Close review' : 'Leave a review'}</button>
    {open && <form className="review-form" onSubmit={submit}>
      <label>Your rating<select name="rating" defaultValue="5" required>{[5, 4, 3, 2, 1].map(rating => <option key={rating} value={rating}>{rating} {rating === 1 ? 'star' : 'stars'}</option>)}</select></label>
      <label>Share your experience<textarea name="body" rows={3} maxLength={2000} placeholder="What did you enjoy about your lesson?" /></label>
      <p className="field-hint">Your review and display name will appear on this tutor’s public profile.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="dark-btn" disabled={busy}>{busy ? 'Publishing…' : 'Publish review'}</button>
    </form>}
  </div>;
}

export function LessonList({ bookings, teaching = false, onRefresh, onMessage, notify }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  async function action(booking, value) {
    if (!window.confirm(value === 'cancel' ? 'Cancel this lesson? The time will become available to other learners.' : 'Mark this lesson as completed?')) return;
    setBusy(booking.id); setError('');
    try {
      await api(`/bookings/${booking.id}`, { method: 'PATCH', body: { action: value } });
      notify(value === 'cancel' ? 'Your lesson has been cancelled.' : 'Lesson marked as completed.'); onRefresh();
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }
  return <>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="lesson-list">{bookings.map(booking => {
      const future = new Date(booking.startsAt).getTime() > Date.now();
      const finished = new Date(booking.endsAt).getTime() <= Date.now();
      return <article className="lesson-row" key={booking.id}>
        <img src={booking.tutor.image || defaultAvatar} onError={imageFallback} alt="" />
        <div className="lesson-main">
          <span className={`status-pill ${booking.status}`}>{booking.status}</span>
          <h3>{teaching ? `Lesson with ${booking.learner?.name || 'your learner'}` : `${booking.tutor.language} with ${booking.tutor.name}`}</h3>
          <p>{dateTime(booking.startsAt)} · 50 minutes</p>
          {booking.goal && <p className="lesson-goal">{booking.goal}</p>}
          <small>${booking.price} USD · Pay later{booking.tutor.isDemo ? ' · Sample reservation, no real lesson' : ''}</small>
          {!teaching && booking.status === 'completed' && !booking.tutor.isDemo && <LessonReview booking={booking} onSaved={onRefresh} notify={notify} />}
        </div>
        <div className="lesson-actions">
          {!booking.tutor.isDemo && <button className="mini-btn" onClick={() => onMessage({ tutorId: booking.tutor.id, learnerId: booking.learner?.id, tutorName: booking.tutor.name, tutorImage: booking.tutor.image, learnerName: booking.learner?.name })}><MessageCircle size={15} /> Message</button>}
          {booking.status === 'confirmed' && future && <button className="mini-btn danger-text" disabled={busy === booking.id} onClick={() => action(booking, 'cancel')}>{busy === booking.id ? 'Cancelling…' : 'Cancel lesson'}</button>}
          {teaching && booking.status === 'confirmed' && finished && <button className="mini-btn" disabled={busy === booking.id} onClick={() => action(booking, 'complete')}>{busy === booking.id ? 'Saving…' : 'Mark completed'}</button>}
        </div>
      </article>;
    })}</div>
  </>;
}

export default function Dashboard({ user, onBrowse, onMessage, notify }) {
  const [bookings, setBookings] = useState([]);
  const [tab, setTab] = useState('upcoming');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api('/bookings', { signal: controller.signal }).then(data => setBookings(data.bookings)).catch(err => { if (err.name !== 'AbortError') setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version]);
  const learnerBookings = bookings.filter(booking => booking.learner?.id === user.id);
  const upcoming = learnerBookings.filter(booking => booking.status === 'confirmed' && new Date(booking.startsAt).getTime() > Date.now());
  const past = learnerBookings.filter(booking => !upcoming.includes(booking));
  const shown = tab === 'upcoming' ? upcoming : past;
  return <div className="workspace-page">
    <div className="workspace-title"><div><div className="eyebrow">A LITTLE PROGRESS, EVERY DAY</div><h1>Hello, {user.name.split(' ')[0]}.</h1><p>Your conversations, your goals, your next chapter.</p></div><button className="dark-btn" onClick={onBrowse}>Find a tutor <ArrowRight size={18} /></button></div>
    <div className="dashboard-summary"><div><CalendarDays size={23} /><strong>{upcoming.length}</strong><span>Upcoming lessons</span></div><div><MessageCircle size={23} /><strong>{learnerBookings.filter(booking => booking.status === 'completed').length}</strong><span>Completed lessons</span></div><div className="goal-summary"><span>YOUR LEARNING GOAL</span><strong>{user.goal}</strong><p>Every conversation is a step forward.</p></div></div>
    <div className="panel dashboard-lessons">
      <div className="panel-heading"><h2>My lessons</h2><button className="icon-btn" aria-label="Refresh lessons" disabled={loading} onClick={() => setVersion(value => value + 1)}><RefreshCw size={17} /></button></div>
      <p className="muted">All lesson times are shown in {timeZone}.</p>
      <div className="tabs"><button aria-pressed={tab === 'upcoming'} onClick={() => setTab('upcoming')}>Upcoming ({upcoming.length})</button><button aria-pressed={tab === 'past'} onClick={() => setTab('past')}>Past & cancelled ({past.length})</button></div>
      {loading ? <p className="loading-state" role="status">Loading your lessons…</p> : error ? <p className="form-error" role="alert">{error} <button onClick={() => setVersion(value => value + 1)}>Try again</button></p> : !shown.length ? <div className="empty-state"><CalendarDays size={30} /><h3>{tab === 'upcoming' ? 'Your next conversation is waiting.' : 'Your learning story starts here.'}</h3><p>{tab === 'upcoming' ? 'Find a tutor and choose a time that fits your life.' : 'Completed and cancelled lessons will appear here.'}</p><button className="outlined-btn" onClick={onBrowse}>Explore tutors <ArrowRight size={17} /></button></div> : <LessonList bookings={shown} onRefresh={() => setVersion(value => value + 1)} onMessage={onMessage} notify={notify} />}
    </div>
  </div>;
}
