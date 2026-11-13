import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronDown, Clock3, Globe2, Heart, MessageCircle, Plus, Search, Sparkles, Star, X } from 'lucide-react';
import { api, imageFallback } from './api.js';
import './home.css';

const image = (id, width = 600) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;
const languages = [
  { name: 'English', flag: '🇬🇧', greeting: 'Hello' }, { name: 'Spanish', flag: '🇪🇸', greeting: 'Hola' },
  { name: 'French', flag: '🇫🇷', greeting: 'Bonjour' }, { name: 'German', flag: '🇩🇪', greeting: 'Hallo' },
  { name: 'Italian', flag: '🇮🇹', greeting: 'Ciao' }, { name: 'Japanese', flag: '🇯🇵', greeting: 'こんにちは' },
];

function ConversationPoster() {
  return <div className="home-poster">
    <div className="home-poster-heading"><span><span className="home-poster-dot" /> THE CONVERSATION CLUB</span><Sparkles size={22} aria-hidden="true" /></div>
    <div className="home-poster-title">A little hello.<br /><em>A lot of possibility.</em></div>
    <div className="home-poster-people" aria-label="Illustrative conversation between two people">
      <div className="home-person home-person-first"><img src={image('photo-1534528741775-53994a69daeb')} onError={imageFallback} alt="Smiling person, illustrative portrait" /><span className="home-person-name">a new perspective <ArrowUpRight size={17} /></span></div>
      <div className="home-person home-person-second"><img src={image('photo-1500648767791-00dcc994a43e', 500)} onError={imageFallback} alt="Smiling person, illustrative portrait" /><span className="home-person-name">a friendly face <MessageCircle size={17} /></span></div>
      <div className="home-hello home-hello-first" aria-hidden="true">¡Hola! <span>✳</span></div>
      <div className="home-hello home-hello-second" aria-hidden="true">Hello there. <span>↗</span></div>
      <svg className="home-poster-line" viewBox="0 0 100 100" aria-hidden="true"><path d="M8 17C80 7 106 66 64 77C26 88 24 33 79 41M70 30l13 10-10 13" /></svg>
    </div>
    <div className="home-poster-footer"><BookOpen size={20} aria-hidden="true" /><span>You don’t have to be perfect to begin.</span><small>Illustrative portraits</small></div>
  </div>;
}

function Hero({ language, setLanguage, browse }) {
  return <section className="home-hero home-wrap" aria-labelledby="home-title"><div className="home-hero-copy">
    <p className="home-eyebrow"><span className="home-eyebrow-mark"><MessageCircle size={15} /></span> LESS PRESSURE. MORE CONVERSATION.</p>
    <h1 id="home-title">A new language.<br />A little more <em>you.</em></h1>
    <p className="home-hero-intro">For the places you’ll go. The people you’ll meet. And the confidence to say a little more.</p>
    <p className="home-hero-description">Find a tutor who makes learning feel like a conversation.</p>
    <form className="home-start" onSubmit={event => { event.preventDefault(); browse(); }}><label htmlFor="home-language">What would you like to learn?<span className="home-select-wrap"><Globe2 size={19} aria-hidden="true" /><select id="home-language" value={language} onChange={event => setLanguage(event.target.value)}><option value="">Choose a language</option>{languages.map(item => <option key={item.name}>{item.name}</option>)}</select><ChevronDown size={18} aria-hidden="true" /></span></label><button className="home-primary" type="submit">Find my tutor <ArrowRight size={19} /></button></form>
    <div className="home-hero-reassurance"><span><Check size={16} /> All levels welcome</span><span><Check size={16} /> Learn at your pace</span></div>
  </div><ConversationPoster /></section>;
}

function LanguageRail({ language, browse, counts }) {
  return <section className="home-language-section home-wrap" aria-labelledby="home-languages-title"><div className="home-language-heading"><h2 id="home-languages-title">Where would you like to begin?</h2><span>One hello can take you anywhere.</span></div><div className="home-language-rail">{languages.map(item => {
    const count = counts.find(entry => entry.name === item.name)?.count;
    return <button key={item.name} className={`home-language-chip ${language === item.name ? 'is-selected' : ''}`} aria-pressed={language === item.name} onClick={() => browse(item.name)}><span className="home-language-flag" aria-hidden="true">{item.flag}</span><span><strong>{item.name}</strong><small>{item.greeting}</small></span>{count !== undefined && <span className="home-language-count" aria-label={`${count} ${count === 1 ? 'tutor' : 'tutors'}`}>{count}</span>}<ArrowUpRight size={16} aria-hidden="true" /></button>;
  })}</div></section>;
}

function TutorCard({ tutor, saved, saving, onSave, onTutor }) {
  const isTest = tutor.name.startsWith('Test ');
  const badge = tutor.isDemo ? 'Sample profile' : isTest ? 'Test profile' : 'Community tutor';
  const initials = tutor.name.split(' ').map(part => part[0]).filter(Boolean).slice(0, 2).join('');
  return <article className="coach-card"><div className="coach-card-top"><span className={`coach-badge ${tutor.isDemo || isTest ? 'coach-badge-sample' : ''}`}>{badge}</span><button className={`coach-save ${saved ? 'is-saved' : ''}`} disabled={saving} aria-label={`${saved ? 'Remove' : 'Save'} ${tutor.name}${saved ? ' from saved tutors' : ' to saved tutors'}`} aria-pressed={saved} onClick={() => onSave(tutor.id)}><Heart size={20} fill={saved ? 'currentColor' : 'none'} /></button></div>
    <div className="coach-identity"><button className="coach-photo" onClick={() => onTutor(tutor)} aria-label={`View ${tutor.name}'s profile`}>{tutor.image ? <img loading="lazy" src={tutor.image} onError={imageFallback} alt={`${tutor.name}, ${tutor.language} tutor`} /> : <span aria-hidden="true">{initials}</span>}</button><div className="coach-name"><p><span aria-hidden="true">{tutor.flag}</span> {tutor.language}</p><h3><button onClick={() => onTutor(tutor)}>{tutor.name}</button></h3>{Number(tutor.reviews) > 0 ? <div className="coach-rating"><Star size={14} fill="currentColor" aria-hidden="true" /><strong>{Number(tutor.rating).toFixed(1)}</strong><span>({tutor.reviews}{tutor.isDemo ? ' sample' : ' reviews'})</span></div> : <span className="coach-new">New to Verbal</span>}</div></div>
    <div className="coach-story"><h4>{tutor.tag}</h4><p>{tutor.bio}</p></div><p className="coach-speaks"><Globe2 size={16} aria-hidden="true" /><span><strong>Speaks</strong> {tutor.native}</span></p>
    <div className="coach-bottom"><div className="coach-price"><strong>${tutor.price}<span> USD</span></strong><small>per 50-minute lesson</small></div><button className="coach-profile" onClick={() => onTutor(tutor)}>View profile <ArrowUpRight size={18} /></button></div>
  </article>;
}

function TutorSkeleton() {
  return <div className="coach-card coach-skeleton" aria-hidden="true"><div className="coach-skeleton-pill" /><div className="coach-skeleton-identity"><div /><span /></div><div className="coach-skeleton-line" /><div className="coach-skeleton-line" /><div className="coach-skeleton-line coach-skeleton-short" /><div className="coach-skeleton-footer" /></div>;
}

function HowItWorks({ browse }) {
  const steps = [
    { number: '01', Icon: Search, title: 'Find someone you click with', text: 'Browse introductions, compare lesson prices, and save the tutors you’d like to meet.' },
    { number: '02', Icon: CalendarDays, title: 'Choose a time for you', text: 'Pick an available 50-minute lesson. Times are shown in your local timezone.' },
    { number: '03', Icon: MessageCircle, title: 'Make the first hello', text: 'Message your tutor, share your goals, and arrange how you’ll meet. Then take it one conversation at a time.' },
  ];
  return <section id="how-it-works" className="home-how home-wrap" aria-labelledby="home-how-title"><div className="home-section-heading"><div><p className="home-eyebrow">SMALL STEPS. YOUR OWN PACE.</p><h2 id="home-how-title">New here? You’re in<br /><em>good company.</em></h2></div><p>No perfect pronunciation needed.<br />Just bring a little curiosity.</p></div><ol className="home-steps">{steps.map(({ number, Icon, title, text }) => <li key={number}><div className="home-step-top"><span className="home-step-icon"><Icon size={24} /></span><span className="home-step-number">{number}</span></div><h3>{title}</h3><p>{text}</p></li>)}</ol><div className="home-how-bottom"><span><Clock3 size={18} /> Make room for a little progress.</span><button className="home-text-button" onClick={() => browse()}>Let’s find your tutor <ArrowRight size={18} /></button></div></section>;
}

function Questions() {
  const questions = [
    { question: 'Do I need to know any of the language already?', answer: 'You can start wherever you are. Read a tutor’s introduction to find someone whose approach suits you, then send a message about your current level and goals before reserving.' },
    { question: 'How do lesson payments work?', answer: 'Reservations on Verbal are pay later. We don’t collect card details or process payments. Talk with your tutor about payment arrangements before your lesson.' },
    { question: 'Where does my lesson happen?', answer: 'Use your private conversation with your tutor to agree on how you’ll meet. Verbal helps you find, schedule, and manage lessons; it does not include a video classroom.' },
    { question: 'Can I change my plans?', answer: 'Yes. You can cancel a future lesson from My lessons before its start time. To choose another time, cancel the original reservation and book an available slot.' },
  ];
  return <section className="home-faq home-wrap" aria-labelledby="home-faq-title"><div><p className="home-eyebrow">A FEW THINGS TO KNOW</p><h2 id="home-faq-title">A little clarity<br />before your <em>hello.</em></h2><p>Learning something new comes with questions. Here’s a place to start.</p></div><div className="home-questions">{questions.map(item => <details key={item.question}><summary>{item.question}<Plus size={19} aria-hidden="true" /></summary><p>{item.answer}</p></details>)}</div></section>;
}

export default function Home({ user, onAuth, onTutor, notice }) {
  const [language, setLanguage] = useState('');
  const [budget, setBudget] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [saved, setSaved] = useState([]);
  const [saving, setSaving] = useState([]);
  const [tutors, setTutors] = useState([]);
  const [counts, setCounts] = useState([]);
  const [visibleCount, setVisibleCount] = useState(6);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    if (!user) { setSaved([]); setSavedOnly(false); return; }
    api('/saved', { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(data.tutorIds)) throw new Error('Your saved tutors could not be loaded. Please try again.');
      setSaved(data.tutorIds);
    }).catch(err => { if (!controller.signal.aborted && err.name !== 'AbortError') notice(err.message); });
    return () => controller.abort();
  }, [user?.id]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (language) params.set('language', language);
    if (budget) params.set('maxPrice', budget);
    if (query) params.set('search', query);
    if (savedOnly && user) params.set('saved', 'true');
    setLoading(true); setError(''); setVisibleCount(6);
    api(`/tutors?${params}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(data.tutors) || (data.languages != null && !Array.isArray(data.languages))) {
        throw new Error('Tutor information could not be read. Please try again.');
      }
      setTutors(data.tutors);
      setCounts(data.languages ?? []);
    }).catch(err => { if (!controller.signal.aborted && err.name !== 'AbortError') setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [language, budget, query, savedOnly, user?.id, version]);

  const browse = next => { if (next !== undefined) setLanguage(next); const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; document.getElementById('tutors')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' }); };
  async function toggleSave(id) {
    if (!user) { onAuth(); return; }
    const isSaved = saved.includes(id);
    setSaving(current => [...current, id]);
    try {
      await api(`/saved/${id}`, { method: isSaved ? 'DELETE' : 'PUT' });
      setSaved(current => isSaved ? current.filter(item => item !== id) : [...new Set([...current, id])]);
      if (savedOnly) setVersion(value => value + 1);
      notice(isSaved ? 'Tutor removed from your saved list.' : 'Tutor saved. You can find them under Saved tutors.');
    } catch (err) { notice(err.message); }
    finally { setSaving(current => current.filter(item => item !== id)); }
  }
  const clearSearch = () => { setSearch(''); setQuery(''); };
  const resetFilters = () => { setLanguage(''); setBudget(''); clearSearch(); setSavedOnly(false); };
  const hasFilters = language || budget || query || savedOnly;
  const visible = tutors.slice(0, visibleCount);
  const allLanguages = [...new Set([...languages.map(item => item.name), ...counts.map(item => item.name)])];

  return <main className="home-page"><Hero language={language} setLanguage={setLanguage} browse={browse} />
    <div className="home-benefits"><div className="home-wrap"><span><MessageCircle size={20} /> Real people. Your kind of practice.</span><span><CalendarDays size={20} /> Choose a time that fits your life.</span><span><Heart size={20} /> Find your kind of learning.</span></div></div>
    <LanguageRail language={language} browse={browse} counts={counts} />
    <section id="tutors" className="browse-section" aria-labelledby="browse-title"><div className="home-wrap">
      <div className="home-section-heading"><div><p className="home-eyebrow"><span className="home-mini-mark">↗</span> YOUR PEOPLE ARE OUT THERE</p><h2 id="browse-title">A good tutor.<br />An even better <em>connection.</em></h2></div><p>Different personalities. Different approaches.<br />Find someone who feels right for you.</p></div>
      <div className="browse-filter-panel"><div className="browse-fields"><label>Language<span><Globe2 size={18} /><select value={language} onChange={event => setLanguage(event.target.value)}><option value="">All languages</option>{allLanguages.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={16} /></span></label><label>Lesson budget<span><span className="browse-dollar" aria-hidden="true">$</span><select value={budget} onChange={event => setBudget(event.target.value)}><option value="">Any price</option><option value="25">Up to $25 USD</option><option value="30">Up to $30 USD</option><option value="50">Up to $50 USD</option><option value="100">Up to $100 USD</option></select><ChevronDown size={16} /></span></label><label className="browse-search-label">Search tutors<span><Search size={18} /><input type="search" value={search} placeholder="Name or profile headline" maxLength={100} onChange={event => setSearch(event.target.value)} /></span></label><button className={`browse-saved ${savedOnly ? 'is-selected' : ''}`} aria-pressed={savedOnly} onClick={() => { if (!user) onAuth(); else setSavedOnly(value => !value); }}><Heart size={18} fill={savedOnly ? 'currentColor' : 'none'} /> Saved tutors{saved.length > 0 && <span>{saved.length}</span>}</button></div>
        {hasFilters && <div className="browse-active" aria-label="Active filters">{language && <button aria-label={`Remove ${language} language filter`} onClick={() => setLanguage('')}>{language}<X size={14} /></button>}{budget && <button aria-label="Remove lesson budget filter" onClick={() => setBudget('')}>Up to ${budget}<X size={14} /></button>}{query && <button aria-label="Clear search" onClick={clearSearch}>“{query}”<X size={14} /></button>}{savedOnly && <button aria-label="Show all tutors instead of saved tutors" onClick={() => setSavedOnly(false)}>Saved only<X size={14} /></button>}<button className="browse-reset" onClick={resetFilters}>Clear all filters</button></div>}
      </div>
      <div className="browse-results-heading"><p aria-live="polite" aria-atomic="true">{loading ? 'Finding your people…' : error ? 'Let’s try that again.' : <><strong>{tutors.length}</strong> {tutors.length === 1 ? 'tutor' : 'tutors'}{savedOnly ? ' in your saved list' : language ? ` for ${language}` : ' to get to know'}</>}</p><span><Clock3 size={15} /> 50-minute lessons · Prices in USD</span></div>
      {error ? <div className="browse-empty" role="alert"><span className="browse-empty-icon"><Globe2 size={30} /></span><h3>We couldn’t load the tutors.</h3><p>{error}</p><button className="home-primary" onClick={() => setVersion(value => value + 1)}>Try again <ArrowRight size={18} /></button></div> : loading ? <div className="coach-grid" aria-busy="true" role="status" aria-label="Loading tutor profiles">{[0, 1, 2].map(item => <TutorSkeleton key={item} />)}</div> : visible.length ? <div className="coach-grid">{visible.map(tutor => <TutorCard key={tutor.id} tutor={tutor} saved={saved.includes(tutor.id)} saving={saving.includes(tutor.id)} onSave={toggleSave} onTutor={onTutor} />)}</div> : <div className="browse-empty" role="status"><span className="browse-empty-icon">{savedOnly ? <Heart size={30} /> : <Search size={30} />}</span><h3>{savedOnly ? 'Make a little shortlist.' : 'No matches just yet.'}</h3><p>{savedOnly ? 'Tap the heart on any tutor to save their profile. You can come back when you’re ready.' : 'Try a different language, a wider budget, or a shorter search. Your person could be one click away.'}</p><button className="home-primary" onClick={resetFilters}>Explore all tutors <ArrowRight size={18} /></button></div>}
      {!loading && !error && tutors.length > visibleCount && <div className="browse-more"><span>Showing {visible.length} of {tutors.length} tutors</span><button className="home-secondary" onClick={() => setVisibleCount(value => value + 6)}>Show more tutors <ArrowDown size={18} /></button></div>}
      <p className="browse-sample-note"><BookOpen size={17} /><span>Just exploring? Profiles marked <strong>Sample</strong> or <strong>Test</strong> let you try the experience. They don’t offer real lessons.</span></p>
    </div></section>
    <HowItWorks browse={browse} /><Questions />
    <section className="home-invitation home-wrap"><div className="home-invitation-symbol" aria-hidden="true"><MessageCircle /><span>hello.</span></div><div><p className="home-eyebrow">A SMALL FIRST STEP</p><h2>Something good starts<br />with a <em>conversation.</em></h2><p>There’s no perfect time. There’s just your time.</p></div><button className="home-primary" onClick={() => browse()}>Find my tutor <ArrowRight size={20} /></button></section>
  </main>;
}
