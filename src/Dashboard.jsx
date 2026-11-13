import React, { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Compass, MessageCircle, RefreshCw, Star, Target } from 'lucide-react';
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
          <span className={`status-pill ${booking.status}`}>{booking.status === 'confirmed' ? finished ? 'Awaiting completion' : 'Reserved' : booking.status}</span>
          <h3>{teaching ? `Lesson with ${booking.learner?.name || 'your learner'}` : `${booking.tutor.language} with ${booking.tutor.name}`}</h3>
          <p className="lesson-time"><CalendarDays size={15} /> {dateTime(booking.startsAt)} <span>· 50 minutes</span></p>
          {booking.goal && <p className="lesson-goal">{booking.goal}</p>}
          <small>${booking.price} USD · Pay later{booking.tutor.isDemo ? ' · Sample reservation, no real lesson' : ''}</small>
          {!teaching && booking.status === 'completed' && !booking.tutor.isDemo && <LessonReview booking={booking} onSaved={onRefresh} notify={notify} />}
        </div>
        <div className="lesson-actions">
          {!booking.tutor.isDemo && <button className="mini-btn" onClick={() => onMessage({ tutorId: booking.tutor.id, learnerId: booking.learner?.id, tutorName: booking.tutor.name, tutorImage: booking.tutor.image, learnerName: booking.learner?.name })}><MessageCircle size={17} /> {teaching ? 'Message student' : 'Message tutor'}</button>}
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
  const upcoming = learnerBookings.filter(booking => booking.status === 'confirmed' && new Date(booking.endsAt).getTime() > Date.now()).sort((a,b) => new Date(a.startsAt) - new Date(b.startsAt));
  const past = learnerBookings.filter(booking => !upcoming.includes(booking));
  const shown = tab === 'upcoming' ? upcoming : past;
  const next = upcoming[0];
  const completed = learnerBookings.filter(booking => booking.status === 'completed').length;
  const messageTutor = booking => onMessage({ tutorId:booking.tutor.id, learnerId:user.id, tutorName:booking.tutor.name, tutorImage:booking.tutor.image });
  return <div className="workspace-page">
    <div className="workspace-title"><div><div className="eyebrow">YOUR LEARNING CORNER</div><h1>Good to see you, {user.name.split(' ')[0]}.</h1><p>A place for your next conversation, and everything along the way.</p></div><button className="dark-btn" onClick={onBrowse}>Find a tutor <ArrowRight size={18} /></button></div>
    {!loading && !error && <>
      {next ? <section className="next-lesson" aria-labelledby="next-lesson-title">
        <div className="next-lesson-copy"><span className="next-lesson-kicker"><span /> {new Date(next.startsAt).getTime() <= Date.now() ? 'HAPPENING NOW' : 'UP NEXT'}</span><h2 id="next-lesson-title">A little practice.<br />Something to look forward to.</h2><p>Message your tutor before the lesson to agree on how you’ll meet.</p>{!next.tutor.isDemo && <button className="dark-btn" onClick={() => messageTutor(next)}><MessageCircle size={18} /> Message your tutor</button>}</div>
        <div className="next-lesson-card"><div className="next-lesson-person"><img src={next.tutor.image || defaultAvatar} onError={imageFallback} alt="" /><div><span>{next.tutor.language} lesson</span><h3>{next.tutor.name}</h3><small>{next.tutor.isDemo ? 'Sample tutor · No real lesson' : 'One-to-one conversation'}</small></div></div><div className="next-lesson-details"><p><CalendarDays size={19} /><strong>{dateTime(next.startsAt)}</strong></p><p><Clock3 size={19} /> 50 minutes <span>· ${next.price} USD · Pay later</span></p></div><div className="next-lesson-zone">Your time zone: {timeZone.replaceAll('_',' ')}</div></div>
      </section> : !learnerBookings.length ? <section className="learning-start" aria-labelledby="learning-start-title"><div className="learning-start-heading"><span className="welcome-illustration" aria-hidden="true"><MessageCircle size={30} /><span>hello!</span></span><div><div className="eyebrow">YOU DON’T HAVE TO KNOW ALL THE WORDS</div><h2 id="learning-start-title">Just start with a hello.</h2><p>Your first lesson is three small steps away.</p></div></div><ol className="learning-steps"><li><span>1</span><div><h3>Find your person</h3><p>Pick a language and meet tutors who fit your goals.</p></div></li><li><span>2</span><div><h3>Choose a time</h3><p>Reserve a 50-minute lesson that works for you.</p></div></li><li><span>3</span><div><h3>Say hello</h3><p>Message your tutor and decide how you’ll meet.</p></div></li></ol><button className="dark-btn" onClick={onBrowse}>Let’s find your tutor <ArrowRight size={18} /></button></section> : null}
    </>}
    <div className="learning-note"><div><Target size={21} /><span><small>I’M LEARNING FOR</small><strong>{user.goal}</strong></span></div>{learnerBookings.length > 0 && <div className="learning-totals"><span><CalendarDays size={17} /><strong>{upcoming.length}</strong> upcoming</span><span><CheckCircle2 size={17} /><strong>{completed}</strong> completed</span></div>}</div>
    <div className="panel dashboard-lessons">
      <div className="panel-heading"><h2>My lessons</h2><button className="icon-btn" aria-label="Refresh lessons" disabled={loading} onClick={() => setVersion(value => value + 1)}><RefreshCw size={17} /></button></div>
      <p className="muted">Times shown in {timeZone.replaceAll('_',' ')}. Reservations are pay later.</p>
      <div className="tabs"><button aria-pressed={tab === 'upcoming'} onClick={() => setTab('upcoming')}>Upcoming ({upcoming.length})</button><button aria-pressed={tab === 'past'} onClick={() => setTab('past')}>Past & cancelled ({past.length})</button></div>
      {loading ? <p className="loading-state" role="status">Getting your lessons ready…</p> : error ? <p className="form-error" role="alert">{error} <button onClick={() => setVersion(value => value + 1)}>Try again</button></p> : !shown.length ? !learnerBookings.length ? <div className="empty-inline"><CalendarDays size={28} /><p>Your reservations will appear here after you choose your first lesson.</p></div> : <div className="empty-state"><CalendarDays size={30} /><h3>{tab === 'upcoming' ? 'Nothing on the calendar yet.' : 'Your story is still beginning.'}</h3><p>{tab === 'upcoming' ? 'Whenever you’re ready, there’s a conversation waiting for you.' : 'Your completed and cancelled lessons will stay here for easy reference.'}</p><button className="outlined-btn" onClick={onBrowse}><Compass size={17} /> Meet the tutors <ArrowRight size={17} /></button></div> : <LessonList bookings={shown} onRefresh={() => setVersion(value => value + 1)} onMessage={onMessage} notify={notify} />}
    </div>
  </div>;
}
