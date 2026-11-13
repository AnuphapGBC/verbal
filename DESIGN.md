# Verbal interface

## Direction

Verbal is a welcoming place to practice languages with another person. The design should feel like a friendly language club: warm cream paper, forest and teal text/actions, coral and yellow accents, clear conversation imagery, and comfortable reading sizes. It keeps its own identity rather than reproducing Preply's promotional layout.

The existing home, lesson dashboard, and sign-in screen supplied the functional reference. Their main usability problems were small labels, hidden tutors inside a carousel, a generic workspace, and too many competing decorative treatments. Browser reference access was unavailable, so the redesign is based on the actual app structure and task requirements.

## Tasks and hierarchy

- Home: pick a language, scan understandable tutor profiles, compare prices, open a profile. Show all matching tutors through explicit load-more controls; do not hide discovery inside a carousel.
- Booking: understand the tutor and price, pick a local date/time, optionally share a goal, and confirm a pay-later reservation. Keep sample-profile disclosures visible.
- Learner space: show the next real lesson and its actions before secondary counts. Empty accounts get concrete first steps.
- Teaching: publish a profile, add available times, and manage booked lessons. Explain timezone and 50-minute duration at the point of entry.
- Admin: clearly separate privileged actions and show readable tables. Pausing a listing must explain what happens to existing lessons.

## Shared rules

- Body text starts at 16px, supporting labels at 13–14px; use meaningful labels, not placeholders alone.
- Use consistent semantic colors, 44px touch targets, visible keyboard focus, native form controls, and reduced-motion support.
- Support narrow 320px screens without page-level horizontal scrolling. Tables may scroll inside labelled containers; navigation becomes a clearly labelled mobile bar.
- Loading, empty, error, and successful states must explain the next useful action. Never invent activity, statistics, progress, reviews, or tutor verification.
- Use Manrope for headings, DM Sans for body, and DM Serif Display sparingly for expressive editorial accents. System fonts remain usable if external fonts do not load.
- Preserve real API behavior, secure sessions, database ownership boundaries, test accounts, and pay-later reservations.
