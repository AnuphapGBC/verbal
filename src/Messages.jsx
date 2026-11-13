import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { api, imageFallback, defaultAvatar } from './api';
import './forms.css';

const conversationKey = conversation => conversation ? `${conversation.tutorId}-${conversation.learnerId || 'self'}` : '';

export default function Messages({ user, initialConversation, onBrowse }) {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(initialConversation || null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(!!initialConversation);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState({});
  const [sending, setSending] = useState(false);
  const [version, setVersion] = useState(0);
  const end = useRef(null);
  const composer = useRef(null);
  const key = conversationKey(selected);
  const latestKey = useRef(key);
  latestKey.current = key;
  const body = drafts[key] || '';
  useEffect(() => { if (initialConversation) setSelected(initialConversation); }, [initialConversation]);
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const data = await api('/conversations', { signal: controller.signal });
        if (!controller.signal.aborted) { setConversations(data.conversations); setListError(''); }
      } catch (err) { if (err.name !== 'AbortError') setListError(err.message); }
      finally { if (!controller.signal.aborted) setListLoading(false); }
    }
    refresh(); const interval = setInterval(refresh, 20000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [version]);
  useEffect(() => { setMessages([]); setError(''); }, [key]);
  useEffect(() => {
    if (!selected) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true); setError('');
    async function refresh(first = false) {
      try {
        const params = new URLSearchParams({ tutorId: selected.tutorId });
        if (selected.learnerId) params.set('learnerId', selected.learnerId);
        const data = await api(`/messages?${params}`, { signal: controller.signal });
        if (!controller.signal.aborted) { setMessages(data.messages); setError(''); }
      } catch (err) { if (err.name !== 'AbortError') setError(err.message); }
      finally { if (!controller.signal.aborted && first) setLoading(false); }
    }
    refresh(true); const interval = setInterval(refresh, 10000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [key, version]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' }); }, [messages.length]);
  async function send(event) {
    event.preventDefault(); if (!body.trim() || sending || !selected) return;
    const sendingKey = key;
    const text = body.trim();
    const payload = { tutorId: selected.tutorId, body: text };
    if (selected.learnerId) payload.learnerId = selected.learnerId;
    setSending(true); setError('');
    try {
      const data = await api('/messages', { method: 'POST', body: payload });
      setDrafts(current => current[sendingKey]?.trim() === text ? { ...current, [sendingKey]: '' } : current);
      if (latestKey.current === sendingKey) setMessages(current => current.some(message => message.id === data.message.id) ? current : [...current, data.message]);
      try { const dataList = await api('/conversations'); setConversations(dataList.conversations); setListError(''); }
      catch (err) { setListError(err.message); }
    } catch (err) { if (latestKey.current === sendingKey) setError(err.message); }
    finally { setSending(false); }
  }
  function composerKey(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      if (!sending && body.trim()) composer.current?.requestSubmit();
    }
  }
  const displayName = conversation => conversation.learnerId && conversation.learnerId !== user.id ? conversation.learnerName || conversation.tutorName : conversation.tutorName;
  return <div className="workspace-page"><div className="workspace-title"><div><div className="eyebrow">A PLACE TO SAY HELLO</div><h1>Your conversations</h1><p>Ask a question, share your goals, or plan your next lesson.</p></div><button className="icon-btn" aria-label="Refresh conversations" onClick={() => setVersion(value => value + 1)}><RefreshCw size={18} /></button></div>
    <div className={`messages-workspace ${selected ? 'conversation-open' : ''}`}><aside className="conversation-list"><h2>Messages</h2>{listLoading && <p className="message-loading-list" role="status">Opening your conversations…</p>}{listError && <p className="form-error message-load-error" role="alert">{listError} <button onClick={() => setVersion(value => value + 1)}>Try again</button></p>}{!listLoading && !listError && !conversations.length && <p className="empty-inline">No conversations yet. Open a tutor profile and send a friendly hello.</p>}{conversations.map(conversation => <button key={conversationKey(conversation)} className={key === conversationKey(conversation) ? 'selected' : ''} aria-current={key === conversationKey(conversation) ? 'true' : undefined} onClick={() => setSelected(conversation)}><img src={conversation.tutorImage || defaultAvatar} onError={imageFallback} alt="" /><span><strong>{displayName(conversation)}</strong><small>{conversation.lastMessage || 'Start a conversation'}</small><time className="conversation-preview-time" dateTime={conversation.updatedAt}>{new Date(conversation.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time></span></button>)}</aside>
      <section className="conversation-detail">{!selected ? <div className="empty-state"><MessageCircle size={38} /><h2>Good things start with hello.</h2><p>Choose a conversation on the left, or find a tutor you’d like to meet.</p><button className="dark-btn" onClick={onBrowse}>Meet the tutors</button></div> : <><div className="conversation-heading"><button className="icon-btn back-conversations" aria-label="Back to all messages" onClick={() => setSelected(null)}><ArrowLeft size={19} /></button><img src={selected.tutorImage || defaultAvatar} onError={imageFallback} alt="" /><div><h2>{displayName(selected)}</h2><small>A private conversation · Updates automatically</small></div></div><div className="message-thread" aria-live="polite" aria-label={`Messages with ${displayName(selected)}`}>{loading && !messages.length ? <p className="loading-state" role="status">Opening your conversation…</p> : !loading && !error && !messages.length && <p className="empty-inline">Break the ice. What would you like to learn?</p>}{messages.map(message => <div className={`message-bubble ${message.senderId === user.id ? 'mine' : ''}`} key={message.id}><p>{message.body}</p><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></div>)}<div ref={end} /></div>{error && <p className="form-error message-load-error" role="alert">{error} <button onClick={() => setVersion(value => value + 1)}>Try again</button></p>}<form ref={composer} className="message-composer" onSubmit={send}><label className="sr-only" htmlFor="message-body">Your message</label><textarea id="message-body" maxLength={4000} value={body} onChange={event => setDrafts(current => ({ ...current, [key]: event.target.value }))} onKeyDown={composerKey} rows={2} required placeholder="Write a little hello…" /><button className="dark-btn" disabled={sending || !body.trim()} aria-label={sending ? 'Sending your message' : 'Send message'}>{sending ? 'Sending…' : <Send size={19} />}</button></form><p className="message-keyboard-hint">Enter to send · Shift + Enter for a new line. Your draft stays here when you switch conversations.</p><p className="message-privacy">Please keep passwords and payment details out of your messages.</p></>}</section>
    </div></div>;
}
