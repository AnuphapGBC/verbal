import React, { useEffect, useState } from 'react';
import { CalendarDays, GraduationCap, Pause, Play, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import { api, dateTime } from './api';
import './admin.css';

const roleName = role => role === 'learner' ? 'Student' : role === 'tutor' ? 'Tutor' : role === 'admin' ? 'Admin' : role;
const normalized = value => String(value || '').toLocaleLowerCase();

function UserTable({ users }) {
  return <div className="admin-table-wrap"><table className="admin-table"><caption className="sr-only">Latest user accounts</caption><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Created</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td><strong>{user.name}</strong>{user.isTest && <small className="admin-test-badge">Test account</small>}</td><td className="admin-email">{user.email}</td><td><span className={`admin-role ${user.role}`}>{roleName(user.role)}</span></td><td>{dateTime(user.createdAt)}</td></tr>)}</tbody></table></div>;
}

function TutorTable({ tutors, busy, onToggle }) {
  return <div className="admin-table-wrap"><table className="admin-table"><caption className="sr-only">Tutor profiles and publication status</caption><thead><tr><th scope="col">Tutor</th><th scope="col">Language</th><th scope="col">Price</th><th scope="col">Status</th><th scope="col">Manage</th></tr></thead><tbody>{tutors.map(tutor => <tr key={tutor.id}><td><strong>{tutor.name}</strong>{tutor.isDemo ? <small className="admin-test-badge">Sample profile</small> : tutor.isTest && <small className="admin-test-badge">Test account</small>}</td><td>{tutor.language}</td><td>${tutor.price} USD</td><td><span className={`status-pill ${tutor.active ? 'confirmed' : 'cancelled'}`}>{tutor.active ? 'Published' : 'Paused'}</span></td><td><button className="admin-toggle" disabled={busy === tutor.id} onClick={() => onToggle(tutor)}>{tutor.active ? <Pause size={13} /> : <Play size={13} />}{busy === tutor.id ? 'Saving…' : tutor.active ? 'Pause profile' : 'Resume profile'}</button></td></tr>)}</tbody></table></div>;
}

function BookingTable({ bookings }) {
  return <div className="admin-table-wrap"><table className="admin-table"><caption className="sr-only">Latest lesson reservations</caption><thead><tr><th scope="col">Student</th><th scope="col">Tutor</th><th scope="col">Lesson time</th><th scope="col">Status</th><th scope="col">Price</th></tr></thead><tbody>{bookings.map(booking => <tr key={booking.id}><td><strong>{booking.studentName}</strong></td><td>{booking.tutorName}</td><td>{dateTime(booking.startsAt)}</td><td><span className={`status-pill ${booking.status}`}>{booking.status}</span></td><td>${booking.price} USD</td></tr>)}</tbody></table></div>;
}

export default function Admin({ user, notify }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState('users');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(null);
  const allowed = user?.role === 'admin';
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    api('/admin/overview', { signal: controller.signal }).then(value => setData(value)).catch(err => { if (err.name !== 'AbortError') setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [allowed, version]);

  async function toggleTutor(tutor) {
    const message = tutor.active ? `Pause ${tutor.name}'s public profile? New reservations will stop. Existing lessons and conversations will stay available.` : `Publish ${tutor.name}'s profile again so learners can find and book this tutor?`;
    if (!window.confirm(message)) return;
    setBusy(tutor.id); setError('');
    try {
      const { tutor: updated } = await api(`/admin/tutors/${tutor.id}`, { method: 'PATCH', body: { active: !tutor.active } });
      setData(current => ({ ...current, tutors: current.tutors.map(item => item.id === tutor.id ? { ...item, active: updated.active } : item) }));
      notify(updated.active ? 'Tutor profile published.' : 'Tutor profile paused. Existing lessons are unchanged.');
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  if (!allowed) return <div className="workspace-page"><div className="empty-state"><ShieldCheck size={32} /><h1>Admin access required.</h1><p>This area is available only to administrator accounts. Your lessons and account settings remain available from the navigation above.</p></div></div>;

  const term = normalized(search.trim());
  const users = (data?.users || []).filter(item => normalized(`${item.name} ${item.email} ${roleName(item.role)}`).includes(term));
  const tutors = (data?.tutors || []).filter(item => normalized(`${item.name} ${item.language}`).includes(term));
  const bookings = (data?.bookings || []).filter(item => normalized(`${item.studentName} ${item.tutorName} ${item.status}`).includes(term));
  const stats = data?.stats;
  return <div className="workspace-page admin-page">
    <div className="workspace-title"><div><div className="eyebrow"><ShieldCheck size={15} /> YOUR COMMUNITY, CARED FOR</div><h1>Admin overview.</h1><p>A clear view of the people, profiles, and lessons that make Verbal.</p></div><button className="outlined-btn" disabled={loading} onClick={() => setVersion(value => value + 1)}><RefreshCw size={17} /> Refresh overview</button></div>
    {error && <p className="form-error" role="alert">{error} <button onClick={() => setVersion(value => value + 1)}>Try again</button></p>}
    {loading ? <p className="loading-state" role="status">Loading the admin overview…</p> : data && <>
      <div className="admin-stats" aria-label="Marketplace totals">{[
        { label: 'All accounts', value: stats.users, icon: Users }, { label: 'Students', value: stats.students, icon: Users },
        { label: 'Tutor accounts', value: stats.tutors, icon: GraduationCap }, { label: 'Administrators', value: stats.admins, icon: ShieldCheck },
        { label: 'All reservations', value: stats.bookings, icon: CalendarDays }, { label: 'Upcoming lessons', value: stats.upcomingLessons, icon: CalendarDays },
      ].map(({ label, value, icon: Icon }) => <div key={label}><span className="admin-stat-icon"><Icon size={21} /></span><span className="admin-stat-label">{label}</span><strong>{value}</strong></div>)}</div>
      <section className="panel admin-records"><div className="panel-heading"><h2>Your community</h2><span className="admin-viewer"><ShieldCheck size={15} /> Administrator view</span></div><p className="muted">Browse the latest 100 records in each category. Lesson prices are in USD.</p>
        <div className="admin-toolbar"><div className="tabs" aria-label="Record category">{[['users', 'Accounts'], ['tutors', 'Tutor profiles'], ['bookings', 'Lessons']].map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => { setTab(value); setSearch(''); }}>{label}</button>)}</div><label className="admin-search"><span>Search {tab === 'users' ? 'accounts' : tab === 'tutors' ? 'tutors' : 'lessons'}</span><span className="admin-search-input"><Search size={17} /><input type="search" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} aria-label={`Search ${tab}`} placeholder={tab === 'users' ? 'Name, email, or role' : tab === 'tutors' ? 'Name or language' : 'Student, tutor, or status'} /></span></label></div>
        <p className="admin-results" role="status">{tab === 'users' ? users.length : tab === 'tutors' ? tutors.length : bookings.length} {tab === 'users' ? 'accounts' : tab === 'tutors' ? 'profiles' : 'lessons'} shown{term ? ` for “${search.trim()}”` : ''}</p>
        {tab === 'users' && (users.length ? <UserTable users={users} /> : <p className="empty-inline">No accounts match your search.</p>)}
        {tab === 'tutors' && <><p className="admin-management-note">Pausing a profile stops new reservations. Existing lessons and conversations stay available.</p>{tutors.length ? <TutorTable tutors={tutors} busy={busy} onToggle={toggleTutor} /> : <p className="empty-inline">No tutor profiles match your search.</p>}</>}
        {tab === 'bookings' && (bookings.length ? <BookingTable bookings={bookings} /> : <p className="empty-inline">No lessons match your search.</p>)}
      </section>
    </>}
  </div>;
}
