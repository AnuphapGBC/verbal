import React, { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Globe2, Star, Heart, Check, SlidersHorizontal, Search, CheckCircle2, MessageCircle, Sparkles } from 'lucide-react';
import { api, imageFallback } from './api.js';

const image = (id, width = 600) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;
const languages = [
  { name: 'English', flag: '🇬🇧' }, { name: 'Spanish', flag: '🇪🇸' },
  { name: 'French', flag: '🇫🇷' }, { name: 'German', flag: '🇩🇪' },
  { name: 'Italian', flag: '🇮🇹' }, { name: 'Japanese', flag: '🇯🇵' },
];

function Hero({ language, setLanguage, browse }) {
  return <section className="hero">
    <div className="hero-copy">
      <div className="eyebrow"><span className="little-star" aria-hidden="true">✳</span> NEW LANGUAGE. NEW POSSIBILITIES.</div>
      <h1>A little conversation.<br />A whole <span className="underlined">new world.<svg aria-hidden="true" viewBox="0 0 420 16" preserveAspectRatio="none"><path d="M3 11 Q190 -2 414 9 M25 15 Q230 5 394 14" /></svg></span></h1>
      <p>Connect with a tutor who gets you.<br />Learn a language. Open up your world.</p>
      <div className="hero-search">
        <label htmlFor="hero-language">I want to learn
          <select id="hero-language" value={language} onChange={event => setLanguage(event.target.value)}>
            <option value="">Choose a language</option>{languages.map(item => <option key={item.name}>{item.name}</option>)}
          </select><ChevronDown size={18} aria-hidden="true" />
        </label>
        <button className="dark-btn" onClick={() => browse()}>Find my tutor <ArrowRight size={19} /></button>
      </div>
      <div className="hero-proof"><span className="note-icon hero-proof-icon"><MessageCircle size={18} /></span><div><div className="stars"><span>Built for real connection</span></div><small>Your next chapter starts with a hello.</small></div></div>
    </div>
    <div className="hero-art" aria-label="A world of conversation">
      <div className="art-orbit" /><span className="art-spark" aria-hidden="true">✳</span>
      <div className="portrait portrait-one"><img src={image('photo-1534528741775-53994a69daeb', 800)} alt="Smiling person, illustrative portrait" /><div className="portrait-label"><span>🇪🇸</span> ¡Hola! <span aria-hidden="true">✦</span></div></div>
      <div className="portrait portrait-two"><img src={image('photo-1500648767791-00dcc994a43e', 800)} alt="Smiling person, illustrative portrait" /><div className="portrait-label"><span>🇬🇧</span> Hello! <span aria-hidden="true">✦</span></div></div>
      <div className="floating-note"><span className="note-icon"><Check size={18} /></span> A real connection.<br /><strong>Real progress.</strong></div>
      <svg className="art-doodle" aria-hidden="true" viewBox="0 0 100 100"><path d="M5 20 Q100 0 60 70 Q20 110 28 50 Q30 20 83 88 M65 84 L85 90 L86 68" /></svg>
    </div>
  </section>;
}

function TutorCard({ tutor, saved, saving, onSave, onTutor }) {
  const firstName = tutor.name.split(' ')[0];
  return <article className="tutor-card">
    <div className="tutor-photo">
      <button className="tutor-image-button" aria-label={`View ${tutor.name}'s profile`} onClick={() => onTutor(tutor)}>
        {tutor.image ? <img src={tutor.image} onError={imageFallback} alt={`${tutor.name}, ${tutor.language} tutor${tutor.isDemo ? ' (sample profile)' : ''}`} /> : <span className="tutor-initials">{tutor.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</span>}
      </button>
      <span className="super-tag"><span aria-hidden="true">✦</span> {tutor.isDemo ? 'Sample profile' : 'Independent tutor'}</span>
      <button className={`heart-button ${saved ? 'saved' : ''}`} disabled={saving} aria-label={`${saved ? 'Unsave' : 'Save'} ${tutor.name}`} aria-pressed={saved} onClick={() => onSave(tutor.id)}><Heart size={20} fill={saved ? 'currentColor' : 'none'} /></button>
      <button className="intro-play" aria-label={`Read about ${tutor.name}`} onClick={() => onTutor(tutor)}><ArrowUpRight size={17} /></button><span className="photo-caption">{tutor.language} with {firstName}</span>
    </div>
    <div className="tutor-info">
      <div className="tutor-name"><h3><button onClick={() => onTutor(tutor)}>{tutor.name}</button> <span aria-label={tutor.country}>{tutor.flag}</span></h3>
        {Number(tutor.reviews) > 0 ? <span className="rating"><Star size={13} fill="currentColor" /> {Number(tutor.rating).toFixed(1)} <small>({tutor.reviews}{tutor.isDemo ? ' sample' : ''})</small></span> : <span className="rating"><small>New tutor</small></span>}
      </div>
      <div className="tutor-specialty">{tutor.tag}</div><p className="tutor-speaks">Speaks {tutor.native}</p>
      <div className="tutor-bottom"><span><strong>${tutor.price}</strong><small> / 50-min lesson</small></span><button onClick={() => onTutor(tutor)}>Meet {firstName} <ArrowUpRight size={17} /></button></div>
    </div>
  </article>;
}

function HowItWorks({ browse }) {
  const steps = [
    { n: '01', title: 'Find your kind of person', text: 'Explore tutors, get to know their style, and find someone you can see yourself talking to.' },
    { n: '02', title: 'Make your first connection', text: 'Choose an available lesson. Share your goals and agree on a plan that fits your life.' },
    { n: '03', title: 'Turn “one day” into today', text: 'Keep showing up. Have real conversations. Watch your confidence find its voice.' },
  ];
  return <><section id="how-it-works" className="how-section section-wrap"><div className="how-intro"><div className="eyebrow">A SMALL STEP. A BIG BEGINNING.</div><h2>Your world gets<br />bigger from here.</h2><p>No perfect pronunciation required.<br />Just a little curiosity. We’ll take it from there.</p><button className="dark-btn" onClick={() => browse()}>Let’s find your tutor <ArrowRight size={18} /></button></div><div className="steps">{steps.map(step => <div className="step" key={step.n}><span>{step.n}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></div>)}</div></section>
    <section className="bottom-cta"><span className="cta-star" aria-hidden="true">✳</span><div><h2>The world is full of people.<br />Let’s start a conversation.</h2><p>Your first hello could lead anywhere.</p></div><button className="dark-btn" onClick={() => browse()}>Find my tutor <ArrowUpRight size={20} /></button></section></>;
}

export default function Home({ user, onAuth, onTutor, notice }) {
  const [language, setLanguage] = useState('');
  const [budget, setBudget] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [saved, setSaved] = useState([]);
  const [saving, setSaving] = useState(null);
  const [tutors, setTutors] = useState([]);
  const [counts, setCounts] = useState([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    if (!user) { setSaved([]); setSavedOnly(false); return; }
    api('/saved').then(data => { if (active) setSaved(data.tutorIds); }).catch(err => { if (active) notice(err.message); });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (language) params.set('language', language);
    if (budget) params.set('maxPrice', budget);
    if (query) params.set('search', query);
    if (savedOnly && user) params.set('saved', 'true');
    setLoading(true); setError(''); setOffset(0);
    api(`/tutors?${params}`).then(data => {
      if (active) { setTutors(data.tutors); setCounts(data.languages || []); }
    }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [language, budget, query, savedOnly, user?.id, version]);

  const browse = next => {
    if (next !== undefined) setLanguage(next);
    document.getElementById('tutors')?.scrollIntoView({ behavior: 'smooth' });
  };
  const toggleSave = async id => {
    if (!user) { onAuth(); return; }
    setSaving(id);
    const isSaved = saved.includes(id);
    try {
      await api(`/saved/${id}`, { method: isSaved ? 'DELETE' : 'PUT' });
      setSaved(current => isSaved ? current.filter(item => item !== id) : [...current, id]);
      if (savedOnly) setVersion(value => value + 1);
      notice(isSaved ? 'Tutor removed from your saved list.' : 'Tutor saved to your account.');
    } catch (err) { notice(err.message); } finally { setSaving(null); }
  };
  const resetFilters = () => { setLanguage(''); setBudget(''); setSearch(''); setQuery(''); setSavedOnly(false); };
  const visible = tutors.length > 3 ? [...tutors.slice(offset), ...tutors.slice(0, offset)].slice(0, 3) : tutors;
  const allLanguages = [...new Set([...languages.map(item => item.name), ...counts.map(item => item.name)])];

  return <main>
    <Hero language={language} setLanguage={setLanguage} browse={browse} />
    <section className="benefit-strip" aria-label="Learning benefits"><span><CheckCircle2 /> Your goals. Your kind of tutor.</span><span><Globe2 /> A world of languages to explore</span><span><MessageCircle /> Real people. Real conversations.</span><span><Sparkles /> Learn on your terms</span></section>
    <section className="languages section-wrap"><div className="section-heading"><div><div className="eyebrow">GO WHERE YOUR CURIOSITY TAKES YOU</div><h2>What will you say next?</h2></div><button className="text-link" onClick={() => { resetFilters(); browse(''); }}>Explore tutors <ArrowUpRight size={18} /></button></div><div className="language-grid">{languages.map(item => <button className={`language-card ${language === item.name ? 'selected' : ''}`} key={item.name} onClick={() => browse(item.name)}><span className="flag" aria-hidden="true">{item.flag}</span><span><strong>{item.name}</strong><small>Explore {item.name.toLowerCase()} tutors</small></span><ArrowUpRight size={18} /></button>)}</div></section>
    <section id="tutors" className="tutors-section section-wrap"><div className="section-heading"><div><div className="eyebrow">GOOD PEOPLE. GREAT CONVERSATIONS.</div><h2>Meet your next “I did it!”</h2><p>A personal approach. A little chemistry that changes everything.</p></div><div className="carousel-controls"><button aria-label="Previous tutors" disabled={loading || tutors.length < 4} onClick={() => setOffset(value => (value - 1 + tutors.length) % tutors.length)}><ChevronLeft size={20} /></button><button aria-label="Next tutors" disabled={loading || tutors.length < 4} onClick={() => setOffset(value => (value + 1) % tutors.length)}><ChevronRight size={20} /></button></div></div>
      <div className="filters"><div className="filter-select"><Globe2 size={16} /><select aria-label="Filter by language" value={language} onChange={event => setLanguage(event.target.value)}><option value="">All languages</option>{allLanguages.map(item => <option key={item}>{item}</option>)}</select></div><div className="filter-select"><SlidersHorizontal size={16} /><select aria-label="Maximum lesson price" value={budget} onChange={event => setBudget(event.target.value)}><option value="">Any price</option><option value="25">Up to $25</option><option value="30">Up to $30</option><option value="50">Up to $50</option><option value="100">Up to $100</option></select></div><button className={`save-filter ${savedOnly ? 'active' : ''}`} aria-pressed={savedOnly} onClick={() => { if (!user) onAuth(); else setSavedOnly(value => !value); }}><Heart size={16} fill={savedOnly ? 'currentColor' : 'none'} /> Saved tutors{saved.length > 0 ? ` (${saved.length})` : ''}</button><label className="tutor-search"><Search size={15} /><input type="search" aria-label="Search tutor names or interests" value={search} placeholder="Name or interest" maxLength={100} onChange={event => setSearch(event.target.value)} /></label></div>
      {error ? <div className="empty-state" role="alert"><h3>We couldn’t load the tutors</h3><p>{error}</p><button className="dark-btn" onClick={() => setVersion(value => value + 1)}>Try again <ArrowRight size={17} /></button></div> : loading ? <div className="tutor-grid tutor-loading" aria-busy="true" role="status" aria-label="Loading tutors">{[0, 1, 2].map(item => <div className="tutor-card tutor-skeleton" key={item}><div className="tutor-photo" /><div className="skeleton-line" /><div className="skeleton-line short" /><div className="skeleton-line" /></div>)}</div> : visible.length ? <div className="tutor-grid">{visible.map(tutor => <TutorCard key={tutor.id} tutor={tutor} saved={saved.includes(tutor.id)} saving={saving === tutor.id} onSave={toggleSave} onTutor={onTutor} />)}</div> : <div className="empty-state" role="status"><Search size={28} /><h3>{savedOnly ? 'Your favorites start here' : 'No tutors match these filters'}</h3><p>{savedOnly ? 'Tap the heart on a tutor profile to save them to your account.' : 'Try another language, search, or price limit.'}</p><button className="dark-btn" onClick={resetFilters}>Explore all tutors <ArrowRight size={17} /></button></div>}
      <div className="tutors-bottom"><p>There’s a tutor for the way <em>you</em> learn.</p><button className="outlined-btn" onClick={() => { if (language || budget || query || savedOnly) resetFilters(); else if (tutors.length > 3) setOffset(value => (value + 3) % tutors.length); else browse(''); }}>Discover more tutors <ArrowRight size={18} /></button></div>
      <p className="marketplace-note">Profiles marked “Sample profile” are illustrative, including their reviews and availability. Reservations with them are for testing.</p>
    </section>
    <HowItWorks browse={browse} />
  </main>;
}
