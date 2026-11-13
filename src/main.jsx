import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, ArrowRight, CalendarDays, CheckCircle2, GraduationCap, Menu, MessageCircle, Settings, X } from 'lucide-react';
import { api } from './api';
import Home from './Home';
import Auth from './Auth';
import TutorProfile from './TutorProfile';
import Dashboard from './Dashboard';
import Messages from './Messages';
import Teaching from './Teaching';
import Account from './Account';
import './styles.css';
import './workspace.css';
import './reviews.css';

const pages = ['dashboard', 'messages', 'teaching', 'settings'];
const currentPage = () => pages.find(page => location.hash === `#/${page}`) || 'home';

function Modal({ open, onClose, label, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (open && !ref.current.open) ref.current.showModal();
    if (!open && ref.current.open) ref.current.close();
  }, [open]);
  return <dialog ref={ref} aria-label={label} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><button className="modal-close" aria-label="Close dialog" onClick={onClose}><X size={22} /></button>{children}</dialog>;
}

function App() {
  const [page, setPage] = useState(currentPage);
  const [user, setUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [mobile, setMobile] = useState(false);
  const [modal, setModal] = useState(null);
  const [auth, setAuth] = useState(null);
  const [notice, setNotice] = useState('');
  const [conversation, setConversation] = useState(null);
  const [bookingsVersion, setBookingsVersion] = useState(0);
  useEffect(() => { const change = () => { setPage(currentPage()); setMobile(false); }; window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  async function refreshSession() {
    setSessionError('');
    try { const data = await api('/session'); setUser(data.user); }
    catch (err) { setSessionError(err.message); }
    finally { setSessionLoading(false); }
  }
  useEffect(() => { refreshSession(); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer); }, [notice]);
  const navigate = target => { location.hash = target === 'home' ? '/' : `/${target}`; setPage(target); setMobile(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const browse = () => { setModal(null); navigate('home'); requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('tutors')?.scrollIntoView({ behavior: 'smooth' }))); };
  const howItWorks = event => { event.preventDefault(); navigate('home'); requestAnimationFrame(() => requestAnimationFrame(() => { location.hash = 'how-it-works'; document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }); })); };
  const teach = () => { navigate('teaching'); if (!user) setAuth({ reason: 'Create an account or log in to publish your tutor profile.' }); };
  const message = value => {
    setConversation(value.tutorId ? value : { tutorId: value.id, tutorName: value.name, tutorImage: value.image, learnerId: user.id });
    setModal(null); navigate('messages');
  };
  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); setUser(null); setModal(null); setConversation(null); navigate('home'); setNotice('You’re logged out. See you next time.'); }
    catch (err) { setNotice(err.message); }
  }
  const workspace = page !== 'home';
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="header">
      <a className="brand" href="#/" onClick={() => navigate('home')} aria-label="Verbal home">verbal<span className="brand-mark">✳</span></a>
      <nav aria-label="Main navigation" className={mobile ? 'nav mobile-open' : 'nav'}>
        <button onClick={browse}>Find a tutor</button>
        <a href="#how-it-works" onClick={howItWorks}>How it works</a>
        <button onClick={teach}>{user?.role === 'tutor' ? 'Teaching space' : 'Become a tutor'} <ArrowUpRight size={15} /></button>
      </nav>
      <div className="header-right">
        <span className="locale">English · USD</span>
        {sessionLoading ? <span className="muted">Loading…</span> : <button className="login" onClick={() => user ? navigate('dashboard') : setAuth({})}>{user ? 'My space' : 'Log in'} <ArrowUpRight size={16} /></button>}
        <button className="mobile-menu" aria-label="Toggle navigation" aria-expanded={mobile} onClick={() => setMobile(!mobile)}>{mobile ? <X /> : <Menu />}</button>
      </div>
    </header>
    {sessionError && <div className="connection-error" role="alert">{sessionError} <button onClick={refreshSession}>Retry connection</button></div>}
    <div id="main-content" tabIndex={-1}>
      {workspace ? <main className="workspace"><nav className="workspace-nav" aria-label="Your workspace"><button className={page === 'dashboard' ? 'active' : ''} onClick={() => navigate('dashboard')}><CalendarDays size={17} /> My lessons</button><button className={page === 'messages' ? 'active' : ''} onClick={() => navigate('messages')}><MessageCircle size={17} /> Messages</button><button className={page === 'teaching' ? 'active' : ''} onClick={teach}><GraduationCap size={18} /> {user?.role === 'tutor' ? 'Teaching' : 'Become a tutor'}</button><button className={page === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}><Settings size={17} /> Settings</button></nav>
        {sessionLoading ? <p className="loading-state" role="status">Loading your account…</p> : !user ? <div className="workspace-page"><div className="empty-state"><MessageCircle size={36} /><h1>Your next chapter starts here.</h1><p>Log in or create an account to manage lessons and connect with tutors.</p><button className="dark-btn" onClick={() => setAuth({})}>Log in or sign up <ArrowRight size={18} /></button></div></div> : <>
          {page === 'dashboard' && <Dashboard key={bookingsVersion} user={user} onBrowse={browse} onMessage={message} notify={setNotice} />}
          {page === 'messages' && <Messages user={user} initialConversation={conversation} onBrowse={browse} />}
          {page === 'teaching' && <Teaching user={user} onUserChanged={refreshSession} onMessage={message} notify={setNotice} />}
          {page === 'settings' && <Account user={user} onUpdated={setUser} onLogout={logout} onDeleted={() => { setUser(null); setConversation(null); navigate('home'); setNotice('Your account and associated data have been deleted.'); }} notify={setNotice} />}
        </>}
      </main> : <Home user={user} onAuth={() => setAuth({ reason: 'Log in or create an account to save tutors and plan your lessons.' })} onTutor={tutor => setModal({ type: 'tutor', tutor })} onTeach={teach} onDashboard={() => navigate('dashboard')} notice={setNotice} />}
    </div>
    <footer><a className="brand" href="#/" onClick={() => navigate('home')}>verbal<span className="brand-mark">✳</span></a><span>A world of conversation.</span><small>© {new Date().getFullYear()} Verbal · Lessons, on your terms</small><a href="#how-it-works" onClick={howItWorks}>How it works <ArrowUpRight size={14} /></a></footer>
    <Modal open={!!modal} label="Tutor profile and booking" onClose={() => setModal(null)}>{modal?.type === 'tutor' && <TutorProfile key={modal.tutor.id} tutor={modal.tutor} user={user} onAuth={() => setAuth({ reason: 'Log in or create an account to reserve a lesson or message your tutor.' })} onMessage={message} onBooked={() => setBookingsVersion(value => value + 1)} onDashboard={() => { setModal(null); navigate('dashboard'); }} />}</Modal>
    <Modal open={!!auth} label="Log in or create a Verbal account" onClose={() => setAuth(null)}>{auth && <Auth reason={auth.reason} onSuccess={value => { setUser(value); setAuth(null); setNotice(`Welcome, ${value.name.split(' ')[0]}!`); }} />}</Modal>
    {notice && <div className="toast" role="status"><CheckCircle2 size={20} />{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
