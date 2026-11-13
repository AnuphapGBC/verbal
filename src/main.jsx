import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, CheckCircle2, MessageCircle, X } from 'lucide-react';
import { api } from './api';
import { Header, WorkspaceNav, Footer } from './Shell';
import Home from './Home';
import Auth from './Auth';
import TutorProfile from './TutorProfile';
import Dashboard from './Dashboard';
import Messages from './Messages';
import Teaching from './Teaching';
import Account from './Account';
import Admin from './Admin';
import './styles.css';
import './workspace.css';
import './reviews.css';

const pages = ['dashboard', 'messages', 'teaching', 'settings', 'admin'];
const currentPage = () => pages.find(page => location.hash === `#/${page}`) || 'home';
const pageTitles = { home:'Find your language tutor', dashboard:'My lessons', messages:'Messages', teaching:'Teaching', settings:'Account settings', admin:'Administration' };

function Modal({ open, onClose, label, className='', children }) {
  const ref = useRef(null);
  useEffect(() => {
    if(open && !ref.current.open) ref.current.showModal();
    if(!open && ref.current.open) ref.current.close();
  }, [open]);
  useEffect(() => {
    if(!open) return;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    return()=>{document.body.style.overflow=previous;};
  }, [open]);
  return <dialog ref={ref} className={`app-dialog ${className}`} aria-label={label}
    onCancel={event=>{event.preventDefault();onClose();}}
    onClick={event=>{if(event.target===event.currentTarget) onClose();}}>
    <button className="modal-close" aria-label="Close dialog" onClick={onClose}><X size={22}/></button>
    {children}
  </dialog>;
}

function App() {
  const [page,setPage]=useState(currentPage);
  const [user,setUser]=useState(null);
  const [sessionLoading,setSessionLoading]=useState(true);
  const [sessionError,setSessionError]=useState('');
  const [modal,setModal]=useState(null);
  const [auth,setAuth]=useState(null);
  const [notice,setNotice]=useState('');
  const [conversation,setConversation]=useState(null);
  const [bookingsVersion,setBookingsVersion]=useState(0);
  const content=useRef(null);

  useEffect(()=>{const change=()=>setPage(currentPage());window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
  useEffect(()=>{document.title=`${pageTitles[page]} · Verbal`;},[page]);
  async function refreshSession() {
    setSessionError('');
    try{const data=await api('/session');setUser(data.user);}
    catch(error){setSessionError(error.message);}
    finally{setSessionLoading(false);}
  }
  useEffect(()=>{refreshSession();},[]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(timer);},[notice]);
  function navigate(target) {
    location.hash=target==='home'?'/':`/${target}`;setPage(target);
    window.scrollTo({top:0,behavior:'auto'});
    requestAnimationFrame(()=>content.current?.focus({preventScroll:true}));
  }
  function browse() {
    setModal(null);navigate('home');
    requestAnimationFrame(()=>requestAnimationFrame(()=>document.getElementById('tutors')?.scrollIntoView({behavior:'auto'})));
  }
  function howItWorks(event) {
    event?.preventDefault();navigate('home');
    requestAnimationFrame(()=>requestAnimationFrame(()=>document.getElementById('how-it-works')?.scrollIntoView({behavior:'auto'})));
  }
  function teach() {navigate('teaching');if(!user)setAuth({reason:'Create an account to start your tutor profile.'});}
  function message(value) {
    if(!user){setAuth({reason:'Log in to start a conversation.'});return;}
    setConversation(value.tutorId?value:{tutorId:value.id,tutorName:value.name,tutorImage:value.image,learnerId:user.id});
    setModal(null);navigate('messages');
  }
  async function logout() {
    try{await api('/auth/logout',{method:'POST'});setUser(null);setModal(null);setConversation(null);navigate('home');setNotice('You’re logged out. See you next time.');}
    catch(error){setNotice(error.message);}
  }
  const workspace=page!=='home';
  return <>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <Header user={user} loading={sessionLoading} workspace={workspace} onNavigate={navigate} onBrowse={browse}
      onTeach={teach} onHelp={howItWorks} onLogin={initialMode=>setAuth({initialMode})} onLogout={logout}/>
    {sessionError&&<div className="connection-error" role="alert"><span>{sessionError}</span><button onClick={refreshSession}>Try connecting again <ArrowRight size={16}/></button></div>}
    <div id="main-content" ref={content} tabIndex={-1}>
      {workspace?<main className="workspace">
        <WorkspaceNav user={user} page={page} onNavigate={navigate} onTeach={teach} onBrowse={browse}/>
        <div className="workspace-content">
          {sessionLoading?<div className="loading-state" role="status">Getting your space ready…</div>:!user?
            <section className="workspace-page"><div className="welcome-gate"><span className="welcome-gate-icon"><MessageCircle size={32}/></span><div className="eyebrow">YOUR OWN LITTLE CORNER OF VERBAL</div><h1>A little hello.<br/>A fresh start.</h1><p>Sign in to see your lessons, talk with your tutor, and keep your learning in one place.</p><button className="dark-btn" onClick={()=>setAuth({})}>Log in or create an account <ArrowRight size={18}/></button><button className="text-link" onClick={browse}>I’d like to explore tutors first</button></div></section>:<>
            {page==='dashboard'&&<Dashboard key={bookingsVersion} user={user} onBrowse={browse} onMessage={message} notify={setNotice}/>}
            {page==='admin'&&<Admin user={user} notify={setNotice}/>}
            {page==='messages'&&<Messages user={user} initialConversation={conversation} onBrowse={browse}/>}
            {page==='teaching'&&<Teaching user={user} onUserChanged={refreshSession} onMessage={message} notify={setNotice}/>}
            {page==='settings'&&<Account user={user} onUpdated={setUser} onLogout={logout} onDeleted={()=>{setUser(null);setConversation(null);navigate('home');setNotice('Your account and associated data have been deleted.');}} notify={setNotice}/>}
          </>}
        </div>
      </main>:<Home user={user} onAuth={()=>setAuth({reason:'Save your favorite tutors and keep your plans in one place.'})}
        onTutor={tutor=>setModal({type:'tutor',tutor})} onTeach={teach} onDashboard={()=>navigate('dashboard')} notice={setNotice}/>}
    </div>
    <Footer workspace={workspace} onNavigate={navigate} onBrowse={browse} onTeach={teach} onHelp={howItWorks}/>
    <Modal open={!!modal} className="tutor-dialog" label="Tutor profile and lesson booking" onClose={()=>setModal(null)}>
      {modal?.type==='tutor'&&<TutorProfile key={modal.tutor.id} tutor={modal.tutor} user={user}
        onAuth={()=>setAuth({reason:'Log in to reserve this time. Your selection will stay right here.'})}
        onMessage={message} onBooked={()=>setBookingsVersion(value=>value+1)} onDashboard={()=>{setModal(null);navigate('dashboard');}}/>}
    </Modal>
    <Modal open={!!auth} className="auth-dialog" label="Log in or create an account" onClose={()=>setAuth(null)}>
      {auth&&<Auth initialMode={auth.initialMode||'login'} reason={auth.reason} onSuccess={value=>{
        setUser(value);setAuth(null);
        if(!modal&&value.role==='admin')navigate('admin');
        setNotice(`You’re in, ${value.name.split(' ')[0]}. Welcome!`);
      }}/>}
    </Modal>
    {notice&&<div className="toast" role="status"><CheckCircle2 size={22}/><span>{notice}</span><button aria-label="Dismiss notification" onClick={()=>setNotice('')}><X size={18}/></button></div>}
  </>;
}
createRoot(document.getElementById('root')).render(<App/>);
