import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Check, Copy, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { api, defaultAvatar, imageFallback } from './api';
import './practice.css';

export default function PracticeRoom({ user, sessionId, onBack, onEnded }) {
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  const [version, setVersion] = useState(0);
  const baseline = useRef({ id: null, text: '', version: 0 });
  const notesDraft = useRef('');
  notesDraft.current = notes;
  const revision = useRef(0);
  const mutation = useRef(null);
  const threadEnd = useRef(null);
  const composer = useRef(null);
  const linkInput = useRef(null);
  useEffect(() => () => mutation.current?.abort(), []);
  function accept(next) {
    setRoom(next);
    if (baseline.current.id !== next.id || notesDraft.current === baseline.current.text) {
      baseline.current = { id: next.id, text: next.notes, version: next.notesVersion };
      notesDraft.current = next.notes; setNotes(next.notes);
    }
  }
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setLoadError('');
    async function refresh() {
      const atStart = revision.current;
      try { const data = await api(`/practice/sessions/${sessionId}`, { signal: controller.signal });
        if (controller.signal.aborted || atStart !== revision.current) return;
        if (!data.session || !Array.isArray(data.session.messages)) throw new Error('This practice room could not be loaded.');
        accept(data.session);
        setLoadError('');
      } catch (err) { if (!controller.signal.aborted) setLoadError(err.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    refresh(); const timer = setInterval(refresh, 3000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [sessionId, version]);
  useEffect(() => { const thread = threadEnd.current?.parentElement; if (thread) thread.scrollTop = thread.scrollHeight; }, [room?.messages.length]);
  function begin(action) { const controller = new AbortController(); mutation.current = controller; setBusy(action); setError(''); setNotice(''); return controller; }
  async function saveBoard() {
    if (!room?.canManage || busy || room.status !== 'active') return;
    const controller = begin('saving');
    try { const { session } = await api(`/practice/sessions/${sessionId}`, { method: 'PATCH', body: { notes, notesVersion: baseline.current.version }, signal: controller.signal });
      if (controller.signal.aborted) return;
      revision.current += 1; baseline.current = { id: session.id, text: session.notes, version: session.notesVersion };
      setNotes(session.notes); setRoom(session); setNotice('Lesson board saved. Your student can see the update.');
    } catch (err) { if (!controller.signal.aborted) { setError(err.message); if (err.status === 409) setVersion(value => value + 1); } }
    finally { if (!controller.signal.aborted) setBusy(''); }
  }
  async function send(event) {
    event.preventDefault(); if (!draft.trim() || busy || !room || room.status !== 'active') return;
    const text = draft.trim(); const controller = begin('sending');
    try { const { message } = await api(`/practice/sessions/${sessionId}/messages`, { method: 'POST', body: { body: text }, signal: controller.signal });
      if (controller.signal.aborted) return;
      revision.current += 1;
      setRoom(current => ({ ...current, messages: current.messages.some(item => item.id === message.id) ? current.messages : [...current.messages, message] }));
      setDraft(current => current.trim() === text ? '' : current);
    } catch (err) { if (!controller.signal.aborted) setError(err.message); }
    finally { if (!controller.signal.aborted) setBusy(''); }
  }
  async function endPractice() {
    if (!room?.canManage || busy || !window.confirm('End this practice session? Saved notes and responses will remain available. Unsaved board changes will be discarded.')) return;
    const controller = begin('ending');
    try { const { session } = await api(`/practice/sessions/${sessionId}/end`, { method: 'POST', body: {}, signal: controller.signal });
      if (controller.signal.aborted) return;
      revision.current += 1; setRoom(session); setNotes(session.notes); baseline.current = { id: session.id, text: session.notes, version: session.notesVersion }; onEnded?.();
    } catch (err) { if (!controller.signal.aborted) setError(err.message); }
    finally { if (!controller.signal.aborted) setBusy(''); }
  }
  const link = `${window.location.origin}/#/practice/${sessionId}`;
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setNotice('Join link copied. Only the selected student and instructor can open this room.'); }
    catch { linkInput.current?.focus(); linkInput.current?.select(); setNotice('Select and copy the join link below.'); }
  }
  const active = room?.status === 'active';
  return <div className="workspace-page practice-room"><button className="mini-btn practice-back" onClick={onBack}><ArrowLeft size={17} /> All practice sessions</button>
    {(error||loadError) && <p className="form-error" role="alert">{error||loadError} <button onClick={() => setVersion(value => value + 1)}>Refresh room</button></p>}
    {notice && <p className="practice-notice" role="status"><Check size={17} />{notice}</p>}
    {!room ? loading ? <p className="loading-state" role="status">Opening your practice room…</p> : null : <>
      <div className="workspace-title"><div><div className="eyebrow">{active ? 'PRACTICE IN PROGRESS' : 'PRACTICE ENDED'}</div><h1>{room.title}</h1><p>Text practice with a shared lesson board and responses. Updates automatically.</p></div><div className="practice-room-actions"><button className="icon-btn" aria-label="Refresh practice room" onClick={() => setVersion(value => value + 1)}><RefreshCw size={18} /></button>{room.canManage && active && <button className="outlined-btn danger-text" disabled={Boolean(busy)} onClick={endPractice}>End practice</button>}</div></div>
      <div className="practice-participants">{[[room.admin, 'Administrator · Teacher'], [room.student, 'Student']].map(([person, role]) => <div key={person.id}><img src={person.image || defaultAvatar} onError={imageFallback} alt="" /><span><strong>{person.name}{person.id === user.id ? ' (you)' : ''}</strong><small>{role}</small></span></div>)}<span className="practice-context"><ShieldCheck size={17} /> A practice session · No payment</span></div>
      {!active && <p className="practice-notice" role="status">This session has ended. Your saved board and responses remain available here.</p>}
      <div className="practice-room-grid"><section className="panel practice-board"><div className="panel-heading"><h2><BookOpen size={20} /> Lesson board</h2><span>{room.canManage ? 'Teacher controls' : 'Shared by your teacher'}</span></div>
        {room.canManage ? <><label className="sr-only" htmlFor="practice-notes">Lesson board</label><textarea id="practice-notes" value={notes} maxLength={12000} disabled={!active || Boolean(busy)} onChange={event => setNotes(event.target.value)} placeholder="Add a goal, a speaking prompt, a writing task, or a few helpful words…" rows={12} /><div className="practice-board-actions"><button className="dark-btn" disabled={!active || Boolean(busy) || notes === baseline.current.text} onClick={saveBoard}>{busy === 'saving' ? 'Saving…' : 'Save lesson board'} <Check size={17} /></button>{room.notesVersion !== baseline.current.version && <button className="mini-btn" onClick={() => { if (window.confirm('Replace your unsaved draft with the latest saved lesson board?')) { setNotes(room.notes); baseline.current = { id: room.id, text: room.notes, version: room.notesVersion }; } }}>Use latest notes</button>}</div><p className="field-hint">Save your changes to share them with the student.</p></> : <div className="practice-board-content">{room.notes || 'Your teacher will add a practice prompt here.'}</div>}
        <p className="practice-tip">Try an introduction, a travel scenario, or a short writing task. A meeting link can be included in the board when you want to speak live.</p>
      </section><section className="panel practice-responses"><div className="panel-heading"><h2>Practice responses</h2><span>{room.messages.length}</span></div><div className="practice-thread" aria-live="polite" aria-label="Practice responses">{!room.messages.length && <p className="empty-inline">Start with a little hello or respond to the lesson board.</p>}{room.messages.map(message => <article className={`practice-message ${message.senderId === user.id ? 'mine' : ''}`} key={message.id}><div><strong>{message.senderName}</strong><small>{message.senderRole === 'admin' ? 'Teacher' : 'Student'}</small></div><p>{message.body}</p><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time></article>)}<div ref={threadEnd} /></div>
        <form ref={composer} onSubmit={send}><label htmlFor="practice-response">Your response</label><textarea id="practice-response" value={draft} maxLength={4000} rows={3} disabled={!active || busy === 'ending'} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); composer.current?.requestSubmit(); } }} placeholder={active ? 'Try the prompt, ask a question, or share feedback…' : 'This practice session has ended.'} /><button className="dark-btn" disabled={!active || Boolean(busy) || !draft.trim()}>{busy === 'sending' ? 'Sending…' : 'Send response'} <Send size={17} /></button><p className="field-hint">Ctrl + Enter to send. Enter starts a new line.</p></form>
      </section></div>
      <section className="panel practice-join"><label htmlFor="practice-join-link">Join link<input id="practice-join-link" ref={linkInput} value={link} readOnly onFocus={event => event.target.select()} /></label><button className="outlined-btn" onClick={copyLink}><Copy size={17} /> Copy join link</button><p className="field-hint">Open this link while signed in as the selected student or instructor. Each person uses their own account.</p></section>
    </>}
  </div>;
}
