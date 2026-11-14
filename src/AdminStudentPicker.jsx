import React, { useEffect, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { api, defaultAvatar, imageFallback } from './api';

export default function AdminStudentPicker({ onSelect }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [students, setStudents] = useState([]);
  const [nextOffset, setNextOffset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setOffset(0); }, 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    if (!offset) setStudents([]);
    api(`/admin/students?${new URLSearchParams({ search: query, offset })}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(data.students)) throw new Error('The student list could not be loaded.');
      setStudents(current => offset ? [...current, ...data.students] : data.students);
      setNextOffset(data.hasMore ? data.nextOffset : null);
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, offset, version]);
  return <div className="practice-student-picker"><label>Find a student<span className="practice-search"><Search size={18} /><input type="search" value={search} maxLength={100} placeholder="Search by name or email" onChange={event => setSearch(event.target.value)} /></span></label>
    {error && <p className="form-error" role="alert">{error} <button onClick={() => setVersion(value => value + 1)}>Try again</button></p>}
    <ul className="practice-students">{students.map(student => <li key={student.id}><img src={student.image || defaultAvatar} onError={imageFallback} alt="" width="44" height="44" /><div><strong>{student.name}</strong><small>{student.email}{student.isTest ? ' · Test account' : ''}</small></div><button className="outlined-btn" type="button" aria-label={`Choose ${student.name}`} onClick={() => onSelect(student)}>Choose <ArrowRight size={16} /></button></li>)}</ul>
    {loading && <p className="muted" role="status">Finding students…</p>}
    {!loading && !error && !students.length && <p className="empty-inline">No students match this search.</p>}
    {nextOffset !== null && !error && <button className="outlined-btn" disabled={loading} onClick={() => setOffset(nextOffset)}>Load more students</button>}
  </div>;
}
