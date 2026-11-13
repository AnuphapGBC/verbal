import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, ChevronDown, Compass, GraduationCap, HeartHandshake, LogOut, Menu, MessageCircle, Settings, ShieldCheck, X } from 'lucide-react';
import Brand from './Brand';

const homePage=user=>user?.role==='admin'?'admin':user?.role==='tutor'?'teaching':'dashboard';
const firstName=user=>user?.name?.split(' ')[0]||'friend';

export function Header({user,loading,workspace,onNavigate,onBrowse,onTeach,onHelp,onLogin,onLogout}) {
  const [menuOpen,setMenuOpen]=useState(false);
  const menuButton=useRef(null);
  const header=useRef(null);
  const account=useRef(null);
  const run=action=>{setMenuOpen(false);if(account.current)account.current.open=false;action();};
  useEffect(()=>{
    function outside(event){if(!header.current?.contains(event.target)){setMenuOpen(false);if(account.current)account.current.open=false;}}
    function keydown(event){
      if(event.key!=='Escape')return;
      if(account.current?.open){account.current.open=false;account.current.querySelector('summary')?.focus();}
      else if(menuOpen){setMenuOpen(false);menuButton.current?.focus();}
    }
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',keydown);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keydown);};
  },[menuOpen]);
  return <header className={`site-header${workspace?' site-header-workspace':''}`} ref={header}>
    <div className="header-inner">
      <Brand onClick={()=>run(()=>onNavigate('home'))}/>
      <span className="header-divider" aria-hidden="true"/>
      <nav id="primary-navigation" aria-label="Main navigation" className={`nav-main${menuOpen?' is-open':''}`}>
        <button onClick={()=>run(onBrowse)}><Compass size={17}/> Find a tutor</button>
        <button onClick={()=>run(onHelp)}>How it works</button>
        <button onClick={()=>run(onTeach)}>{user?.role==='tutor'?'Your teaching space':'Teach on Verbal'}</button>
        <span className="mobile-menu-note"><HeartHandshake size={17}/> A little practice. A world of possibility.</span>
      </nav>
      <div className="header-actions">
        {loading?<span className="header-loading" role="status">Loading…</span>:user?<details className="account-menu" ref={account}>
          <summary><span className="account-avatar">{firstName(user).slice(0,1).toUpperCase()}</span><span className="account-label">My space</span><ChevronDown size={16}/></summary>
          <div className="account-dropdown"><div className="account-greeting"><strong>Hi, {firstName(user)}.</strong><small>Good to have you here.</small></div>
            <button onClick={()=>run(()=>onNavigate(homePage(user)))}><BookOpen size={17}/> Open my space</button>
            <button onClick={()=>run(()=>onNavigate('messages'))}><MessageCircle size={17}/> Messages</button>
            <button onClick={()=>run(()=>onNavigate('settings'))}><Settings size={17}/> Account settings</button>
            <button className="logout-action" onClick={()=>run(onLogout)}><LogOut size={17}/> Log out</button>
          </div>
        </details>:<><button className="header-login" onClick={()=>run(()=>onLogin('login'))}>Log in</button><button className="dark-btn header-start" onClick={()=>run(()=>onLogin('register'))}>Get started <ArrowRight size={16}/></button></>}
        <button ref={menuButton} className="mobile-menu-button icon-btn" aria-label={menuOpen?'Close menu':'Open menu'} aria-controls="primary-navigation" aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<X size={23}/>:<Menu size={23}/>}</button>
      </div>
    </div>
  </header>;
}

export function WorkspaceNav({user,page,onNavigate,onTeach,onBrowse}) {
  const items=[...(user?.role==='admin'?[{page:'admin',label:'Admin overview',mobile:'Admin',icon:ShieldCheck}]:[]),
    {page:'dashboard',label:'My lessons',mobile:'Lessons',icon:CalendarDays},
    {page:'messages',label:'Messages',mobile:'Messages',icon:MessageCircle},
    {page:'teaching',label:user?.role==='tutor'?'Teaching':'Start teaching',mobile:'Teaching',icon:GraduationCap},
    {page:'settings',label:'Account settings',mobile:'Settings',icon:Settings}];
  return <aside className="workspace-sidebar"><div className="workspace-sidebar-inner">
    <div className="space-label"><span className="eyebrow">YOUR VERBAL SPACE</span><span>Make yourself at home.</span></div>
    <nav className="workspace-nav" aria-label="Your workspace">{items.map(item=><button key={item.page} className={page===item.page?'active':''} aria-current={page===item.page?'page':undefined} onClick={()=>item.page==='teaching'?onTeach():onNavigate(item.page)}><item.icon size={21}/><span className="desktop-nav-label">{item.label}</span><span className="mobile-nav-label">{item.mobile}</span>{page===item.page&&<span className="nav-active-dot" aria-hidden="true"/>}</button>)}</nav>
    <div className="sidebar-note"><span className="sidebar-note-icon"><MessageCircle size={24}/></span><h2>One hello can<br/>change your day.</h2><p>Find a tutor who makes you feel at home.</p><button onClick={onBrowse}>Meet your next tutor <ArrowRight size={17}/></button></div>
    <div className="sidebar-signature">Little by little.<br/><span>You’ll find your words.</span></div>
  </div></aside>;
}

export function Footer({workspace,onNavigate,onBrowse,onTeach,onHelp}) {
  return <footer className={`site-footer${workspace?' site-footer-workspace':''}`}><div className="footer-inner">
    <div className="footer-brand"><Brand onClick={()=>onNavigate('home')} compact/><p>Learn a language.<br/>Feel a little more connected.</p></div>
    <nav aria-label="Footer navigation"><button onClick={onBrowse}>Find a tutor</button><button onClick={onHelp}>How it works</button><button onClick={onTeach}>Teach on Verbal</button></nav>
    <div className="footer-note"><span><HeartHandshake size={18}/> Made for human connection.</span><small>© {new Date().getFullYear()} Verbal · English · USD</small></div>
  </div></footer>;
}
