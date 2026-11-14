import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { api, dateTime, defaultAvatar, imageFallback } from './api';
import AdminStudentPicker from './AdminStudentPicker';
import './practice.css';

export default function Practice({ user, initialStudent, onOpenSession }) {
  const isAdmin = user.role === 'admin';
  const [student, setStudent] = useState(isAdmin ? initialStudent || null : null);
  const [title, setTitle] = useState('Language practice');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => { if (isAdmin && initialStudent) setStudent(initialStudent); }, [initialStudent?.id, isAdmin]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    async function refresh() {
      try { const data = await api('/practice/sessions', { signal: controller.signal }); if (controller.signal.aborted) return;
        if (!Array.isArray(data.sessions)) throw new Error('Your practice sessions could not be loaded.');
        setSessions(data.sessions); setError('');
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    refresh(); const timer = setInterval(refresh, 10000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [version]);
  async function start(event) {
    event.preventDefault(); if (!isAdmin || !student || busy) return;
    setBusy(true); setError('');
    try { const data = await api('/practice/sessions', { method: 'POST', body: { studentId: student.id, title: title.trim() } }); onOpenSession(data.session.id); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <div className="workspace-page practice-page"><div className="workspace-title"><div><div className="eyebrow">A LITTLE SPACE TO PRACTICE</div><h1>{isAdmin ? 'Teach a little. Try it together.' : 'Your practice space.'}</h1><p>{isAdmin ? 'Choose a student and guide a text practice session with a shared lesson board.' : 'Join your instructor, try a prompt, and keep the feedback that helps you grow.'}</p></div><button className="outlined-btn" onClick={() => setVersion(value => value + 1)}><RefreshCw size={17} /> Refresh sessions</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {isAdmin && <section className="panel practice-create"><div className="panel-heading"><h2>Practice with a student</h2><ShieldCheck size={22} /></div><p className="muted">You remain the administrator and act as the teacher in this room. Students join through their own Practice page.</p>
      {student ? <form onSubmit={start}><div className="practice-selected"><img src={student.image || defaultAvatar} onError={imageFallback} alt="" /><div><strong>{student.name}</strong><small>{student.email}</small></div><button className="icon-btn" type="button" aria-label="Choose another student" disabled={busy} onClick={() => setStudent(null)}><X size={18} /></button></div><label>Practice title<input value={title} onChange={event => setTitle(event.target.value)} minLength={1} maxLength={120} required disabled={busy} /></label><button className="dark-btn" disabled={busy || !title.trim()}>{busy ? 'Opening practice…' : 'Start practice'} <ArrowRight size={18} /></button><p className="field-hint">An existing active room with this student will reopen. Practice creates no reservation or payment.</p></form> : <AdminStudentPicker onSelect={setStudent} />}
    </section>}
    <section className="panel"><div className="panel-heading"><h2>{isAdmin ? 'Your teaching sessions' : 'Your practice sessions'}</h2><BookOpen size={21} /></div><p className="muted">Active rooms and recent session history. Updates automatically.</p>
      {loading ? <p className="loading-state" role="status">Loading practice sessions…</p> : !sessions.length ? <div className="empty-inline"><BookOpen size={30} /><h3>{isAdmin ? 'Your first practice starts with a student.' : 'A little practice is on its way.'}</h3><p>{isAdmin ? 'Choose someone above to open a room together.' : 'When an administrator starts a session with you, it will appear here.'}</p></div> : <ul className="practice-session-list">{sessions.map(session => { const other = isAdmin ? session.student : session.admin; return <li key={session.id}><img src={other.image || defaultAvatar} onError={imageFallback} alt="" /><div><span className={`status-pill ${session.status === 'active' ? 'confirmed' : ''}`}>{session.status === 'active' ? 'Active practice' : 'Ended'}</span><h3>{session.title}</h3><p>With {other.name} · {dateTime(session.createdAt)}</p></div><button className="outlined-btn" aria-label={`Open practice ${session.title}`} onClick={() => onOpenSession(session.id)}>Open practice <ArrowRight size={16} /></button></li>; })}</ul>}
    </section>
  </div>;
}
