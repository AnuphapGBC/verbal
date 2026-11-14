import React, { useEffect, useState } from 'react';
import { Bell, CalendarDays, CheckCircle2, CircleAlert, ExternalLink, GraduationCap, KeyRound, Mail, Pause, Play, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
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

function NotificationSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [checking, setChecking] = useState(false);
  const [connection, setConnection] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setSettings(null); setConnection(null);
    api('/admin/email', { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setSettings(value); })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version]);

  async function checkConnection() {
    setChecking(true); setConnection(null);
    try {
      const result = await api('/admin/email/verify', { method: 'POST', body: {} });
      if (result.verified) {
        setConnection({ verified: true, checkedAt: new Date().toISOString() });
      } else {
        const messages = {
          missing_credentials: 'The Gmail credentials are missing. Add them in Vercel, redeploy, and refresh the status.',
          invalid_password_format: 'SMTP_PASS is present, but its format does not match a Google app password. Replace it in Vercel with the generated 16-character password, save, and redeploy.',
          authentication_failed: 'Gmail did not accept the credentials. Check the sender and Google app password in Vercel.',
          connection_failed: 'Verbal could not connect to Gmail. Please try again shortly.',
        };
        const passwordHints = {
          assignment_prefix: 'Remove SMTP_PASS= from the saved value. Save only the generated Google app password.',
          quoted_value: 'Remove the quote marks from the saved value. Save only the generated Google app password.',
          unsupported_characters: 'The saved value contains characters outside the Google app password format. Generate a Google app password and copy only its 16-character code.',
          wrong_length: 'The saved value does not contain a complete 16-character Google app password. Copy the full generated code.',
        };
        setConnection({ verified: false, message: (result.reason === 'invalid_password_format' && passwordHints[result.credentialHint]) || messages[result.reason] || 'The Gmail connection could not be verified. Please try again.' });
      }
    } catch (err) {
      setConnection({ verified: false, message: err.message });
    } finally { setChecking(false); }
  }

  const status = settings?.status === 'ready'
    ? { title: 'Credentials configured', description: 'Email settings are present. Delivery has not been verified.', icon: CheckCircle2 }
    : settings?.status === 'disabled'
      ? { title: 'Notifications are off', description: 'Check the Gmail connection before setting MAIL_ENABLED to true in Vercel.', icon: Bell }
      : { title: 'Setup needed', description: 'Add the missing settings in Vercel to enable Gmail notifications.', icon: CircleAlert };
  const StatusIcon = status.icon;

  return <div className="admin-notifications">
    <div className="admin-notification-heading"><div><h3><Mail size={20} aria-hidden="true" /> Gmail notifications</h3><p>Manage the sender used for Verbal email notifications.</p></div><button className="outlined-btn" disabled={loading || checking} onClick={() => setVersion(value => value + 1)}><RefreshCw size={16} aria-hidden="true" /> Refresh status</button></div>
    {loading && <p className="admin-email-loading" role="status"><RefreshCw size={18} aria-hidden="true" /> Checking email settings...</p>}
    {error && <div className="form-error" role="alert"><p>{error}</p><button onClick={() => setVersion(value => value + 1)}><RefreshCw size={16} aria-hidden="true" /> Try again</button></div>}
    {!loading && settings && <>
      <div className={`admin-email-status ${settings.status}`} role="status"><StatusIcon size={23} aria-hidden="true" /><div><h4>{status.title}</h4><p>{status.description}</p></div></div>
      <dl className="admin-email-details"><div><dt>Provider</dt><dd>Gmail</dd></div><div><dt>Sender email</dt><dd>{settings.sender || 'Not configured'}</dd></div><div><dt>Email delivery</dt><dd>{settings.enabled ? 'Enabled in settings' : 'Disabled in settings'}</dd></div></dl>
      {settings.required?.length > 0 && <p className="admin-email-missing">Settings needing attention: {settings.required.map((key, index) => <React.Fragment key={key}>{index > 0 && ', '}<code>{key}</code></React.Fragment>)}.</p>}
      {settings.credentialIssue && <p className="admin-email-missing">{settings.credentialIssue === 'missing' ? 'This deployment did not receive SMTP_PASS. Save it for Production in the verbal project, then redeploy.' : 'This deployment received SMTP_PASS, but it does not match the expected app password format. Use the generated 16-character Google app password without quotes.'}</p>}
      <div className="admin-email-check"><button className="outlined-btn" disabled={checking} onClick={checkConnection}><ShieldCheck size={17} aria-hidden="true" />{checking ? 'Checking Gmail connection...' : 'Check Gmail connection'}</button><p>This checks the saved settings and Gmail connection. It does not send an email.</p></div>
      {checking && <p className="admin-email-loading" role="status">Connecting to Gmail...</p>}
      {connection && (connection.verified
        ? <p className="admin-email-connection-success" role="status"><CheckCircle2 size={19} aria-hidden="true" /><span>Gmail accepted the connection and credentials at {dateTime(connection.checkedAt)}. No email was sent. This result is from this check only.</span></p>
        : <p className="form-error" role="alert">{connection.message} No email was sent.</p>)}
    </>}
    <div className="admin-email-help"><h4><KeyRound size={18} aria-hidden="true" /> Connect the Gmail sender</h4><ol>
      <li>Sign in to Google as <strong>verbal.notifications@gmail.com</strong> and enable <strong>2-Step Verification</strong>.</li>
      <li>Create a Google app password for Verbal.</li>
      <li>Open your Vercel project settings, then Environment Variables. Add the app password only as the sensitive <code>SMTP_PASS</code> variable.</li>
    </ol><dl className="admin-email-env"><div><dt><code>SMTP_USER</code></dt><dd>verbal.notifications@gmail.com</dd></div><div><dt><code>MAIL_ENABLED</code></dt><dd>true</dd></div><div><dt><code>MAIL_FROM_NAME</code></dt><dd>Verbal Notifications</dd></div></dl><p>Redeploy after saving these settings, then refresh the status above. Keep the app password in Vercel; never paste it here.</p><div className="admin-email-links"><a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer"><KeyRound size={16} aria-hidden="true" /> Google app passwords <ExternalLink size={14} aria-hidden="true" /></a><a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" /> Open Vercel dashboard</a></div></div>
  </div>;
}

export default function Admin({ user, notify, onPractice }) {
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
    <div className="workspace-title"><div><div className="eyebrow"><ShieldCheck size={15} /> YOUR COMMUNITY, CARED FOR</div><h1>Admin overview.</h1><p>A clear view of the people, profiles, and lessons that make Verbal.</p></div><div className="practice-room-actions">{onPractice&&<button className="dark-btn" onClick={()=>onPractice()}>Practice with a student</button>}<button className="outlined-btn" disabled={loading} onClick={() => setVersion(value => value + 1)}><RefreshCw size={17} /> Refresh overview</button></div></div>
    {error && <p className="form-error" role="alert">{error} <button onClick={() => setVersion(value => value + 1)}>Try again</button></p>}
    {loading ? <p className="loading-state" role="status">Loading the admin overview…</p> : data && <>
      <div className="admin-stats" aria-label="Marketplace totals">{[
        { label: 'All accounts', value: stats.users, icon: Users }, { label: 'Students', value: stats.students, icon: Users },
        { label: 'Tutor accounts', value: stats.tutors, icon: GraduationCap }, { label: 'Administrators', value: stats.admins, icon: ShieldCheck },
        { label: 'All reservations', value: stats.bookings, icon: CalendarDays }, { label: 'Upcoming lessons', value: stats.upcomingLessons, icon: CalendarDays },
      ].map(({ label, value, icon: Icon }) => <div key={label}><span className="admin-stat-icon"><Icon size={21} /></span><span className="admin-stat-label">{label}</span><strong>{value}</strong></div>)}</div>
      <section className="panel admin-records"><div className="panel-heading"><h2>{tab === 'notifications' ? 'Notifications' : 'Your community'}</h2><span className="admin-viewer"><ShieldCheck size={15} /> Administrator view</span></div><p className="muted">{tab === 'notifications' ? 'Review your email settings and check the Gmail connection.' : 'Browse the latest 100 records in each category. Lesson prices are in USD.'}</p>
        <div className="admin-toolbar"><div className="tabs" aria-label="Admin category">{[['users', 'Accounts', Users], ['tutors', 'Tutor profiles', GraduationCap], ['bookings', 'Lessons', CalendarDays], ['notifications', 'Notifications', Bell]].map(([value, label, Icon]) => <button key={value} aria-pressed={tab === value} onClick={() => { setTab(value); setSearch(''); }}><Icon size={16} aria-hidden="true" />{label}</button>)}</div>{tab !== 'notifications' && <label className="admin-search"><span>Search {tab === 'users' ? 'accounts' : tab === 'tutors' ? 'tutors' : 'lessons'}</span><span className="admin-search-input"><Search size={17} /><input type="search" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} aria-label={`Search ${tab}`} placeholder={tab === 'users' ? 'Name, email, or role' : tab === 'tutors' ? 'Name or language' : 'Student, tutor, or status'} /></span></label>}</div>
        {tab !== 'notifications' && <p className="admin-results" role="status">{tab === 'users' ? users.length : tab === 'tutors' ? tutors.length : bookings.length} {tab === 'users' ? 'accounts' : tab === 'tutors' ? 'profiles' : 'lessons'} shown{term ? ` for “${search.trim()}”` : ''}</p>}
        {tab === 'users' && (users.length ? <UserTable users={users} /> : <p className="empty-inline">No accounts match your search.</p>)}
        {tab === 'tutors' && <><p className="admin-management-note">Pausing a profile stops new reservations. Existing lessons and conversations stay available.</p>{tutors.length ? <TutorTable tutors={tutors} busy={busy} onToggle={toggleTutor} /> : <p className="empty-inline">No tutor profiles match your search.</p>}</>}
        {tab === 'bookings' && (bookings.length ? <BookingTable bookings={bookings} /> : <p className="empty-inline">No lessons match your search.</p>)}
        {tab === 'notifications' && <NotificationSettings />}
      </section>
    </>}
  </div>;
}
