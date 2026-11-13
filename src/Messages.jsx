import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { api, imageFallback, defaultAvatar } from './api';

export default function Messages({ user, initialConversation, onBrowse }) {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(initialConversation || null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [version, setVersion] = useState(0);
  const end = useRef(null);
  useEffect(() => { if (initialConversation) setSelected(initialConversation); }, [initialConversation]);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try { const data = await api('/conversations'); if (active) { setConversations(data.conversations); setListError(''); } }
      catch (err) { if (active) setListError(err.message); }
    }
    refresh(); const interval = setInterval(refresh, 20000);
    return () => { active = false; clearInterval(interval); };
  }, [version]);
  useEffect(() => {
    if (!selected) { setLoading(false); return; }
    let active = true; setLoading(true); setError(''); setMessages([]); setBody('');
    async function refresh(first = false) {
      try {
        const params = new URLSearchParams({ tutorId: selected.tutorId });
        if (selected.learnerId) params.set('learnerId', selected.learnerId);
        const data = await api(`/messages?${params}`);
        if (active) { setMessages(data.messages); setError(''); }
      } catch (err) { if (active) setError(err.message); }
      finally { if (active && first) setLoading(false); }
    }
    refresh(true); const interval = setInterval(refresh, 10000);
    return () => { active = false; clearInterval(interval); };
  }, [selected?.tutorId, selected?.learnerId, version]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages.length]);
  async function send(event) {
    event.preventDefault(); if (!body.trim()) return; setSending(true); setError('');
    try {
      const payload = { tutorId: selected.tutorId, body: body.trim() };
      if (selected.learnerId) payload.learnerId = selected.learnerId;
      const data = await api('/messages', { method: 'POST', body: payload });
      setMessages(current => [...current, data.message]); setBody('');
      const dataList = await api('/conversations'); setConversations(dataList.conversations);
    } catch (err) { setError(err.message); }
    finally { setSending(false); }
  }
  const displayName = conversation => user.role === 'tutor' && conversation.learnerId !== user.id ? conversation.learnerName || conversation.tutorName : conversation.tutorName;
  return <div className="workspace-page"><div className="workspace-title"><div><div className="eyebrow">REAL CONNECTION STARTS HERE</div><h1>Conversations.</h1><p>Share your goals and plan your next lesson.</p></div><button className="icon-btn" aria-label="Refresh conversations" onClick={() => setVersion(value => value + 1)}><RefreshCw size={18} /></button></div>
    <div className={`messages-workspace ${selected ? 'conversation-open' : ''}`}><aside className="conversation-list"><h2>Your messages</h2>{listError && <p className="form-error" role="alert">{listError}</p>}{!conversations.length && <p className="empty-inline">No conversations yet. Visit a tutor profile to say hello.</p>}{conversations.map(conversation => <button key={`${conversation.tutorId}-${conversation.learnerId}`} className={selected?.tutorId === conversation.tutorId && selected?.learnerId === conversation.learnerId ? 'selected' : ''} onClick={() => setSelected(conversation)}><img src={conversation.tutorImage || defaultAvatar} onError={imageFallback} alt="" /><span><strong>{displayName(conversation)}</strong><small>{conversation.lastMessage || 'Start a conversation'}</small></span></button>)}</aside>
      <section className="conversation-detail">{!selected ? <div className="empty-state"><MessageCircle size={35} /><h2>A little hello goes a long way.</h2><p>Choose a conversation or meet someone new.</p><button className="dark-btn" onClick={onBrowse}>Find a tutor</button></div> : <><div className="conversation-heading"><button className="icon-btn back-conversations" aria-label="Back to conversations" onClick={() => setSelected(null)}><ArrowLeft size={19} /></button><img src={selected.tutorImage || defaultAvatar} onError={imageFallback} alt="" /><div><h2>{displayName(selected)}</h2><small>Private conversation · Refreshes automatically</small></div></div><div className="message-thread" aria-live="polite" aria-label="Conversation messages">{loading ? <p className="loading-state" role="status">Loading conversation…</p> : !messages.length && <p className="empty-inline">Say hello. Share what you’d love to learn.</p>}{messages.map(message => <div className={`message-bubble ${message.senderId === user.id ? 'mine' : ''}`} key={message.id}><p>{message.body}</p><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></div>)}<div ref={end} /></div>{error && <p className="form-error" role="alert">{error}</p>}<form className="message-composer" onSubmit={send}><label className="sr-only" htmlFor="message-body">Your message</label><textarea id="message-body" maxLength={4000} value={body} onChange={event => setBody(event.target.value)} rows={2} required placeholder="Write a message…" /><button className="dark-btn" disabled={sending || !body.trim()} aria-label="Send message">{sending ? 'Sending…' : <Send size={19} />}</button></form><p className="message-privacy">Messages are stored in your Verbal account. Never share passwords or payment details.</p></>}</section>
    </div></div>;
}
