import React from 'react';

export default function Brand({ onClick, compact=false }) {
  return <a className={`brand${compact?' brand-compact':''}`} href="#/" onClick={event=>{event.preventDefault();onClick?.();}} aria-label="Verbal home">
    <svg className="brand-symbol" width="38" height="38" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M4 11a8 8 0 0 1 8-8h15a8 8 0 0 1 8 8v8a8 8 0 0 1-8 8H15l-8 6v-8a8 8 0 0 1-3-6v-8Z" fill="currentColor"/>
      <circle cx="14" cy="15" r="2" fill="#faf8f1"/><circle cx="23" cy="15" r="2" fill="#faf8f1"/>
      <path d="M25 25h9a4 4 0 0 1 4 4v4l-5-2h-8a4 4 0 0 1-4-4 4 4 0 0 1 4-2Z" fill="#e88966"/>
    </svg>
    <span>verbal<span className="brand-period">.</span></span>
  </a>;
}
